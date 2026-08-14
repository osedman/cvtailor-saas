/**
 * The hiring manager's decision after a round.
 *
 * Append-only by design: a reversal posts again and the latest wins, so the
 * whole sequence stays readable rather than being overwritten.
 *
 * 'decline' is a state for THE ROUND. It never removes, hides or reorders the
 * candidate — no code path anywhere turns it into that, and the dashboard that
 * reads these decisions has no filter that acts on them.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError } from "@/lib/agency/db"
import { requireHiringContext } from "@/lib/agency/client-auth"
import { decideRound } from "@/lib/agency/rounds"

export const maxDuration = 15

const DECISIONS = new Set(["advance", "hold", "decline"])

export async function POST(req: NextRequest) {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) {
      return NextResponse.json(
        {
          error:
            auth.failure === "unauthenticated"
              ? "Unauthorised"
              : "No client access — ask your recruiter for an invite.",
        },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const roundId = typeof body.roundId === "string" ? body.roundId : ""
    const decision = typeof body.decision === "string" ? body.decision : ""
    if (!roundId || !DECISIONS.has(decision)) {
      return NextResponse.json(
        { error: "roundId and decision ('advance', 'hold' or 'decline') are required" },
        { status: 400 }
      )
    }

    await decideRound(
      auth.ctx,
      roundId,
      decision as "advance" | "hold" | "decline",
      typeof body.note === "string" ? body.note : undefined
    )
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
