/**
 * The candidate's booking link. The token is the only credential — they have
 * no account and must never need one to answer a question about their own week.
 *
 * GET  → what the doorway renders
 * POST → { answer: 'confirmed' | 'declined' }
 *
 * Every failure answers identically, so a guessed token learns nothing about
 * whether it nearly worked. Rate-limited on both verbs: an unauthenticated
 * endpoint keyed by a secret is exactly the shape worth guessing at, and the
 * POST changes state and can release a client's diary slot.
 */

import { NextRequest, NextResponse } from "next/server"
import { peekBooking, respondToBooking } from "@/lib/agency/booking"
import { checkRateLimit, anonRateLimitId } from "@/lib/rate-limit"

export const maxDuration = 15

function notFound() {
  return NextResponse.json({ error: "That link is not valid" }, { status: 404 })
}

function callerId(req: NextRequest): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
  return anonRateLimitId(`booking:${ip}`)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limited = await checkRateLimit(callerId(req), "auth")
    if (limited) return limited

    const { token } = await params
    const view = await peekBooking(token)
    if (view.state === "unknown") return notFound()
    return NextResponse.json({ booking: view })
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
    const body = (await req.json().catch(() => ({}))) as { answer?: unknown }
    const answer = body.answer === "confirmed" || body.answer === "declined" ? body.answer : null
    if (!answer) return NextResponse.json({ error: "Choose an option" }, { status: 400 })

    const outcome = await respondToBooking(token, answer)
    if (outcome === "not_found") return notFound()

    return NextResponse.json({ ok: true, outcome, booking: await peekBooking(token) })
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
