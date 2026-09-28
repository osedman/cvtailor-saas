/**
 * One brief, the client's side. Scoped to the caller's own contact ids —
 * the id in the URL is the address, the link is the permission.
 *
 * GET   → the brief, with the previous version so a change can be shown
 *         beside what it replaced
 * PATCH { config } → amend TIER-1 keys: a new version signed by the client
 * POST  { action: "approve", version } → sign THIS version
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { AgencyAccessError } from "@/lib/agency/db"
import { clientAmend, clientApprove, getBriefForClient } from "@/lib/agency/search-briefs"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30
type P = { params: Promise<{ briefId: string }> }

function authFail(failure: HiringFailure) {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" }, { status: failure === "unauthenticated" ? 401 : 403 })
}
function fail(error: unknown) {
  if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
}
/** The agency's internal ids stay on the agency's side. */
function forClient(brief: Awaited<ReturnType<typeof getBriefForClient>>) {
  if (!brief) return null
  const { agencyId, contactId, connectedRoles, ...rest } = brief
  void agencyId
  void contactId
  return { ...rest, connectedRoles: connectedRoles.map((r) => ({ title: r.title, version: r.version })) }
}

export async function GET(_req: NextRequest, { params }: P) {
  try {
    const { briefId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const brief = await getBriefForClient(auth.ctx, briefId)
    if (!brief) return NextResponse.json({ error: "No brief was sent to you at this address" }, { status: 404 })
    return NextResponse.json({ brief: forClient(brief) })
  } catch (error) {
    return fail(error)
  }
}

export async function PATCH(req: NextRequest, { params }: P) {
  try {
    const { briefId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return NextResponse.json({ brief: forClient(await clientAmend(auth.ctx, briefId, body.config)) })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    const { briefId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    if (body.action !== "approve") return NextResponse.json({ error: "action must be approve" }, { status: 400 })
    const version = Number(body.version)
    if (!Number.isInteger(version)) return NextResponse.json({ error: "version is required — you approve a specific version" }, { status: 400 })
    return NextResponse.json({ brief: forClient(await clientApprove(auth.ctx, briefId, version)) })
  } catch (error) {
    return fail(error)
  }
}
