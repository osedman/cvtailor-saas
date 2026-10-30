/**
 * What needs the hiring manager, and only them: one next action per role
 * they are tied to, from the same ladder as their role header. Acts first,
 * then waits, so the card at the top of /hiring is the first row.
 */

import { NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { getClientRoleHeaders, listClientRoles } from "@/lib/agency/client-header"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

async function GET_handler() {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const ties = (await listClientRoles(auth.ctx)).slice(0, 50)
    const headers = await getClientRoleHeaders(auth.ctx, ties)
    const order = { act: 0, wait: 1, done: 2 }
    headers.sort((a, b) => order[a.next.mode] - order[b.next.mode] || (a.next.since ?? "").localeCompare(b.next.since ?? ""))
    return NextResponse.json({ roles: headers, now: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/hiring/today", "GET", GET_handler)
