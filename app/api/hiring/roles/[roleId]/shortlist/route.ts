/**
 * The client's shortlist for one role, in their workspace: the frozen
 * snapshot the recruiter addressed to them, with the decisions they have
 * already taken. See lib/agency/client-shortlist.ts for the disclosure line.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { getClientShortlist } from "@/lib/agency/client-shortlist"
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
    const shortlist = await getClientShortlist(auth.ctx, roleId)
    if (!shortlist) return NextResponse.json({ error: "No shortlist on this role for you" }, { status: 404 })
    const { agencyId, contactId, recipientId, submissionId, ...rest } = shortlist
    void agencyId
    void contactId
    void recipientId
    void submissionId
    return NextResponse.json({ shortlist: rest })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
