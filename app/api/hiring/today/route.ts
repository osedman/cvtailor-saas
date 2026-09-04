/**
 * What needs the hiring manager, and only them: one next action per role
 * they are tied to, from the same ladder as their role header. Acts first,
 * then waits, so the card at the top of /hiring is the first row.
 */

import { NextResponse } from "next/server"
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

export async function GET() {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const ties = (await listClientRoles(auth.ctx)).slice(0, 50)
    const headers = (await Promise.all(ties.map((t) => getClientRoleHeader(auth.ctx, t)))).filter(
      (h): h is NonNullable<typeof h> => h !== null
    )
    const order = { act: 0, wait: 1, done: 2 }
    headers.sort((a, b) => order[a.next.mode] - order[b.next.mode] || (a.next.since ?? "").localeCompare(b.next.since ?? ""))
    return NextResponse.json({ roles: headers, now: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
