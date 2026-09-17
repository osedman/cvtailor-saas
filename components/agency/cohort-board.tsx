"use client"

/**
 * The interview cohort's scheduling board.
 *
 * ONE COMPONENT, TWO HATS. The client watches their own cohort fill; the
 * recruiter watches the same board because candidates book themselves now
 * and visibility is what the recruiter gets (Ose, 11 Sep 2026). Rendering
 * it twice would be two boards that could disagree about who is booked.
 *
 * What differs is only the sentence underneath: the client is told they can
 * offer more times, the recruiter is told whose diary it depends on. The
 * rows are identical, because the facts are.
 *
 * Statuses come from lib/agency/cohort-status.ts and are derived, never
 * stored — so nothing here can drift out of step with the rounds.
 */

import { useState } from "react"
import { STATUS_LABEL, STATUS_TONE, cohortSummary, type CohortStatus } from "@/lib/agency/cohort-status"
import type { CohortMember } from "@/lib/agency/cohort"

/**
 * What the board renders is what getCohortBoard returns, so it uses that
 * type rather than a copy of it.
 *
 * It WAS a copy, and on 15 Sep 2026 the server grew a `decided` flag that
 * this file had no way to know about — the same drift that let the booking
 * doorway keep asserting a reason the server had stopped believing. A type
 * is erased at build time and carries no imports with it, so pulling it from
 * lib/agency/cohort.ts drags no server code into the browser bundle.
 */
export type BoardMember = CohortMember

export interface WaveView {
  reserve: string[]
  awaiting: number
  openWindows: number
  waveSize: number | null
  nextReleaseAt: string | null
  plan: { release: number; reason: string; remaining: number }
}

export interface BoardData {
  members: BoardMember[]
  openWindows: number
  now: string
  wave?: WaveView
}

function whenText(iso: string | null, minutes: number): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return "—"
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
  const from = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const to = new Date(d.getTime() + minutes * 60_000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  return `${day}, ${from}–${to}`
}

export function CohortBoard({
  board,
  hat,
  remindEndpoint,
  onChanged,
  offerMoreHref,
  roomHref,
  releaseEndpoint,
}: {
  board: BoardData
  hat: "recruiter" | "client"
  /** PATCH { roundId } sends somebody's link again. */
  remindEndpoint: string
  onChanged: () => void
  /** Where the client goes to offer more windows. */
  offerMoreHref?: string
  /**
   * Where a row opens for the client: the interview room for that candidate.
   * Only the client gets one — a recruiter does not perform rounds, and a
   * door into somebody else's write-up would be the wrong shape entirely.
   */
  roomHref?: (candidateRef: string) => string
  /** POST { release: true } sends the next wave. The client's act, not the recruiter's. */
  releaseEndpoint?: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function remind(roundId: string) {
    setBusy(roundId)
    setNote(null)
    try {
      const res = await fetch(remindEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId }),
      })
      const body = await res.json().catch(() => ({}))
      setNote(
        body?.sent
          ? "Link sent again. The earlier one no longer works."
          : body?.reason === "already_booked"
            ? "They already have a time — nothing to send."
            : "That did not send. Their email may not be one we can write to."
      )
      onChanged()
    } catch {
      setNote("That did not send.")
    } finally {
      setBusy(null)
    }
  }

  async function release() {
    if (!releaseEndpoint) return
    setBusy("wave")
    setNote(null)
    try {
      const res = await fetch(releaseEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release: true }),
      })
      const body = await res.json().catch(() => ({}))
      setNote(
        Array.isArray(body?.invited) && body.invited.length > 0
          ? `${body.invited.length} more invited to book.`
          : typeof body?.sentence === "string"
            ? body.sentence
            : "Nobody new could be invited."
      )
      onChanged()
    } catch {
      setNote("That did not send.")
    } finally {
      setBusy(null)
    }
  }

  const wave = board.wave
  const awaiting = board.members.filter((m) => m.status === "awaiting").length
  const stuck = board.members.filter((m) => m.status === "no_suitable_time").length
  const short = awaiting > board.openWindows

  return (
    <div className="ag-cohort">
      <p className="ag-cohort-summary">{cohortSummary(board.members.map((m) => m.status))}</p>

      {/* The one number that decides whether the people still to book can
          actually book: windows left against people left. */}
      {awaiting > 0 && (
        <p className={`ag-cohort-capacity${short ? " short" : ""}`}>
          {short
            ? `${board.openWindows} window${board.openWindows === 1 ? "" : "s"} left for ${awaiting} still to book. ${hat === "client" ? "Offer more times or somebody will have none to choose from." : "The client needs to offer more times."}`
            : `${board.openWindows} window${board.openWindows === 1 ? "" : "s"} still free.`}
          {hat === "client" && offerMoreHref && short && (
            <>
              {" "}
              <a className="ag-link" href={offerMoreHref}>Offer more times</a>
            </>
          )}
        </p>
      )}

      {/* The reserve: who is chosen but not yet invited, and what has to
          happen before they are. Only shown when waves are actually in use. */}
      {wave && wave.reserve.length > 0 && (
        <div className="ag-cohort-wave">
          <div>
            <strong>
              {wave.reserve.length} in reserve
              {wave.waveSize ? ` · ${wave.waveSize} go out at a time` : ""}
            </strong>
            <span className="ag-meta" style={{ display: "block" }}>
              {wave.plan.release > 0
                ? `${wave.plan.release} can go out now.`
                : wave.nextReleaseAt && Date.parse(wave.nextReleaseAt) > Date.now()
                  ? `The last wave is still choosing. The next is due ${new Date(wave.nextReleaseAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, or sooner if a window frees up.`
                  : "Waiting on free windows."}
            </span>
          </div>
          <span className="ag-grow" />
          {hat === "client" && releaseEndpoint && wave.plan.release > 0 && (
            <button className="ag-btn ag-btn-primary" disabled={busy === "wave"} onClick={() => void release()}>
              {busy === "wave" ? "Inviting…" : `Invite ${wave.plan.release} more`}
            </button>
          )}
        </div>
      )}

      {note && (
        <p className="ag-banner" role="status">
          {note}
        </p>
      )}

      {board.members.length === 0 ? (
        <p className="ag-quiet">Nobody has been invited to interview yet.</p>
      ) : (
        <div className="ag-cohort-rows">
          {board.members.map((m) => (
            <div key={m.roundId} className="ag-cohort-row">
              <div className="ag-cohort-who">
                <span className="ag-cohort-name">{m.candidateName || m.candidateRef}</span>
                <span className="ag-meta">
                  {m.candidateRef}
                  {m.roundNumber > 1 ? ` · round ${m.roundNumber}` : ""}
                </span>
              </div>
              <span className={`ag-pill ag-cohort-status ${STATUS_TONE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
              <span className="ag-cohort-when">{whenText(m.scheduledAt, m.durationMinutes)}</span>
              <span className="ag-cohort-act">
                {/* The way into the room. Present whenever there is a round to
                    look at — a hiring manager should be able to see what they
                    already said, not only what is owed. */}
                {hat === "client" && roomHref && (
                  <a className="ag-btn" href={roomHref(m.candidateRef)}>
                    {m.status === "feedback_due" ? "Write it up" : "Open"}
                  </a>
                )}
                {m.status === "awaiting" && (
                  <button className="ag-btn" disabled={busy === m.roundId} onClick={() => void remind(m.roundId)}>
                    {busy === m.roundId ? "Sending…" : m.chase ? "Chase" : "Send again"}
                  </button>
                )}
                {m.status === "no_suitable_time" && hat === "client" && offerMoreHref && (
                  <a className="ag-btn" href={offerMoreHref}>Offer more times</a>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {stuck > 0 && (
        <p className="ag-note" style={{ marginTop: 8 }}>
          {stuck === 1 ? "One person" : `${stuck} people`} could not make any of the times offered. That is about
          their week, not about their application.
        </p>
      )}
      <p className="ag-note" style={{ marginTop: 8 }}>
        {hat === "client"
          ? "Each candidate picks their own time from the windows you offered. A time taken disappears for everyone else."
          : "Candidates book themselves from the client's windows, and the client decides when the next wave goes. Nothing here seats anyone — sending a link again is the only act."}
      </p>
    </div>
  )
}
