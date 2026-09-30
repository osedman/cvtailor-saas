/**
 * The hiring manager's briefs: every one SENT to a contact they hold.
 * Drafts never appear — they have not left the recruiter's side.
 */

import { NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { listBriefsForClient } from "@/lib/agency/search-briefs"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" }, { status: failure === "unauthenticated" ? 401 : 403 })
}

async function GET_handler() {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    return NextResponse.json({ briefs: await listBriefsForClient(auth.ctx) })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/hiring/briefs", "GET", GET_handler)
