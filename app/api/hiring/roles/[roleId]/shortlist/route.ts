/**
 * The client's shortlist for one role, in their workspace: the frozen
 * snapshot the recruiter addressed to them, with the decisions they have
 * already taken. See lib/agency/client-shortlist.ts for the disclosure line.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { getClientShortlist } from "@/lib/agency/client-shortlist"
import { agencyAdmin } from "@/lib/agency/db"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

async function GET_handler(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const shortlist = await getClientShortlist(auth.ctx, roleId)
    if (!shortlist) return NextResponse.json({ error: "No shortlist on this role for you" }, { status: 404 })
    const { agencyId, contactId, recipientId, submissionId, ...rest } = shortlist
    // Opening it in the workspace counts as opening it (board 34): the
    // recruiter's receipt reads first_opened_at, which only the portal link
    // stamped until now. First open once; last open every time. A failed
    // stamp must not cost the client their shortlist.
    try {
      const now = new Date().toISOString()
      const admin = agencyAdmin()
      await admin.from("submission_recipients").update({ first_opened_at: now }).eq("id", recipientId).is("first_opened_at", null)
      await admin.from("submission_recipients").update({ last_opened_at: now }).eq("id", recipientId)
    } catch (stampError) {
      console.error("[hiring/shortlist] open stamp failed:", errorMessage(stampError))
    }
    void agencyId
    void contactId
    void recipientId
    void submissionId
    return NextResponse.json({ shortlist: rest })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/hiring/roles/[roleId]/shortlist", "GET", GET_handler)
