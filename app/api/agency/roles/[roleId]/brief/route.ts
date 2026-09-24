/**
 * A role and its brief.
 *
 * GET  → how the role stands against its brief (version, moved on, every
 *        difference) plus the briefs it COULD connect to for its company
 * POST { briefId } → connect: copies the approved config onto the role
 * DELETE → the reverse: unlink and put back what connect overwrote
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, agencyAdmin, getJobRole, requireAgencyContext } from "@/lib/agency/db"
import { connectRoleToBrief, disconnectRoleFromBrief, listBriefsForCompany, roleBriefStatus } from "@/lib/agency/search-briefs"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30
type P = { params: Promise<{ roleId: string }> }

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" }, { status: failure === "unauthenticated" ? 401 : 403 })
}

export async function GET(_req: NextRequest, { params }: P) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const role = await getJobRole(agencyAdmin(), auth.ctx, roleId)
    if (!role) return NextResponse.json({ error: "No such role" }, { status: 404 })
    const [status, available] = await Promise.all([
      roleBriefStatus(auth.ctx.agencyId, roleId),
      listBriefsForCompany(auth.ctx, role.company ?? ""),
    ])
    return NextResponse.json({ status, available })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const briefId = typeof body.briefId === "string" ? body.briefId : ""
    if (!briefId) return NextResponse.json({ error: "briefId is required" }, { status: 400 })
    const result = await connectRoleToBrief(auth.ctx, roleId, briefId)
    const status = await roleBriefStatus(auth.ctx.agencyId, roleId)
    return NextResponse.json({ ...result, status })
  } catch (error) {
    if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: P) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    await disconnectRoleFromBrief(auth.ctx, roleId)
    return NextResponse.json({ ok: true, status: null })
  } catch (error) {
    if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
