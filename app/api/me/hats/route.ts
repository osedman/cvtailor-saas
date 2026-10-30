/**
 * Which sides of Tailr the signed-in person holds — frame 44, band A
 * (approved 13 Oct 2026). Drives the "Viewing as" switch, which shows only
 * to someone who is both a recruiter and a hiring manager.
 *
 * Booleans only: no agency, contact or email leaves this route.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sessionUser } from "@/lib/supabase/session-user"
import { getHatsHeld } from "@/lib/hat-routing"
import { withTiming } from "@/lib/server-timing"

async function GET_handler() {
  try {
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    if (!user) return NextResponse.json({ recruiter: false, hiringManager: false }, { status: 401 })
    const hats = await getHatsHeld(user.id)
    return NextResponse.json({ recruiter: hats.recruiter, hiringManager: hats.hiringManager })
  } catch {
    // A switch that fails to load is simply absent; never an error screen.
    return NextResponse.json({ recruiter: false, hiringManager: false })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts).
export const GET = withTiming("/api/me/hats", "GET", GET_handler)
