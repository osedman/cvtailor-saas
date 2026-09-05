/**
 * Busy intervals from the connected calendar between two instants. Only
 * intervals: no titles, no attendees, nothing stored. The horizon is capped
 * so a stray query cannot pull a year of someone's diary.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import { busyBetween } from "@/lib/calendar/connections"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30
const MAX_DAYS = 31

export async function GET(req: NextRequest) {
  try {
    const auth = await requireHiringContext()
    if (!auth.ok) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    const from = req.nextUrl.searchParams.get("from") ?? ""
    const to = req.nextUrl.searchParams.get("to") ?? ""
    const f = Date.parse(from)
    const t = Date.parse(to)
    if (!Number.isFinite(f) || !Number.isFinite(t) || t <= f) return NextResponse.json({ error: "from and to must be valid instants" }, { status: 400 })
    if (t - f > MAX_DAYS * 86_400_000) return NextResponse.json({ error: `at most ${MAX_DAYS} days at a time` }, { status: 400 })
    const busy = await busyBetween(auth.ctx.userId, new Date(f).toISOString(), new Date(t).toISOString())
    return NextResponse.json({ busy })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
