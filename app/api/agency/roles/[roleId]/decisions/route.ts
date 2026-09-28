/**
 * Shortlist decisions for several candidates on one role, in one request —
 * the "add in one go" chips, a group head on the recommendation tab, and the
 * undo that follows either.
 *
 * This is not a different kind of decision. Every entry goes through
 * applyDecision, the same function the single-candidate route calls: same
 * table, same column, same audit row per person (reason "bulk"), same
 * human-only rule. The recruiter clicked once; the trail still reads person
 * by person, and each person's PREVIOUS value comes back so the UI can undo
 * exactly rather than guessing at "undecided".
 *
 * Scope: candidates must be on THIS role and in the caller's agency. Ids
 * that are not are skipped and named in the response, never fatal — a stale
 * tab should not lose the forty-nine people who are still here.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  AgencyAccessError,
  agencyAdmin,
  assertWriter,
  requireAgencyContext,
} from "@/lib/agency/db"
import {
  applyDecision,
  loadPreviousDecisions,
  parseBulkDecisions,
  type KnownCandidate,
} from "@/lib/agency/decisions"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

export async function PATCH(
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
    assertWriter(auth.ctx)

    const body = await req.json().catch(() => null)
    const parsed = parseBulkDecisions(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    // One query decides who is really here: on this role, in this agency.
    // Everyone else is reported back as skipped. The rows are handed on to
    // applyDecision, which re-checks the same two facts per person, so the
    // guarantee does not rest on this list — but nobody is read twice. The
    // batch's current decisions are read once the same way; fifty people
    // used to cost two hundred round trips inside maxDuration 30.
    const admin = agencyAdmin()
    const ids = parsed.changes.map((c) => c.candidateId)
    const { data: rows, error: lookupError } = await admin
      .from("candidates")
      .select("id, agency_id, role_id, ref")
      .in("id", ids)
      .eq("role_id", roleId)
      .eq("agency_id", auth.ctx.agencyId)
    if (lookupError) throw lookupError
    const onRole = new Map<string, KnownCandidate>(
      ((rows ?? []) as KnownCandidate[]).map((r) => [r.id, r])
    )
    const previousById = await loadPreviousDecisions([...onRole.keys()], admin)

    const updated: Array<{ candidateId: string; decision: string | null; previous: string | null }> = []
    const skipped: Array<{ candidateId: string; reason: string }> = []

    for (const change of parsed.changes) {
      const candidate = onRole.get(change.candidateId)
      if (!candidate) {
        skipped.push({ candidateId: change.candidateId, reason: "not on this role" })
        continue
      }
      try {
        const applied = await applyDecision(auth.ctx, change.candidateId, change.decision, {
          roleId,
          source: "bulk",
          candidate,
          previous: previousById.get(change.candidateId) ?? null,
        })
        updated.push({
          candidateId: applied.candidateId,
          decision: applied.decision,
          previous: applied.previous,
        })
      } catch (error) {
        // A tenancy or role mismatch on one person is that person's problem,
        // not the batch's. A database failure is everyone's, and surfaces.
        if (error instanceof AgencyAccessError) {
          skipped.push({ candidateId: change.candidateId, reason: error.message })
          continue
        }
        throw error
      }
    }

    return NextResponse.json({ updated, skipped })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
