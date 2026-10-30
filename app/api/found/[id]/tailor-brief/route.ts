/**
 * The brief /tailor fetches when opened with ?rec=<recommendation id>.
 *
 * GET-only and read-only: entering role mode changes nothing and shares
 * nothing. The JD text returned here is rendered server-side from the frozen
 * snapshot, and the tailor route re-derives the same text itself — this
 * response exists so the person can SEE what they are tailoring against, not
 * so the client can supply it back.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { loadTailorBrief } from "@/lib/matching/tailor-brief"
import { errorMessage } from "@/lib/error-message"
import { sessionUser } from "@/lib/supabase/session-user"
import { withTiming } from "@/lib/server-timing"

const STATUS: Record<string, number> = {
  not_found: 404,
  settled: 409,
  not_live: 410,
}

const REASON_COPY: Record<string, string> = {
  not_found: "That recommendation does not exist.",
  settled: "This one is already settled — applied or dismissed.",
  not_live: "This role is no longer live, so there is nothing to tailor against.",
}

async function GET_handler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await sessionUser(supabase)
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

    const result = await loadTailorBrief(supabase, id)
    if (!result.ok) {
      return NextResponse.json(
        { error: REASON_COPY[result.reason], reason: result.reason },
        { status: STATUS[result.reason] ?? 500 }
      )
    }
    return NextResponse.json({ brief: result.brief })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/found/[id]/tailor-brief", "GET", GET_handler)
