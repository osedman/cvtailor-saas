/**
 * Candidate ingestion + listing for one role.
 *
 * POST multipart/form-data { file } or JSON { cvText } — runs the full
 * pipeline in lib/agency/ingest.ts (suppression check, extraction, evidence,
 * server-side score, notice scheduling, audit).
 * GET returns candidates with their score breakdowns and evidence, all
 * through the user-scoped client so RLS does the tenancy work.
 */

import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { AgencyAccessError, agencyAdmin, requireAgencyContext } from "@/lib/agency/db"
import { CV_TEXT_LIMIT, extractFileText, ingestCandidate } from "@/lib/agency/ingest"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 300

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_CANDIDATES_PER_ROLE = 10

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const [candidates, scores, evidence, reviews, decisions] = await Promise.all([
      auth.db
        .from("candidates")
        .select(
          "id, ref, full_name, current_title, years, location, salary_text, source, source_detail, ingested_at, redacted, parse_status, parse_error, duplicate_of, cv_storage_path"
        )
        .eq("role_id", roleId)
        .order("ref"),
      auth.db.from("score_breakdowns").select("*").eq("agency_id", auth.ctx.agencyId),
      auth.db
        .from("candidate_evidence")
        .select("candidate_id, requirement_id, strength, quote, source_cite, origin"),
      auth.db
        .from("candidate_reviews")
        .select("candidate_id, status, communication, motivation, availability, salary_confirm, notice_period, notes, call_answers")
        .eq("role_id", roleId),
      auth.db
        .from("recruiter_reviews")
        .select("candidate_id, decision, decision_note")
        .eq("role_id", roleId),
    ])
    if (candidates.error) throw candidates.error

    const candidateIds = new Set((candidates.data ?? []).map((c) => c.id))
    return NextResponse.json({
      candidates: candidates.data ?? [],
      scores: (scores.data ?? []).filter((s) => candidateIds.has(s.candidate_id)),
      evidence: (evidence.data ?? []).filter((e) => candidateIds.has(e.candidate_id)),
      reviews: reviews.data ?? [],
      decisions: decisions.data ?? [],
    })
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
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const limited = await checkRateLimit(auth.ctx.userId, "ai")
    if (limited) return limited

    const { count } = await auth.db
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("role_id", roleId)
    if ((count ?? 0) >= MAX_CANDIDATES_PER_ROLE) {
      return NextResponse.json(
        { error: `Up to ${MAX_CANDIDATES_PER_ROLE} candidates per role` },
        { status: 400 }
      )
    }

    let cvText = ""
    let source: "upload" | "paste" = "paste"
    let sourceDetail = "pasted text"
    let file: { buffer: Buffer; name: string; contentType: string } | undefined

    const contentType = req.headers.get("content-type") ?? ""
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData()
      const uploaded = formData.get("file") as File | null
      if (!uploaded) return NextResponse.json({ error: "No file provided" }, { status: 400 })
      if (uploaded.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 })
      }
      cvText = (await extractFileText(uploaded)).trim()
      source = "upload"
      sourceDetail = uploaded.name.slice(0, 200)
      file = {
        buffer: Buffer.from(await uploaded.arrayBuffer()),
        name: uploaded.name,
        contentType: uploaded.type || "application/octet-stream",
      }
    } else {
      const body = await req.json()
      cvText = typeof body?.cvText === "string" ? body.cvText.trim() : ""
    }

    if (cvText.length < 100) {
      return NextResponse.json(
        { error: "CV text is too short to assess (or the file could not be read)" },
        { status: 400 }
      )
    }

    const result = await ingestCandidate(auth.ctx, auth.db, roleId, {
      cvText: cvText.slice(0, CV_TEXT_LIMIT),
      source,
      sourceDetail,
      file,
    })

    return NextResponse.json(result, { status: 201 })
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

/**
 * Remove a candidate added in error.
 *
 * Ose's walk-through, 22 Aug: a CV goes to the wrong role, or the wrong file
 * is picked, and there was no way back — the person stayed on the role, in the
 * count, and on their way to an Art 14 notice telling them they were being
 * considered for something nobody meant to consider them for.
 *
 * THIS IS A REAL ERASURE, not a hide. It goes through agency.purge_candidate,
 * the same single implementation the retention cron and the rights doorway
 * use: the audit row is written BEFORE the delete (name, ref and score survive
 * there and nowhere else), every derived row cascades, and the CV blob is
 * removed from storage afterwards. A soft delete would leave a person's CV in
 * an agency's database because somebody mis-clicked, which is the opposite of
 * what this control is for.
 *
 * THE REASON MATTERS. 'erasure_request' and 'objection' also write a
 * notice_suppression, which blocks that identity from ever being processed by
 * this agency again — correct when the PERSON asked, wrong when the RECRUITER
 * mis-clicked. This passes 'added_in_error', so a later legitimate upload of
 * the same person still works. Getting that backwards would quietly blacklist
 * people for somebody else's mistake.
 *
 * Refused once a notice has been sent: at that point the person has been told
 * they are being considered, and the honest path is the decision trail, not a
 * deletion that makes the message they already received unaccountable.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { candidateId?: unknown }
    const candidateId = typeof body.candidateId === "string" ? body.candidateId : ""
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId is required" }, { status: 400 })
    }

    const admin = agencyAdmin()
    const { data: candidate } = await admin
      .from("candidates")
      .select("id, agency_id, role_id, ref")
      .eq("id", candidateId)
      .maybeSingle()
    if (!candidate || candidate.agency_id !== auth.ctx.agencyId || candidate.role_id !== roleId) {
      return NextResponse.json({ error: "Candidate not found on this role" }, { status: 404 })
    }

    // A sent notice is a message to a person that cannot be unsent.
    const { data: notice } = await admin
      .from("candidate_notices")
      .select("status")
      .eq("candidate_id", candidateId)
      .maybeSingle()
    if (notice?.status === "sent") {
      return NextResponse.json(
        {
          error:
            "This candidate has already been told they are being considered. Removing them now would erase the record of a message they have received — decline them on the role instead, which tells them properly when it closes.",
        },
        { status: 409 }
      )
    }

    const { data: storagePath, error: purgeError } = await admin.rpc("purge_candidate", {
      p_candidate: candidateId,
      // NOT erasure_request: no suppression, because the person did not object.
      p_reason: "added_in_error",
    })
    if (purgeError) throw purgeError

    if (storagePath) {
      const { error: removeError } = await admin.storage
        .from("agency-cvs")
        .remove([storagePath as string])
      // Logged loudly rather than swallowed: a row gone with its blob left
      // behind is a CV nobody can see and nobody will delete.
      if (removeError) console.error("[candidates] storage removal failed:", removeError.message)
    }

    return NextResponse.json({ ok: true, ref: candidate.ref })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
