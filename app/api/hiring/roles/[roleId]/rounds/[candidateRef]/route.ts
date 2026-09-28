/**
 * The interview room's payload.
 *
 * One request for one candidate's rounds, because the room is also a PAGE: a
 * cold load of the URL has to stand up on its own, and stitching three
 * existing endpoints together in the browser would put the disclosure rule in
 * the client. getInterviewRoom holds that rule in one place.
 *
 * 404, not 403, when there is no room: "that candidate was never sent to you"
 * and "no such candidate" are the same answer from outside, and distinguishing
 * them would confirm the existence of somebody a client is not entitled to
 * know about.
 */
import { NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import { getInterviewRoom } from "@/lib/agency/interview-room"
import { errorMessage } from "@/lib/error-message"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roleId: string; candidateRef: string }> }
) {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No client access" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    const { roleId, candidateRef } = await params
    const room = await getInterviewRoom(auth.ctx, roleId, decodeURIComponent(candidateRef))
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
