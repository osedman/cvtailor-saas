/**
 * "That's all my decisions" — the client's own statement, written as a fact.
 *
 * Until 14 Sep 2026 the product inferred this from the round count against
 * planned_rounds, which is a plan and not a gate. This route is the fact
 * that outranks that inference; see lib/agency/decision-completions.ts.
 *
 * agency.role_decision_completions has no authenticated write grants, so
 * this route is the only way one appears, and the audit row rides the same
 * operation. Append-only: reopening POSTs 'withdrawn' rather than deleting.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { AgencyAccessError } from "@/lib/agency/db"
import {
  recordDecisionCompletion,
  completionForHiringRole,
  type CompletionAction,
} from "@/lib/agency/decision-completions"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)

    const body = await req.json().catch(() => ({}))
    const action: CompletionAction = body?.action === "withdrawn" ? "withdrawn" : "completed"
    const note = typeof body?.note === "string" ? body.note : ""

    const completion = await recordDecisionCompletion(auth.ctx, roleId, action, note)
    return NextResponse.json({ completion })
  } catch (error) {
    // A role the signed-in manager is not linked to is not found, not
    // forbidden: saying "forbidden" would confirm the role exists.
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: errorMessage(error) }, { status: 404 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    return NextResponse.json(await completionForHiringRole(auth.ctx, roleId))
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: errorMessage(error) }, { status: 404 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
