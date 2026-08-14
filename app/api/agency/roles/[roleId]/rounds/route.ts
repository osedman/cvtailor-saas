/**
 * Interview rounds for a role — the recruiter's side.
 *
 * GET  → the client's open windows for this role, so the recruiter can see
 *        what there is to book before choosing a candidate.
 * POST { candidateId, slotId, durationMinutes?, meetingUrl? } → book one.
 * PATCH { roundId, status } → complete or cancel; cancelling frees the slot.
 *
 * The recruiter schedules because they own the process and hold both sides.
 * The times themselves are the client's, offered from /hiring.
 *
 * Nothing here sets capture consent — see the header of lib/agency/rounds.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import {
  listOpenSlots,
  listRoundsForRole,
  scheduleRound,
  setRoundStatus,
} from "@/lib/agency/rounds"

export const maxDuration = 15

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

function fail(error: unknown, fallbackStatus = 500) {
  if (error instanceof AgencyAccessError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status: fallbackStatus }
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const [openSlots, rounds] = await Promise.all([
      listOpenSlots(auth.ctx, roleId),
      listRoundsForRole(auth.ctx, roleId),
    ])
    return NextResponse.json({ openSlots, rounds })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const candidateId = typeof body.candidateId === "string" ? body.candidateId : ""
    const slotId = typeof body.slotId === "string" ? body.slotId : ""
    if (!candidateId || !slotId) {
      return NextResponse.json({ error: "candidateId and slotId are required" }, { status: 400 })
    }

    const result = await scheduleRound(auth.ctx, {
      roleId,
      candidateId,
      slotId,
      durationMinutes:
        typeof body.durationMinutes === "number" ? body.durationMinutes : undefined,
      meetingUrl: typeof body.meetingUrl === "string" ? body.meetingUrl : undefined,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const roundId = typeof body.roundId === "string" ? body.roundId : ""
    const status = body.status
    if (!roundId || (status !== "completed" && status !== "cancelled")) {
      return NextResponse.json(
        { error: "roundId and status ('completed' or 'cancelled') are required" },
        { status: 400 }
      )
    }

    await setRoundStatus(auth.ctx, roundId, status)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return fail(error)
  }
}
