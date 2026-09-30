/**
 * The roles that found the signed-in person.
 *
 * Runs entirely on the user-scoped client: the §5.3 RLS design (SELECT-own
 * recommendations, published roles visible only-if-recommended) IS the data
 * access here, so a policy regression breaks this page visibly instead of
 * being papered over by the service role.
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listFound } from "@/lib/matching/found"
import { errorMessage } from "@/lib/error-message"
import { sessionUser } from "@/lib/supabase/session-user"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 10

async function GET_handler() {
  try {
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

    const result = await listFound(supabase)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/found", "GET", GET_handler)
