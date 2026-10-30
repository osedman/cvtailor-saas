/**
 * Which calendar, if any, this user has connected, and which providers the
 * environment can offer. "Not configured" is a state the UI shows plainly:
 * a connect button that does nothing is the 200 {enabled:false} trap.
 */

import { NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import { getConnection } from "@/lib/calendar/connections"
import { PROVIDERS } from "@/lib/calendar/providers"
import { tokenStorageConfigured } from "@/lib/calendar/tokens"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

async function GET_handler() {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    const connection = await getConnection(auth.ctx.userId)
    const storage = tokenStorageConfigured()
    return NextResponse.json({
      connection,
      providers: (Object.keys(PROVIDERS) as Array<keyof typeof PROVIDERS>).map((key) => ({
        key,
        label: PROVIDERS[key].label,
        configured: storage && PROVIDERS[key].configured(),
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

async function DELETE_handler() {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    const { deleteConnection } = await import("@/lib/calendar/connections")
    await deleteConnection(auth.ctx.userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/hiring/calendar/status", "GET", GET_handler)
export const DELETE = withTiming("/api/hiring/calendar/status", "DELETE", DELETE_handler)
