/**
 * Shortlist decision for one candidate. Human-only by construction: the write
 * lives in lib/agency/decisions.ts (applyDecision), the one writer of
 * recruiter_reviews.decision, shared with the bulk route. It requires an
 * authenticated owner/recruiter, and null (undecided) is a first-class value —
 * sending the value already held clears it. No machine path exists that can
 * set 'reject'.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, assertWriter, requireAgencyContext } from "@/lib/agency/db"
import { applyDecision, parseDecision } from "@/lib/agency/decisions"
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
    const decision = parseDecision(body?.decision)
    if (decision === undefined) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 })
    }
    const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : ""

    const applied = await applyDecision(auth.ctx, candidateId, decision, { note, source: "single" })

    return NextResponse.json({ decision: applied.decision, candidate_ref: applied.candidateRef })
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
