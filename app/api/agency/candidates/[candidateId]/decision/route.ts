/**
 * Shortlist decision for one candidate. Human-only by construction: this
 * endpoint is the sole writer of recruiter_reviews.decision, it requires an
 * authenticated owner/recruiter, and null (undecided) is a first-class value —
 * clicking the active segment clears it. No machine path exists that can set
 * 'reject'.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  AgencyAccessError,
  agencyAdmin,
  assertWriter,
  requireAgencyContext,
  writeAudit,
} from "@/lib/agency/db"
import { loadScoringState } from "@/lib/agency/rescore"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    assertWriter(auth.ctx)

    const body = await req.json()
    const decision = body?.decision ?? null
    if (decision !== null && !["shortlist", "hold", "reject"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 })
    }
    const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : ""

    const admin = agencyAdmin()
    const state = await loadScoringState(admin, auth.ctx.agencyId, candidateId)

    const { data: existing } = await admin
      .from("recruiter_reviews")
      .select("decision")
      .eq("candidate_id", candidateId)
      .maybeSingle()

    const { error } = await admin.from("recruiter_reviews").upsert(
      {
        agency_id: auth.ctx.agencyId,
        role_id: state.candidate.role_id,
        candidate_id: candidateId,
        decision,
        decision_note: note,
        decided_by: auth.ctx.userId,
        decided_at: decision ? new Date().toISOString() : null,
      },
      { onConflict: "candidate_id" }
    )
    if (error) throw error

    await writeAudit(admin, {
      agencyId: auth.ctx.agencyId,
      roleId: state.candidate.role_id,
      candidateId,
      actorId: auth.ctx.userId,
      entityType: "decision",
      entityRef: state.candidate.ref,
      action: decision ? "decided" : "cleared",
      fromValue: { decision: existing?.decision ?? null },
      toValue: { decision },
      reason: note || undefined,
    })

    return NextResponse.json({ decision, candidate_ref: state.candidate.ref })
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
