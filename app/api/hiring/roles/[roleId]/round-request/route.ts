/**
 * The hiring manager asks for another round (Figma board 33). A request, not
 * a round: see lib/agency/round-requests.ts. Append-only; taking it back is
 * a POST of 'withdrawn'.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { AgencyAccessError } from "@/lib/agency/db"
import { RoundRequestInputError, recordHiringRoundRequest, requestForHiringRole } from "@/lib/agency/round-requests"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

function fail(error: unknown) {
  if (error instanceof RoundRequestInputError) return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  // Not found, never forbidden: "forbidden" would confirm the role exists.
  if (error instanceof AgencyAccessError) return NextResponse.json({ error: errorMessage(error) }, { status: 404 })
  return NextResponse.json({ error: "That did not save. Try again." }, { status: 500 })
}

const publicShape = (r: Awaited<ReturnType<typeof requestForHiringRole>>) =>
  r && { candidateRefs: r.candidateRefs, note: r.note, roundNumber: r.roundNumber, at: r.at }

async function GET_handler(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    return NextResponse.json({ request: publicShape(await requestForHiringRole(auth.ctx, roleId)) })
  } catch (error) {
    return fail(error)
  }
}

async function POST_handler(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const r = await recordHiringRoundRequest(auth.ctx, roleId, {
      action: body.action,
      candidateRefs: body.candidateRefs,
      note: body.note,
    })
    return NextResponse.json({ request: publicShape(r) })
  } catch (error) {
    return fail(error)
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/hiring/roles/[roleId]/round-request", "GET", GET_handler)
export const POST = withTiming("/api/hiring/roles/[roleId]/round-request", "POST", POST_handler)
