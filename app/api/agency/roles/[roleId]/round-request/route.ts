/**
 * The recruiter answers the client's request for another round (Figma
 * board 33, band B). 'added' raises the role's planned rounds by one in the
 * same operation; 'replied' closes the request without a round.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { RoundRequestInputError, answerRoundRequest, requestForAgencyRole } from "@/lib/agency/round-requests"
import { errorMessage } from "@/lib/error-message"

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
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
