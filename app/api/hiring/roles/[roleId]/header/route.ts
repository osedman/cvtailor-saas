/**
 * The client's role header: the same facts and the same ladder as the
 * recruiter's, projected for the hiring manager. The tie check and the
 * coarsening live in lib/agency/client-header.ts, shared with /api/hiring/
 * today, so the two cannot disagree. A role that is not theirs is "not
 * found", never "forbidden": the route does not confirm that an id exists.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { getClientRoleHeader, listClientRoles } from "@/lib/agency/client-header"
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
    const header = await getClientRoleHeader(auth.ctx, tie)
    if (!header) return NextResponse.json({ error: "Role not found" }, { status: 404 })
    return NextResponse.json(header)
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
