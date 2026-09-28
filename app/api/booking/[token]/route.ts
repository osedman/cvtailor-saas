/**
 * The candidate's booking link. The token is the only credential — they have
 * no account and must never need one to answer a question about their own week.
 *
 * GET  → what the doorway renders
 * POST → { answer: 'confirmed' | 'declined' } to answer a fixed time,
 *         { slotId } to CHOOSE one when the invitation left it open,
 *         or { slotId, move: true } to move a time they already hold
 *
 * Every failure answers identically, so a guessed token learns nothing about
 * whether it nearly worked.
 *
 * Rate-limited on both verbs against FLOODS, not guessing: the token is 192
 * random bits (randomBytes(24), stored hashed), which no request rate can
 * guess. So the limit is per link (one person's generous allowance) plus a
 * high per-network ceiling — see checkDoorwayLimit. It used to be the sign-in
 * tier keyed by IP alone (3 a minute), which on 28 Sep 2026 refused the
 * second candidate on a shared network and made their link look dead.
 */

import { NextRequest, NextResponse } from "next/server"
import { claimBookingSlot, peekBooking, rescheduleBooking, respondToBooking } from "@/lib/agency/booking"
import { checkDoorwayLimit } from "@/lib/rate-limit"

export const maxDuration = 15

function notFound() {
  return NextResponse.json({ error: "That link is not valid" }, { status: 404 })
}

function callerIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const limited = await checkDoorwayLimit("booking", callerIp(req), token)
    if (limited) return limited

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
    const { token } = await params
    const limited = await checkDoorwayLimit("booking", callerIp(req), token)
    if (limited) return limited

    const body = (await req.json().catch(() => ({}))) as { answer?: unknown; slotId?: unknown; move?: unknown }

    // Self-booking: the invitation left the time open and they picked one,
    // or they already hold one and are moving it.
    if (typeof body.slotId === "string" && body.slotId) {
      const claim = body.move === true
        ? await rescheduleBooking(token, body.slotId)
        : await claimBookingSlot(token, body.slotId)
      if (claim === "not_allowed") {
        return NextResponse.json({ ok: false, outcome: claim, booking: await peekBooking(token) }, { status: 403 })
      }
      if (claim === "not_found") return notFound()
      // "Taken" is a normal answer, not an error: somebody was a second
      // quicker, and the doorway re-renders with that window gone.
      return NextResponse.json({ ok: claim === "claimed", outcome: claim, booking: await peekBooking(token) })
    }

    const answer = body.answer === "confirmed" || body.answer === "declined" ? body.answer : null
    if (!answer) return NextResponse.json({ error: "Choose an option" }, { status: 400 })

    const outcome = await respondToBooking(token, answer)
    if (outcome === "not_found") return notFound()

    return NextResponse.json({ ok: true, outcome, booking: await peekBooking(token) })
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
