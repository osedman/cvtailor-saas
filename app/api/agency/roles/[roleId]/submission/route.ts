/**
 * Client submission generation.
 *
 * POST { format: 'document'|'email'|'portal', recipients?: [{contact_id}], expires_days? }
 *
 * The scores in the snapshot are recomputed server-side HERE, at generation
 * time, from current database state — no score supplied by any client is ever
 * accepted, and a stale cache cannot leak because the cache is refreshed as
 * part of generating. The snapshot is immutable once written; recruiter_notes
 * never enter it. Portal recipients each get their own token (returned raw
 * exactly once, stored only as a sha256 hash).
 */

import { createHash, randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import {
  AgencyAccessError,
  agencyAdmin,
  assertWriter,
  getJobRole,
  requireAgencyContext,
  writeAudit,
} from "@/lib/agency/db"
import { getAppOrigin } from "@/lib/site-url"
import { recomputeAndStore } from "@/lib/agency/rescore"
import { probeAreasForClient } from "@/lib/agency/probes"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 60

const DEFAULT_EXPIRY_DAYS = 30
const MAX_EXPIRY_DAYS = 90

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const { data, error } = await auth.db
      .from("submissions")
      .select("id, format, engine_version, generated_at, snapshot")
      .eq("role_id", roleId)
      .order("generated_at", { ascending: false })
    if (error) throw error
    return NextResponse.json({ submissions: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    assertWriter(auth.ctx)

    const body = await req.json()
    const format = body?.format
    if (!["document", "email", "portal"].includes(format)) {
      return NextResponse.json({ error: "Invalid format" }, { status: 400 })
    }

    const role = await getJobRole(auth.db, auth.ctx, roleId)
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    const admin = agencyAdmin()

    const { data: decisions, error: decisionError } = await admin
      .from("recruiter_reviews")
      .select("candidate_id, decision, decision_note")
      .eq("role_id", roleId)
    if (decisionError) throw decisionError
    const shortlisted = (decisions ?? []).filter((d) => d.decision === "shortlist")
    if (shortlisted.length === 0) {
      return NextResponse.json({ error: "Nothing shortlisted yet" }, { status: 400 })
    }

    const { data: requirements } = await admin
      .from("requirements")
      .select("id, ref, text, weight")
      .eq("role_id", roleId)
      .order("sort_order")
    const requirementById = new Map((requirements ?? []).map((r) => [r.id, r]))

    // Build one snapshot entry per shortlisted candidate, on fresh scores.
    const entries = []
    for (const decision of shortlisted) {
      // Purge race: a candidate erased after being shortlisted throws inside
      // the rescore; omit them rather than rendering from stale data.
      let score
      try {
        score = await recomputeAndStore(admin, auth.ctx.agencyId, decision.candidate_id)
      } catch (raceError) {
        if (raceError instanceof AgencyAccessError) continue
        throw raceError
      }

      const [{ data: candidate }, { data: evidence }, { data: review }] = await Promise.all([
        admin
          .from("candidates")
          .select("id, ref, full_name, current_title, years, location, redacted")
          .eq("id", decision.candidate_id)
          .maybeSingle(),
        admin
          .from("candidate_evidence")
          .select("requirement_id, strength, quote, origin")
          .eq("candidate_id", decision.candidate_id),
        admin
          .from("candidate_reviews")
          .select("status, notes, call_answers, availability, salary_confirm")
          .eq("candidate_id", decision.candidate_id)
          .maybeSingle(),
      ])

      if (!candidate) continue

      const strengths = (evidence ?? [])
        .filter((e) => (score.effective[e.requirement_id] ?? e.strength) === "strong" && e.quote)
        .slice(0, 5)
        .map((e) => ({
          requirement: requirementById.get(e.requirement_id)?.text ?? "",
          quote: e.quote,
        }))
      const gaps = (requirements ?? [])
        .filter((r) => (score.effective[r.id] ?? "missing") === "missing")
        .map((r) => ({ requirement: r.text, weight: r.weight }))

      entries.push({
        ref: candidate.ref,
        full_name: candidate.full_name,
        current_title: candidate.current_title,
        years: candidate.years,
        location: candidate.location,
        redacted: candidate.redacted,
        overall: score.overall,
        original_overall: score.original_overall,
        categories: {
          requirement_coverage: score.requirement_coverage,
          evidence_strength: score.evidence_strength,
          seniority_calibration: score.seniority_calibration,
          context_fit: score.context_fit,
          confidence_completeness: score.confidence_completeness,
        },
        must_have_hit: score.must_have_hit,
        must_have_total: score.must_have_total,
        confidence_level: score.confidence_level,
        reviewed: review?.status === "reviewed",
        availability: review?.availability ?? "",
        salary_confirm: review?.salary_confirm ?? "",
        // The recruiter's own words, written for the client. Never
        // recruiter_notes from the role (private) — this is the screening
        // narrative the recruiter chose to record.
        narrative: review?.notes ?? "",
        strengths,
        gaps,
        // "Suggested interview focus" in the client document: the questions
        // the recruiter actually put on the call script for this person,
        // resolved from call_answers keys back into readable text.
        probe_areas: probeAreasForClient(
          review?.call_answers as Record<string, string> | null,
          (requirements ?? []).map((r) => ({ ref: r.ref, text: r.text }))
        ),
      })
    }

    entries.sort((a, b) => b.overall - a.overall)

    /**
     * What the recruiter chose to disclose, frozen with everything else.
     * Applying these at render time would let a stored submission look
     * different later, which is exactly what an immutable snapshot exists to
     * prevent — so the choice is part of the record, not a view setting.
     */
    // The recruiter's greeting, written in their words, capped like every
    // other recruiter-typed field.
    const intro = typeof body?.intro === "string" ? body.intro.slice(0, 1200) : ""
    const d = (body?.disclosure ?? {}) as Record<string, unknown>
    const disclosure = {
      scores: d.scores !== false,
      evidence: d.evidence !== false,
      probes: d.probes !== false,
      notes: d.notes === true,
      logistics: d.logistics !== false,
    }

    const snapshot = {
      generated_at: new Date().toISOString(),
      disclosure,
      intro,
      role: {
        ref: role.ref,
        title: role.title,
        company: role.company,
        location: role.location,
        salary_band: role.salary_band,
      },
      shortlisted: entries,
      not_submitted_count: (decisions ?? []).filter((d) => d.decision !== "shortlist").length,
    }

    const { data: submission, error: subError } = await admin
      .from("submissions")
      .insert({
        agency_id: auth.ctx.agencyId,
        role_id: roleId,
        format,
        snapshot,
        engine_version: "v1",
        generated_by: auth.ctx.userId,
      })
      .select("id, generated_at")
      .single()
    if (subError) throw subError

    // Portal: one token per named recipient, raw value returned exactly once.
    const links: Array<{ contact_id: string; url: string; expires_at: string }> = []
    if (format === "portal" && Array.isArray(body?.recipients)) {
      const days = Math.min(MAX_EXPIRY_DAYS, Math.max(1, Number(body?.expires_days) || DEFAULT_EXPIRY_DAYS))
      const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
      for (const recipient of body.recipients.slice(0, 10)) {
        const contactId = recipient?.contact_id
        if (typeof contactId !== "string") continue
        const { data: contact } = await admin
          .from("client_contacts")
          .select("id, agency_id")
          .eq("id", contactId)
          .maybeSingle()
        if (!contact || contact.agency_id !== auth.ctx.agencyId) {
          throw new AgencyAccessError("contact not found in caller's agency")
        }
        const raw = randomBytes(24).toString("base64url")
        const { error: recError } = await admin.from("submission_recipients").insert({
          agency_id: auth.ctx.agencyId,
          submission_id: submission.id,
          contact_id: contactId,
          token_hash: createHash("sha256").update(raw).digest("hex"),
          expires_at: expiresAt,
        })
        if (recError) throw recError
        // Absolute, and built server-side on the consumer app origin. It was
        // relative, so the recruiter's clipboard inherited whatever host they
        // were standing on — which after the product split is the business
        // domain, and the portal is a client-facing doorway that lives with
        // the app. A copied link that resolves off-product is indistinguishable
        // from a broken one.
        links.push({
          contact_id: contactId,
          url: `${getAppOrigin()}/portal/${raw}`,
          expires_at: expiresAt,
        })
      }
    }

    await writeAudit(admin, {
      agencyId: auth.ctx.agencyId,
      roleId,
      actorId: auth.ctx.userId,
      entityType: "submission",
      entityRef: role.ref,
      action: "generated",
      toValue: { format, shortlisted: entries.length, recipients: links.length },
    })

    return NextResponse.json({ submission: { ...submission, snapshot }, links }, { status: 201 })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}
