/**
 * Write up a round that was not recorded.
 *
 * This is the half that makes declining a recording cost a candidate nothing:
 * the round still produces an artifact, so the process can require one without
 * ever requiring consent.
 *
 * Open to the hiring manager, who ran the interview. The recruiter has the same
 * ability through lib/agency/artifacts (recordDebrief takes either context) —
 * they own the process and may be the one writing it up.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError } from "@/lib/agency/db"
import { requireHiringContext } from "@/lib/agency/client-auth"
import { recordDebrief, type DebriefAnswer } from "@/lib/agency/artifacts"

export const maxDuration = 15

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
    if (!roundId) return NextResponse.json({ error: "roundId is required" }, { status: 400 })

    const answers: DebriefAnswer[] = Array.isArray(body.answers)
      ? (body.answers as unknown[])
          .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
          .map((a) => ({
            key: String(a.key ?? ""),
            question: String(a.question ?? ""),
            answer: String(a.answer ?? ""),
          }))
      : []

    const result = await recordDebrief(auth.ctx, {
      roundId,
      answers,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    })
    return NextResponse.json(result, { status: 201 })
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
