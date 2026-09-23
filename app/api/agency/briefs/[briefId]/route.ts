/**
 * One brief, the recruiter's side.
 *
 * GET    → the brief with its latest and previous versions
 * PATCH  { title?, config? } → save (draft) or amend (sent): the module
 *          decides which, because the difference is the state, not the caller
 * POST   { action: "send" } | { action: "approve", version }
 * DELETE → discard an UNSENT draft; a sent brief stays on the record
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { discardDraft, getBriefForRecruiter, recruiterAmend, recruiterApprove, sendBrief } from "@/lib/agency/search-briefs"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30
type P = { params: Promise<{ briefId: string }> }

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" }, { status: failure === "unauthenticated" ? 401 : 403 })
}
function fail(error: unknown) {
  if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
}

export async function GET(_req: NextRequest, { params }: P) {
  try {
    const { briefId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const brief = await getBriefForRecruiter(auth.ctx, briefId)
    if (!brief) return NextResponse.json({ error: "No such brief on this agency" }, { status: 404 })
    return NextResponse.json({ brief })
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(req: NextRequest, { params }: P) {
  try {
    const { briefId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const brief = await recruiterAmend(auth.ctx, briefId, {
      config: body.config,
      title: typeof body.title === "string" ? body.title : undefined,
    })
    return NextResponse.json({ brief })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    const { briefId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (body.action === "send") return NextResponse.json({ brief: await sendBrief(auth.ctx, briefId) })
    if (body.action === "approve") {
      const version = Number(body.version)
      if (!Number.isInteger(version)) return NextResponse.json({ error: "version is required — you approve a specific version" }, { status: 400 })
      return NextResponse.json({ brief: await recruiterApprove(auth.ctx, briefId, version) })
    }
    return NextResponse.json({ error: "action must be send or approve" }, { status: 400 })
  } catch (error) {
    return fail(error)
  }
}

export async function DELETE(_req: NextRequest, { params }: P) {
  try {
    const { briefId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    await discardDraft(auth.ctx, briefId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return fail(error)
  }
}
