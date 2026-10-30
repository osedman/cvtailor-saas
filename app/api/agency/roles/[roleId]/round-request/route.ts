/**
 * The recruiter answers the client's request for another round (Figma
 * board 33, band B). 'added' raises the role's planned rounds by one in the
 * same operation; 'replied' closes the request without a round.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { RoundRequestInputError, answerRoundRequest, requestForAgencyRole } from "@/lib/agency/round-requests"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

function fail(error: unknown) {
  if (error instanceof RoundRequestInputError) return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  if (error instanceof AgencyAccessError) return NextResponse.json({ error: errorMessage(error) }, { status: 404 })
  return NextResponse.json({ error: "That did not save. Try again." }, { status: 500 })
}

async function GET_handler(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const r = await requestForAgencyRole(auth.ctx, roleId)
    return NextResponse.json({ request: r && { candidateRefs: r.candidateRefs, note: r.note, roundNumber: r.roundNumber, at: r.at } })
  } catch (error) {
    return fail(error)
  }
}

async function POST_handler(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return NextResponse.json(await answerRoundRequest(auth.ctx, roleId, body.action))
  } catch (error) {
    return fail(error)
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/agency/roles/[roleId]/round-request", "GET", GET_handler)
export const POST = withTiming("/api/agency/roles/[roleId]/round-request", "POST", POST_handler)
