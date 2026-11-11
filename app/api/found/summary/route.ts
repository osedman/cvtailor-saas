/**
 * Counts only, for the header pill. Small on purpose: this is fetched on
 * ordinary consumer pages, so it must never carry role content around the
 * app — just whether there is something at /found worth a glance.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { foundSummary } from "@/lib/matching/found"
import { errorMessage } from "@/lib/error-message"
import { sessionUser } from "@/lib/supabase/session-user"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 10

async function GET_handler() {
  try {
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    // Signed-out is a normal state for the header, not an error.
    if (!user) return NextResponse.json({ open: 0, unseen: 0 })

    return NextResponse.json(await foundSummary(supabase))
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/found/summary", "GET", GET_handler)
