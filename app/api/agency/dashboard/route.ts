/**
 * Agency home aggregation, in two layers.
 *
 * Judgment layer (what only the engine can say):
 *   next_calls    which screening call moves the needle most: the existing
 *                 scoring engine run in what if mode, flipping unconfirmed
 *                 must and important gaps to strong to see where a
 *                 confirming call would land each candidate
 *   client_heat   portal telemetry the product already records: shortlists
 *                 opened but not acted on, and never opened at all
 *   worth_a_look  candidates whose EXISTING assessments already cover most
 *                 of another OPEN role's core requirements. Boundary agreed
 *                 with Ose (7 Aug): open roles on both sides only, reuses
 *                 assessments already made (no re parse, no new processing),
 *                 surfaced as a suggestion and never auto added or screened.
 *
 * State layer: pipeline counts, compliance clocks, roles, audit activity.
 *
 * Every query runs through the user scoped client, so RLS does the tenancy
 * work and nothing here can reach another agency.
 */

import { NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { computeScore, type ScoringBaselines } from "@/lib/agency/scoring"
import type { Strength, Weight } from "@/lib/agency/types"

export const maxDuration = 30

const DAY = 86_400_000
const STOPWORDS = new Set(["the", "and", "with", "for", "into", "from", "that", "this", "have", "has", "using", "use", "used", "experience", "strong", "skills", "ability", "working", "work", "knowledge", "including", "such", "etc", "years", "year", "plus", "proven"])

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  )
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let hit = 0
  for (const w of a) if (b.has(w)) hit++
  return hit / Math.min(a.size, b.size)
}

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    const { db, ctx } = auth
    const now = Date.now()

    const [
      rolesRes,
      candidatesRes,
      reviewsRes,
      decisionsRes,
      actionsRes,
      allActionRecipientsRes,
      recipientsRes,
      noticesRes,
      rightsRes,
      auditRes,
      agencyRes,
      breakdownsRes,
      requirementsRes,
      submissionsRes,
      contactsRes,
    ] = await Promise.all([
      db.from("job_roles").select("id, ref, title, company, status, created_at, closed_at").eq("agency_id", ctx.agencyId).order("created_at", { ascending: false }),
      db.from("candidates").select("id, ref, full_name, role_id, parse_status, retention_expires_at").eq("agency_id", ctx.agencyId),
      db.from("candidate_reviews").select("candidate_id, status, communication, motivation").eq("agency_id", ctx.agencyId),
      db.from("recruiter_reviews").select("candidate_id, decision").eq("agency_id", ctx.agencyId),
      db.from("client_actions").select("id, candidate_ref, action, message, created_at, recipient_id").eq("agency_id", ctx.agencyId).order("created_at", { ascending: false }).limit(20),
      db.from("client_actions").select("recipient_id").eq("agency_id", ctx.agencyId).limit(500),
      db.from("submission_recipients").select("id, submission_id, contact_id, created_at, expires_at, revoked_at, first_opened_at, last_opened_at").eq("agency_id", ctx.agencyId),
      db.from("candidate_notices").select("candidate_id, status, scheduled_for").eq("agency_id", ctx.agencyId).eq("status", "scheduled"),
      db.from("rights_requests").select("id, candidate_ref, kind, status, requested_at").eq("agency_id", ctx.agencyId).eq("status", "pending"),
      db.from("audit_log").select("id, entity_type, entity_ref, action, created_at").eq("agency_id", ctx.agencyId).order("created_at", { ascending: false }).limit(12),
      db.from("agencies").select("name, retention_days, notice_delay_days").eq("id", ctx.agencyId).maybeSingle(),
      db.from("score_breakdowns").select("candidate_id, overall, original_overall, effective, baselines").eq("agency_id", ctx.agencyId),
      db.from("requirements").select("id, ref, text, weight, role_id").eq("agency_id", ctx.agencyId),
      db.from("submissions").select("id, role_id").eq("agency_id", ctx.agencyId),
      db.from("client_contacts").select("id, full_name, company").eq("agency_id", ctx.agencyId),
    ])

    const roles = rolesRes.data ?? []
    const candidates = candidatesRes.data ?? []
    const requirements = requirementsRes.data ?? []
    const openRoleIds = new Set(roles.filter((r) => r.status !== "closed").map((r) => r.id))
    const roleById = new Map(roles.map((r) => [r.id, r]))
    const reqsByRole = new Map<string, typeof requirements>()
    for (const req of requirements) {
      const list = reqsByRole.get(req.role_id) ?? []
      list.push(req)
      reqsByRole.set(req.role_id, list)
    }

    const reviewByCand = new Map((reviewsRes.data ?? []).map((r) => [r.candidate_id, r]))
    const decisionFor = new Map((decisionsRes.data ?? []).map((d) => [d.candidate_id, d.decision]))
    const breakdownByCand = new Map((breakdownsRes.data ?? []).map((b) => [b.candidate_id, b]))

    const live = candidates.filter((c) => openRoleIds.has(c.role_id) && c.parse_status !== "failed")
    const awaitingScreening = live.filter((c) => (reviewByCand.get(c.id)?.status ?? "unreviewed") !== "reviewed")
    const awaitingDecision = live.filter((c) => reviewByCand.get(c.id)?.status === "reviewed" && !decisionFor.get(c.id))

    // ---- Judgment 1: which call moves the needle -------------
    const nextCalls = awaitingScreening
      .map((c) => {
        const sb = breakdownByCand.get(c.id)
        const reqs = reqsByRole.get(c.role_id) ?? []
        if (!sb || reqs.length === 0) return null
        const effective = (sb.effective ?? {}) as Record<string, Strength>
        const stored = (sb.baselines ?? {}) as Partial<ScoringBaselines>
        const baselines: ScoringBaselines = {
          seniority: stored.seniority ?? 50,
          contextFit: stored.contextFit ?? 50,
          confidence: stored.confidence ?? 50,
          confidenceLevel: (stored.confidenceLevel ?? 2) as 1 | 2 | 3 | 4,
        }
        const review = reviewByCand.get(c.id)
        const whatIf: Record<string, Strength> = {}
        const gaps: Array<{ ref: string; weight: string }> = []
        for (const req of reqs) {
          const eff = effective[req.id] ?? "missing"
          if (req.weight !== "nice" && (eff === "missing" || eff === "partial")) {
            whatIf[req.id] = "strong"
            gaps.push({ ref: req.ref, weight: req.weight })
          } else {
            whatIf[req.id] = eff
          }
        }
        const potential = computeScore({
          requirements: reqs.map((r) => ({ id: r.id, ref: r.ref, weight: r.weight as Weight })),
          evidence: whatIf,
          overrides: {},
          baselines,
          softSignals: { communication: review?.communication ?? null, motivation: review?.motivation ?? null },
          reviewed: true,
        }).overall
        gaps.sort((a, b) => (a.weight === b.weight ? 0 : a.weight === "must" ? -1 : 1))
        return {
          id: c.id,
          ref: c.ref,
          full_name: c.full_name,
          role_id: c.role_id,
          role_title: roleById.get(c.role_id)?.title ?? "",
          current: Math.round(sb.overall),
          potential: Math.round(potential),
          uplift: Math.round(potential - sb.overall),
          gaps: gaps.slice(0, 3).map((g) => g.ref),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.uplift - a.uplift)
      .slice(0, 5)

    // ---- Judgment 2: client heat -----------------------------
    const actedRecipientIds = new Set((allActionRecipientsRes.data ?? []).map((a) => a.recipient_id))
    const contactById = new Map((contactsRes.data ?? []).map((c) => [c.id, c]))
    const submissionRole = new Map((submissionsRes.data ?? []).map((s) => [s.id, s.role_id]))
    const activeRecipients = (recipientsRes.data ?? []).filter(
      (r) => !r.revoked_at && new Date(r.expires_at).getTime() > now
    )
    const heatRow = (r: (typeof activeRecipients)[number]) => {
      const contact = contactById.get(r.contact_id)
      const roleId = submissionRole.get(r.submission_id)
      return {
        recipient_id: r.id,
        contact_name: contact?.full_name || "A client contact",
        company: contact?.company ?? "",
        role_title: roleId ? roleById.get(roleId)?.title ?? "" : "",
        sent_at: r.created_at,
        last_opened_at: r.last_opened_at,
      }
    }
    const openedSilent = activeRecipients
      .filter((r) => r.first_opened_at && !actedRecipientIds.has(r.id))
      .sort((a, b) => new Date(b.last_opened_at ?? 0).getTime() - new Date(a.last_opened_at ?? 0).getTime())
      .slice(0, 5)
      .map(heatRow)
    const neverOpened = activeRecipients
      .filter((r) => !r.first_opened_at)
      .slice(0, 5)
      .map(heatRow)

    // ---- Judgment 3: worth a look (open roles only) ----------
    const namesOnRole = new Map<string, Set<string>>()
    for (const c of candidates) {
      const set = namesOnRole.get(c.role_id) ?? new Set<string>()
      set.add(c.full_name.trim().toLowerCase())
      namesOnRole.set(c.role_id, set)
    }
    const reqTokens = new Map<string, Set<string>>()
    for (const req of requirements) reqTokens.set(req.id, tokens(req.text))

    const worthALook: Array<{
      candidate_id: string
      candidate_ref: string
      full_name: string
      from_role_id: string
      from_role_title: string
      to_role_id: string
      to_role_title: string
      covered: number
      total: number
    }> = []
    for (const c of live) {
      const sb = breakdownByCand.get(c.id)
      if (!sb) continue
      const effective = (sb.effective ?? {}) as Record<string, Strength>
      const ownReqs = reqsByRole.get(c.role_id) ?? []
      for (const target of roles) {
        if (target.id === c.role_id || target.status === "closed") continue
        if (namesOnRole.get(target.id)?.has(c.full_name.trim().toLowerCase())) continue
        const targetReqs = (reqsByRole.get(target.id) ?? []).filter((r) => r.weight !== "nice")
        if (targetReqs.length < 3) continue
        let covered = 0
        for (const tReq of targetReqs) {
          const tTok = reqTokens.get(tReq.id) ?? new Set<string>()
          for (const oReq of ownReqs) {
            const strength = effective[oReq.id]
            if (strength !== "strong" && strength !== "transferable") continue
            if (overlap(tTok, reqTokens.get(oReq.id) ?? new Set<string>()) >= 0.4) {
              covered++
              break
            }
          }
        }
        if (covered / targetReqs.length >= 0.6) {
          worthALook.push({
            candidate_id: c.id,
            candidate_ref: c.ref,
            full_name: c.full_name,
            from_role_id: c.role_id,
            from_role_title: roleById.get(c.role_id)?.title ?? "",
            to_role_id: target.id,
            to_role_title: target.title,
            covered,
            total: targetReqs.length,
          })
        }
      }
    }
    worthALook.sort((a, b) => b.covered / b.total - a.covered / a.total)

    // ---- State layer -----------------------------------------
    const noticesDue = (noticesRes.data ?? []).filter((n) => new Date(n.scheduled_for).getTime() <= now + 7 * DAY)
    const retentionSoon = candidates.filter(
      (c) => c.retention_expires_at && new Date(c.retention_expires_at).getTime() <= now + 30 * DAY
    )
    const candidateName = (ref: string) => candidates.find((c) => c.ref === ref)?.full_name ?? ref

    // ---- Where each role actually is --------------------------
    // The six step rail is the product's spine, but the dashboard never
    // showed it, so a role's position was invisible until you opened it.
    // Derived from data this route already loads: no extra queries.
    const submissionRoleIds = new Set((submissionsRes.data ?? []).map((s) => s.role_id))
    const recipientsByRole = new Map<string, typeof activeRecipients>()
    for (const r of activeRecipients) {
      const roleId = submissionRole.get(r.submission_id)
      if (!roleId) continue
      const list = recipientsByRole.get(roleId) ?? []
      list.push(r)
      recipientsByRole.set(roleId, list)
    }

    const roleCards = roles.map((role) => {
      const mine = candidates.filter((c) => c.role_id === role.id)
      const readable = mine.filter((c) => c.parse_status !== "failed")
      const failures = mine.filter((c) => c.parse_status === "failed").length
      const reviewed = readable.filter((c) => reviewByCand.get(c.id)?.status === "reviewed")
      const undecided = reviewed.filter((c) => !decisionFor.get(c.id))
      const hasReqs = (reqsByRole.get(role.id) ?? []).length > 0
      const sent = submissionRoleIds.has(role.id)
      const roleRecipients = recipientsByRole.get(role.id) ?? []
      const silentClient = roleRecipients.some((r) => !actedRecipientIds.has(r.id))

      // 1 intake · 2 parse · 3 candidates · 4 screening · 5 compare · 6 submission
      let stage = 1
      if (sent) stage = 6
      else if (readable.length > 0 && reviewed.length === readable.length) stage = 5
      else if (readable.length > 0) stage = 4
      else if (hasReqs) stage = 3
      else stage = 1

      let stage_state: "here" | "blocked" | "waiting" | "done" = "here"
      let needs = ""
      if (role.status === "closed") {
        stage_state = "done"
      } else if (failures > 0) {
        stage_state = "blocked"
        needs = `${failures} CV${failures === 1 ? "" : "s"} would not read`
      } else if (sent && silentClient) {
        stage_state = "waiting"
        needs = "Sent, no client reply yet"
      } else if (undecided.length > 0) {
        stage_state = "blocked"
        needs = `${undecided.length} screened, no decision yet`
      } else if (readable.length > reviewed.length) {
        needs = `${readable.length - reviewed.length} waiting on a call`
      } else if (!hasReqs) {
        needs = "No requirements yet"
      } else if (readable.length === 0) {
        needs = "No candidates yet"
      }

      let top_score: number | null = null
      let top_delta: number | null = null
      let top_name = ""
      for (const c of readable) {
        const sb = breakdownByCand.get(c.id)
        if (!sb) continue
        if (top_score === null || sb.overall > top_score) {
          top_score = sb.overall
          top_name = c.full_name
          top_delta =
            sb.original_overall === null || sb.original_overall === undefined
              ? null
              : Math.round(sb.overall - sb.original_overall)
        }
      }

      return {
        id: role.id,
        ref: role.ref,
        title: role.title,
        company: role.company,
        status: role.status,
        created_at: role.created_at,
        closed_at: role.closed_at,
        candidate_count: mine.length,
        stage,
        stage_state,
        needs,
        needs_action: stage_state === "blocked",
        top_score: top_score === null ? null : Math.round(top_score),
        top_delta,
        top_name,
      }
    })

    // The one thing worth doing first, named. Ranked the way a recruiter
    // would rank it: broken before stalled, stalled before merely waiting.
    const openCards = roleCards.filter((r) => r.status !== "closed")
    const focusRole =
      openCards.find((r) => r.stage_state === "blocked" && r.needs.includes("would not read")) ??
      openCards.find((r) => r.stage_state === "blocked") ??
      openCards.find((r) => r.stage_state === "waiting") ??
      openCards.find((r) => r.needs.includes("waiting on a call")) ??
      null
    const focus = focusRole
      ? { role_id: focusRole.id, title: focusRole.title, company: focusRole.company, reason: focusRole.needs }
      : null

    return NextResponse.json({
      agency: agencyRes.data ?? null,
      caller_role: ctx.role,
      needs_you: {
        client_actions: (actionsRes.data ?? []).slice(0, 8).map((a) => ({
          id: a.id,
          candidate_ref: a.candidate_ref,
          candidate_name: candidateName(a.candidate_ref),
          action: a.action,
          message: a.message,
          created_at: a.created_at,
        })),
        rights_requests: rightsRes.data ?? [],
      },
      next_calls: nextCalls,
      client_heat: { opened_silent: openedSilent, never_opened: neverOpened },
      worth_a_look: worthALook.slice(0, 3),
      pipeline: {
        awaiting_screening: awaitingScreening.map((c) => ({
          id: c.id, ref: c.ref, full_name: c.full_name, role_id: c.role_id,
          role_title: roleById.get(c.role_id)?.title ?? "",
        })),
        awaiting_decision: awaitingDecision.map((c) => ({
          id: c.id, ref: c.ref, full_name: c.full_name, role_id: c.role_id,
          role_title: roleById.get(c.role_id)?.title ?? "",
        })),
        awaiting_client: activeRecipients.filter((r) => !actedRecipientIds.has(r.id)).length,
        parse_failures: candidates.filter((c) => c.parse_status === "failed" && openRoleIds.has(c.role_id)).length,
      },
      compliance: {
        notices_due: noticesDue.length,
        retention_soon: retentionSoon.length,
        rights_pending: (rightsRes.data ?? []).length,
      },
      focus,
      roles: roleCards,
      activity: auditRes.data ?? [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
