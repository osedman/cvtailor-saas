/**
 * Screening questions the recruiter writes for a role (frame 37, 2 Oct 2026).
 *
 * GET    → every written question on the role, removed ones included (they
 *          still label answers already given)
 * POST   { text, candidateId? } → add one: candidateId set is "just this
 *          call"; absent is "every candidate on this role"
 * DELETE { id } → take one off; answers given keep it
 *
 * Writes are audit-coupled and live in lib/agency/screening-questions.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { addWrittenQuestion, listWrittenQuestions, removeWrittenQuestion } from "@/lib/agency/screening-questions"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 15
type P = { params: Promise<{ roleId: string }> }

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" }, { status: failure === "unauthenticated" ? 401 : 403 })
}
function fail(error: unknown) {
  if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
}

async function GET_handler(_req: NextRequest, { params }: P) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    return NextResponse.json({ questions: await listWrittenQuestions(auth.ctx.agencyId, roleId) })
  } catch (error) {
    return fail(error)
  }
}

async function POST_handler(req: NextRequest, { params }: P) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const question = await addWrittenQuestion(auth.ctx, {
      roleId,
      candidateId: typeof body.candidateId === "string" && body.candidateId ? body.candidateId : null,
      text: typeof body.text === "string" ? body.text : "",
    })
    return NextResponse.json({ question })
  } catch (error) {
    return fail(error)
  }
}

async function DELETE_handler(req: NextRequest, { params }: P) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    await removeWrittenQuestion(auth.ctx, roleId, body.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return fail(error)
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/agency/roles/[roleId]/screening-questions", "GET", GET_handler)
export const POST = withTiming("/api/agency/roles/[roleId]/screening-questions", "POST", POST_handler)
export const DELETE = withTiming("/api/agency/roles/[roleId]/screening-questions", "DELETE", DELETE_handler)
