/**
 * The candidate's consent link. Token is the only credential — they have no
 * account and must never need one to answer a question about their own voice.
 *
 * GET  ?  → what the page renders. Invalid, stale and cancelled all answer
 *           identically, so a guessed token learns nothing.
 * POST    → { decision: 'granted' | 'declined' | 'withdrawn' }
 *
 * Rate-limited on both verbs: an unauthenticated endpoint keyed by a secret is
 * exactly the shape worth guessing at, and the POST changes state.
 */

import { NextRequest, NextResponse } from "next/server"
import { peekConsent, recordDecision } from "@/lib/agency/consent"
import { checkRateLimit, anonRateLimitId } from "@/lib/rate-limit"

export const maxDuration = 15

const DECISIONS = new Set(["granted", "declined", "withdrawn"])

/** One shape for every failure, so nothing is learned from the difference. */
function notFound() {
  return NextResponse.json({ error: "That link is not valid" }, { status: 404 })
}

function callerId(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
  return anonRateLimitId(`consent:${ip}`)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = await checkRateLimit(callerId(req), "auth")
    if (limited) return limited

    const { token } = await params
    const view = await peekConsent(token)
    if (!view) return notFound()
    return NextResponse.json({ consent: view })
  } catch {
    // Never leak a database message to an unauthenticated caller.
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = await checkRateLimit(callerId(req), "auth")
    if (limited) return limited

    const { token } = await params
    const body = (await req.json().catch(() => ({}))) as { decision?: unknown }
    const decision = typeof body.decision === "string" ? body.decision : ""
    if (!DECISIONS.has(decision)) {
      return NextResponse.json({ error: "Choose an option" }, { status: 400 })
    }

    const result = await recordDecision(token, decision as "granted" | "declined" | "withdrawn")
    if (!result) return notFound()

    // Withdrawal deletes the derived evidence in the same operation; the blobs
    // and the rescore are the caller's to finish. Both are logged loudly rather
    // than silently swallowed — a half-done withdrawal is a broken promise.
    if (result.recordingPaths.length > 0) {
      console.error(
        `[consent] ${result.recordingPaths.length} recording blob(s) need deletion after withdrawal`
      )
    }
    if (result.rescoreCandidateId) {
      console.error(`[consent] candidate needs rescoring after withdrawal`)
    }

    return NextResponse.json({ ok: true, decision: result.decision })
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
