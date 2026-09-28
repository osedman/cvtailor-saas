/**
 * The candidate's consent link. Token is the only credential — they have no
 * account and must never need one to answer a question about their own voice.
 *
 * GET  ?  → what the page renders. Invalid, stale and cancelled all answer
 *           identically, so a guessed token learns nothing.
 * POST    → { decision: 'granted' | 'declined' | 'withdrawn' }
 *
 * Rate-limited on both verbs against FLOODS, not guessing: the token is 192
 * random bits, which no request rate can guess. So the limit is per link plus
 * a high per-network ceiling (checkDoorwayLimit), never the sign-in tier keyed
 * by IP alone — that refused the second person on a shared network and told
 * them their link was not valid (28 Sep 2026, on the booking doorway).
 * POST also has a tighter per-link write ceiling (checkDoorwayWriteLimit),
 * because every answer emails the agency's recruiters.
 */

import { NextRequest, NextResponse } from "next/server"
import { peekConsent, recordDecision } from "@/lib/agency/consent"
import { checkDoorwayLimit, checkDoorwayWriteLimit } from "@/lib/rate-limit"

export const maxDuration = 15

const DECISIONS = new Set(["granted", "declined", "withdrawn"])

/** One shape for every failure, so nothing is learned from the difference. */
function notFound() {
  return NextResponse.json({ error: "That link is not valid" }, { status: 404 })
}

function callerIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const limited = await checkDoorwayLimit("consent", callerIp(req), token)
    if (limited) return limited

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
    const { token } = await params
    const limited = await checkDoorwayLimit("consent", callerIp(req), token)
    if (limited) return limited
    // Each answer emails the agency's recruiters, so writes get a tighter
    // per-link ceiling than reads (5 a minute, 20 a day). recordDecision also
    // ignores a repeat of the answer already given.
    const writeLimited = await checkDoorwayWriteLimit("consent", token)
    if (writeLimited) return writeLimited

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
