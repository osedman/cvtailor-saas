/**
 * Applying to a role that found you.
 *
 * GET returns the manifest — exactly what would be shared, with whom, kept
 * how long — and POST executes it. The POST body is EMPTY by design: the
 * payload is recomputed server-side from the same context the manifest was
 * built from, so what the person confirmed and what crosses the wall cannot
 * be two different things, and nothing a client sends is trusted.
 *
 * Status mapping is deliberate:
 *   404 not_found  — including recommendations that exist but are not yours;
 *                    their existence is itself information.
 *   409 settled    — already applied or dismissed (a double-click lands here).
 *   410 not_live   — the role was paused or closed after finding them.
 *   409 stale      — live requirements drifted from the snapshot they were
 *                    scored against; the recruiter's republish is the fix.
 *   422 empty_bank — nothing to share; the bank is empty or all-hidden.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { applyToRole, getApplyManifest } from "@/lib/matching/apply"
import { checkRateLimit, anonRateLimitId } from "@/lib/rate-limit"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

const STATUS: Record<string, number> = {
  not_found: 404,
  settled: 409,
  not_live: 410,
  stale: 409,
  empty_bank: 422,
}

const REASON_COPY: Record<string, string> = {
  not_found: "That recommendation does not exist.",
  settled: "This one is already settled — applied or dismissed.",
  not_live: "This role is no longer live. Nothing was shared.",
  stale:
    "This role's requirements changed after it found you, so what you saw is no longer what you'd be scored on. Nothing was shared — if it comes back, it will have been re-matched first.",
  empty_bank: "Your evidence bank is empty (or everything in it is hidden), so there is nothing to share.",
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

    const result = await getApplyManifest(user.id, id)
    if (!result.ok) {
      const debug = (result as { debug?: Record<string, unknown> }).debug
      return NextResponse.json(
        {
          error:
            REASON_COPY[result.reason] +
            // Temporary diagnostic — see lib/matching/apply.ts stale branch.
            (debug ? ` [debug: ${JSON.stringify(debug)}]` : ""),
          reason: result.reason,
        },
        { status: STATUS[result.reason] ?? 500 }
      )
    }
    return NextResponse.json({ manifest: result.manifest })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

    const limited = await checkRateLimit(anonRateLimitId(`apply:${user.id}`), "auth")
    if (limited) return limited

    const result = await applyToRole(user.id, id)
    if (!result.ok) {
      return NextResponse.json(
        { error: REASON_COPY[result.reason], reason: result.reason },
        { status: STATUS[result.reason] ?? 500 }
      )
    }
    return NextResponse.json(result.result)
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
