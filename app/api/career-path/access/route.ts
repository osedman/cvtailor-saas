import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isCareerPathBeta } from '@/lib/feature-gate'
import { sessionUser } from "@/lib/supabase/session-user"
import { withTiming } from "@/lib/server-timing"

/**
 * Tells the client whether this user is in the career-path beta, so gated
 * surfaces (nav links, banners, the quick-wins strip) can hide rather than
 * render a button that would only 403. Deliberately reveals nothing about who
 * else is on the list.
 */
async function GET_handler() {
  try {
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    return NextResponse.json({ beta: await isCareerPathBeta(user?.email) })
  } catch {
    return NextResponse.json({ beta: false })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/career-path/access", "GET", GET_handler)
