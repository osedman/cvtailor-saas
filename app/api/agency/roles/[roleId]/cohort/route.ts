/**
 * The recruiter's view of the interview cohort: who is booked, who has not
 * chosen yet, who found no suitable time.
 *
 * VISIBILITY, NOT CONTROL (Ose, 11 Sep 2026). Candidates book themselves, so
 * there is no POST here and no way to seat anyone from this route. The one
 * write a recruiter gets is sending somebody's link again, which changes
 * nothing about who holds what.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { getCohortBoard, remindCohortMember } from "@/lib/agency/cohort"
import { getWaveState, planRelease } from "@/lib/agency/waves"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const [board, wave] = await Promise.all([
      getCohortBoard(auth.ctx, roleId),
      getWaveState(auth.ctx.agencyId, roleId),
    ])
    const plan = planRelease({
      reserveSize: wave.reserve.length,
      awaiting: wave.awaiting,
      openWindows: wave.openWindows,
      waveSize: wave.waveSize,
      waveStillRunning: wave.nextReleaseAt !== null && Date.parse(wave.nextReleaseAt) > Date.now(),
    })
    // The recruiter sees the wave, and still cannot release it: the cohort
    // is the client's to grow.
    return NextResponse.json({ ...board, wave: { ...wave, plan } })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") return NextResponse.json({ error: "Viewers cannot send invitations" }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const roundId = typeof body?.roundId === "string" ? body.roundId : ""
    if (!roundId) return NextResponse.json({ error: "roundId is required" }, { status: 400 })
    return NextResponse.json(await remindCohortMember(auth.ctx, roleId, roundId))
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
