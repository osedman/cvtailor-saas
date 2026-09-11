"use client"

/**
 * Confirm or rearrange an interview — Figma "Candidate · Interview invitation".
 *
 * Four states, and the copy is the feature in every one of them.
 *
 * It NAMES THE COMPANY, which the data-protection notice deliberately does
 * not: you cannot ask somebody to give up a morning without telling them who
 * they are meeting. A considered exception, not an oversight.
 *
 * The JOINING LINK IS WITHHELD until confirmation. A live meeting URL sitting
 * in an unconfirmed inbox is a call somebody can walk into unannounced.
 *
 * DECLINING ASKS FOR NO REASON, and there is no free-text box inviting one. A
 * candidate explaining a hospital appointment to their recruiter's software is
 * a worse product than one that simply asks when suits. The time goes back to
 * the client's board and a person arranges the next one.
 */

import { useCallback, useEffect, useState } from "react"
import { use } from "react"

type Booking = {
  state: "invited" | "confirmed" | "declined" | "cancelled"
  company: string
  agencyName: string
  roundNumber: number
  scheduledAt: string | null
  durationMinutes: number
  meetingUrl: string | null
  openWindows: Array<{ slotId: string; start: string; end: string }>
  needsChoice: boolean
  reschedule: { allowed: boolean; because: string }
}

function whenText(iso: string | null, minutes: number): string {
  if (!iso) return "Time to be confirmed"
  const d = new Date(iso)
  const day = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
  const from = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const to = new Date(d.getTime() + minutes * 60_000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
  return `${day}, ${from} – ${to}`
}

export default function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [showMove, setShowMove] = useState(false)
  const [dead, setDead] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/booking/${encodeURIComponent(token)}`)
      if (!res.ok) return setDead(true)
      const body = await res.json()
      setBooking(body.booking as Booking)
    } catch {
      setDead(true)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  async function answer(value: "confirmed" | "declined") {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/booking/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: value }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Something went wrong.")
        return
      }
      setBooking(body.booking as Booking)
    } catch {
      setError("Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  if (dead) {
    return (
      <main className="cs-wrap">
        <div className="cs-card">
          <p className="cs-eyebrow">Interview</p>
          <h1 className="cs-title">That link is not valid.</h1>
          <p className="cs-body">
            It may have been used already, or the interview may have been rearranged. Reply to the
            email it came from and someone will sort it out.
          </p>
        </div>
      </main>
    )
  }

  if (!booking) {
    return (
      <main className="cs-wrap">
        <div className="cs-card">
          <p className="cs-quiet" aria-live="polite">
            Loading…
          </p>
        </div>
      </main>
    )
  }

  async function claim(slotId: string, move = false) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/booking/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(move ? { slotId, move: true } : { slotId }),
      })
      const body = await res.json().catch(() => ({}))
      if (body?.booking) setBooking(body.booking as Booking)
      if (!res.ok || body?.outcome === "taken") {
        setError(
          body?.outcome === "taken"
            ? "Somebody took that time a moment before you. The times below are the ones still free."
            : "That did not save. Please try again."
        )
      }
    } catch {
      setError("That did not save. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const where = booking.company || "the company"
  const when = whenText(booking.scheduledAt, booking.durationMinutes)

  return (
    <main className="cs-wrap">
      <div className="cs-card">
        {/*
          SELF-BOOKING (11 Sep 2026). An invitation with no time held is an
          invitation to CHOOSE: the candidate picks from what is still free,
          in their own timezone, and the window disappears for everyone else
          the moment they take it. The fixed-time invitation below still
          exists — a recruiter can hold a slot for someone — so the doorway
          answers both.
        */}
        {booking.state === "invited" && booking.needsChoice && (
          <>
            <p className="cs-eyebrow">Your interview</p>
            <h1 className="cs-title">Choose a time that suits you.</h1>
            <p className="cs-body">
              {booking.agencyName} has arranged an interview with {where}. Pick whichever of these
              works — the times are shown in your own timezone.
            </p>
            {error && (
              <p className="cs-error" role="alert">
                {error}
              </p>
            )}
            {booking.openWindows.length === 0 ? (
              <p className="cs-body">
                Every time has been taken. Your recruiter will be in touch with more — nothing about
                your application has changed.
              </p>
            ) : (
              <div className="bk-slots">
                {booking.openWindows.map((w) => (
                  <button key={w.slotId} className="bk-slot" disabled={busy} onClick={() => void claim(w.slotId)}>
                    <span className="bk-slot-day">
                      {new Date(w.start).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                    </span>
                    <span className="bk-slot-time">
                      {new Date(w.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(w.end).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="cs-choice" style={{ marginTop: 14 }}>
              <button className="cs-btn cs-btn-quiet" disabled={busy} onClick={() => answer("declined")}>
                None of these work
              </button>
            </div>
            <p className="cs-small">
              No account needed. If none of them work, say so and your recruiter arranges more — it
              is not a comment on the role, and nothing about your application changes.
            </p>
          </>
        )}

        {booking.state === "invited" && !booking.needsChoice && (
          <>
            <p className="cs-eyebrow">Your interview</p>
            <h1 className="cs-title">A time has been held for you.</h1>
            <p className="cs-body">
              {booking.agencyName} has arranged an interview with {where}. Please say whether it
              works.
            </p>
            <p className="bk-when">{when}</p>
            <dl className="bk-rows">
              <div className="bk-row">
                <dt>Who with</dt>
                <dd>
                  {where} · round {booking.roundNumber}
                </dd>
              </div>
              <div className="bk-row">
                <dt>How</dt>
                <dd>Video call — the joining link appears here once you confirm</dd>
              </div>
              <div className="bk-row">
                <dt>Arranged by</dt>
                <dd>{booking.agencyName}</dd>
              </div>
            </dl>
            {error && (
              <p className="cs-error" role="alert">
                {error}
              </p>
            )}
            <div className="cs-choice">
              <button className="cs-btn" disabled={busy} onClick={() => answer("confirmed")}>
                {busy ? "Saving…" : "Confirm this time"}
              </button>
              <button className="cs-btn cs-btn-quiet" disabled={busy} onClick={() => answer("declined")}>
                I can&apos;t make it
              </button>
            </div>
            <p className="cs-small">
              No account needed. If you cannot make it, the time goes back and someone arranges
              another — it is not a comment on the role, and nothing about your application changes.
            </p>
          </>
        )}

        {/* Moving a time they already hold. The policy and the allowance are
            the client's (interview_settings); the doorway only ever shows
            what those permit, and says why when they do not. */}
        {booking.state === "confirmed" && booking.reschedule.allowed && showMove && (
          <>
            <p className="cs-eyebrow">Move your interview</p>
            <h1 className="cs-title">Pick a different time.</h1>
            <p className="cs-body">
              Your current time stays yours until you choose another, so you cannot end up with none.
            </p>
            {error && (
              <p className="cs-error" role="alert">
                {error}
              </p>
            )}
            {booking.openWindows.length === 0 ? (
              <p className="cs-body">There are no other times free at the moment. Reply to your recruiter and they will sort it out.</p>
            ) : (
              <div className="bk-slots">
                {booking.openWindows.map((w) => (
                  <button key={w.slotId} className="bk-slot" disabled={busy} onClick={() => void claim(w.slotId, true)}>
                    <span className="bk-slot-day">
                      {new Date(w.start).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                    </span>
                    <span className="bk-slot-time">
                      {new Date(w.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(w.end).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="cs-choice" style={{ marginTop: 14 }}>
              <button className="cs-btn cs-btn-quiet" disabled={busy} onClick={() => setShowMove(false)}>
                Keep the time I have
              </button>
            </div>
          </>
        )}

        {booking.state === "confirmed" && !showMove && (
          <>
            <p className="cs-eyebrow">Confirmed</p>
            <h1 className="cs-title">You are booked in.</h1>
            <p className="bk-when">{when}</p>
            <dl className="bk-rows">
              <div className="bk-row">
                <dt>Who with</dt>
                <dd>
                  {where} · round {booking.roundNumber}
                </dd>
              </div>
              {booking.meetingUrl && (
                <div className="bk-row">
                  <dt>Joining link</dt>
                  <dd className="bk-link">
                    <a href={booking.meetingUrl} rel="noopener noreferrer nofollow">
                      {booking.meetingUrl}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {booking.reschedule.allowed ? (
              <div className="cs-choice" style={{ marginTop: 14 }}>
                <button className="cs-btn cs-btn-quiet" onClick={() => setShowMove(true)}>
                  Move this interview
                </button>
              </div>
            ) : booking.reschedule.because ? (
              <p className="cs-small">{booking.reschedule.because}</p>
            ) : null}
            <p className="cs-small">
              The calendar file was attached to the email. If anything else changes, reply to that
              email and {booking.agencyName} will sort it out.
            </p>
          </>
        )}

        {booking.state === "declined" && (
          <>
            <p className="cs-eyebrow">Thanks for saying</p>
            <h1 className="cs-title">That time is back on the board.</h1>
            <p className="cs-body">
              {booking.agencyName} has been told, and someone will be in touch about another time.
              You are still being considered — declining a time says nothing about the role.
            </p>
            <p className="cs-small">You can close this page.</p>
          </>
        )}

        {booking.state === "cancelled" && (
          <>
            <p className="cs-eyebrow">Interview</p>
            <h1 className="cs-title">This interview is no longer scheduled.</h1>
            <p className="cs-body">
              It was cancelled after the invitation went out. Reply to the email it came from and
              {" "}
              {booking.agencyName} will explain where things stand.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
