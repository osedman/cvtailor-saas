/**
 * The interview rules for one role, read and written by the hiring manager
 * whose role it is. The tie check is the same one the header and Today use
 * (listClientRoles), so a role that is not theirs is "not found" here too —
 * the route never confirms that an id exists.
 *
 * Rules, never appointments: see lib/agency/interview-settings.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { listClientRoles } from "@/lib/agency/client-header"
import { getInterviewSettings, setInterviewSettings } from "@/lib/agency/interview-settings"
import { AgencyAccessError } from "@/lib/agency/db"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const tie = (await listClientRoles(auth.ctx)).find((t) => t.roleId === roleId)
    if (!tie) return NextResponse.json({ error: "Role not found" }, { status: 404 })
    return NextResponse.json(await getInterviewSettings(tie.agencyId, roleId))
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const tie = (await listClientRoles(auth.ctx)).find((t) => t.roleId === roleId)
    if (!tie) return NextResponse.json({ error: "Role not found" }, { status: 404 })
    const body = await req.json().catch(() => ({}))
    const settings = await setInterviewSettings(tie.agencyId, roleId, auth.ctx.userId, body?.settings ?? body)
    return NextResponse.json({ settings, saved: true })
  } catch (error) {
    if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
