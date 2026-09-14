/**
 * The placement on one candidate.
 *
 * GET reads; PUT records or updates. The table has no authenticated write
 * grants, so this route is the only way a placement changes, and the audit
 * row rides the same operation.
 *
 * Status mapping: 422 for a fall-through with no reason, and for a placement
 * on a candidate the client never advanced with no reason either — both are
 * refusals to accept an INCOMPLETE RECORD rather than permission problems.
 *
 * GET also returns advanceDecision so the screen can ask up front instead of
 * refusing the recruiter after they have filled the form.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext, AgencyAccessError } from "@/lib/agency/db"
import {
  getPlacementForCandidate,
  setPlacement,
  hasAdvanceDecision,
  PLACEMENT_STATUSES,
  type PlacementStatus,
} from "@/lib/agency/placements"
import { agencyAdmin } from "@/lib/agency/db"
import { errorMessage } from "@/lib/error-message"

async function auth() {
  const result = await requireAgencyContext()
  if (result.ok) return { ok: true as const, ctx: result.ctx }
  return {
    ok: false as const,
    response: NextResponse.json(
      { error: result.failure === "unauthenticated" ? "Unauthorised" : "No agency access" },
      { status: result.failure === "unauthenticated" ? 401 : 403 }
    ),
  }
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const a = await auth()
    if (!a.ok) return a.response
    const placement = await getPlacementForCandidate(a.ctx, candidateId)

    /**
     * Whether the client ever advanced this person, sent alongside so the
     * screen can ask for the reason BEFORE the recruiter fills the form
     * rather than refusing them after it. The refusal below is still the
     * wall — this is only so the wall is not a surprise.
     */
    const admin = agencyAdmin()
    const { data: candidate } = await admin
      .from("candidates")
      .select("id, agency_id, role_id")
      .eq("id", candidateId)
      .maybeSingle()
    const advanceDecision =
      candidate && candidate.agency_id === a.ctx.agencyId
        ? await hasAdvanceDecision(admin, a.ctx.agencyId, candidate.role_id as string, candidateId)
        : true

    return NextResponse.json({ placement, advanceDecision })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const a = await auth()
    if (!a.ok) return a.response

    const body = await req.json()
    const status = body?.status
    if (typeof status !== "string" || !PLACEMENT_STATUSES.includes(status as PlacementStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${PLACEMENT_STATUSES.join(", ")}.` },
        { status: 400 }
      )
    }

    const placement = await setPlacement(a.ctx, candidateId, {
      status: status as PlacementStatus,
      startDate: typeof body?.startDate === "string" ? body.startDate : null,
      feePercent: num(body?.feePercent),
      feeValue: num(body?.feeValue),
      currency: typeof body?.currency === "string" ? body.currency : "GBP",
      rebateWeeks: num(body?.rebateWeeks),
      fellThroughReason: typeof body?.fellThroughReason === "string" ? body.fellThroughReason : "",
      notes: typeof body?.notes === "string" ? body.notes : "",
      outsideProcessReason:
        typeof body?.outsideProcessReason === "string" ? body.outsideProcessReason : "",
    })
    return NextResponse.json({ placement })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      // "say what happened" is an incomplete record, not a permission failure.
      const incomplete = /teaches nobody|travels with the record/.test(errorMessage(error))
      return NextResponse.json({ error: errorMessage(error) }, { status: incomplete ? 422 : 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
