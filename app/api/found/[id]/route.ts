/**
 * Triage of one recommendation: seen, or dismissed.
 *
 * 'applied' is deliberately not accepted here, in the validation AND in the
 * type the lib module exposes. Applying is the moment a bundle crosses the
 * wall to an agency; it gets its own route with the consent event written
 * first and an itemised disclosure manifest. A state string on a PATCH must
 * never be able to claim it happened — and the database trigger refuses it
 * from a client session even if this validation is ever broken.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { setFoundState, type FoundTransition } from "@/lib/matching/found"
import { checkRateLimit, anonRateLimitId } from "@/lib/rate-limit"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 10

const ALLOWED: FoundTransition[] = ["seen", "dismissed"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

    const limited = await checkRateLimit(anonRateLimitId(`found:${user.id}`), "auth")
    if (limited) return limited

    const body = (await req.json().catch(() => null)) as { state?: unknown } | null
    const state = body?.state
    if (typeof state !== "string" || !ALLOWED.includes(state as FoundTransition)) {
      return NextResponse.json(
        { error: `state must be one of: ${ALLOWED.join(", ")}` },
        { status: 400 }
      )
    }

    // RLS scopes the row to the caller; the .in('state', …) filter inside
    // means a settled row returns changed=false rather than an error.
    const changed = await setFoundState(supabase, id, state as FoundTransition)
    return NextResponse.json({ changed })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
