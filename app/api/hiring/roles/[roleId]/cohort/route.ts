/**
 * Invite the interview cohort: the candidates the client chose, each given a
 * link to pick their own time. See lib/agency/cohort.ts for why the round
 * carries no time and why the recruiter is not in this path.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { listClientRoles } from "@/lib/agency/client-header"
import { inviteCohort } from "@/lib/agency/cohort"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 60

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
    const tie = (await listClientRoles(auth.ctx)).find((t) => t.roleId === roleId)
    if (!tie) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const refs = Array.isArray(body?.candidateRefs)
      ? (body.candidateRefs as unknown[]).filter((r): r is string => typeof r === "string").map((r) => r.slice(0, 20))
      : []
    if (refs.length === 0) return NextResponse.json({ error: "candidateRefs are required" }, { status: 400 })

    const result = await inviteCohort(tie.agencyId, roleId, tie.contactId, refs, auth.ctx.userId)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
