/**
 * The placement on one candidate.
 *
 * GET reads; PUT records or updates. The table has no authenticated write
 * grants, so this route is the only way a placement changes, and the audit
 * row rides the same operation.
 *
 * Status mapping: 422 for a fall-through with no reason, because that is a
 * refusal to accept an incomplete record rather than a permission problem.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext, AgencyAccessError } from "@/lib/agency/db"
import {
  getPlacementForCandidate,
  setPlacement,
  PLACEMENT_STATUSES,
  type PlacementStatus,
} from "@/lib/agency/placements"
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
    return NextResponse.json({ placement })
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
    })
    return NextResponse.json({ placement })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      // "say what happened" is an incomplete record, not a permission failure.
      const incomplete = /teaches nobody/.test(errorMessage(error))
      return NextResponse.json({ error: errorMessage(error) }, { status: incomplete ? 422 : 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
