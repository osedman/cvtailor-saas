/**
 * The hiring manager's final choice, with their reason — Figma board 31.
 * See lib/agency/final-choice.ts: a preference, never a hire, and never a
 * rejection of anyone else.
 *
 * agency.client_final_choices has no authenticated write grants, so this
 * route is the only way a choice appears, and the audit row rides the same
 * operation. Append-only: changing a choice POSTs again; withdrawing POSTs
 * 'withdrawn'.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { AgencyAccessError } from "@/lib/agency/db"
import { FinalChoiceInputError, finalChoiceForHiringRole, recordFinalChoice } from "@/lib/agency/final-choice"
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
  if (error instanceof FinalChoiceInputError) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
  // A role or candidate outside the manager's links is not found, not
  // forbidden: "forbidden" would confirm it exists.
  if (error instanceof AgencyAccessError) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 404 })
  }
  return NextResponse.json({ error: "That did not save. Try again." }, { status: 500 })
}

async function GET_handler(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const choice = await finalChoiceForHiringRole(auth.ctx, roleId)
    return NextResponse.json({ choice: choice && { ...choice, candidateId: undefined, byContactId: undefined } })
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
    const choice = await recordFinalChoice(auth.ctx, roleId, {
      action: body.action,
      candidateRef: body.candidateRef,
      reason: body.reason,
    })
    return NextResponse.json({ choice: choice && { ...choice, candidateId: undefined, byContactId: undefined } })
  } catch (error) {
    return fail(error)
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/hiring/roles/[roleId]/final-choice", "GET", GET_handler)
export const POST = withTiming("/api/hiring/roles/[roleId]/final-choice", "POST", POST_handler)
