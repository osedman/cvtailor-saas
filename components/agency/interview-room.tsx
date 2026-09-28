"use client"

/**
 * The interview room — one candidate, all of their rounds, the one that needs
 * them open. Figma frame 13, band B.
 *
 * Built 17 September 2026 from Ose walking staging: "we need to do a pop-up
 * window for each candidate ... a distinct UI that helps the hire manager
 * perform those rounds and see the rounds."
 *
 * IT IS A PLACE, NOT A POP-UP. It has a URL and answers a cold load, because
 * a write-up is exactly the thing somebody starts, gets called away from, and
 * comes back to. Opened from the loop it is a panel over the loop; opened from
 * a link it is a page. That is the same @modal intercept candidate detail has
 * used since 14 Sep, and reusing it means Escape, the backdrop, focus return
 * and the scroll lock are already solved and already pinned.
 *
 * THE WRITE-UP GATES THE DECISION, and the gate reads from the SERVER
 * (`hasDebrief`) falling back to what just happened in this tab. Component
 * state alone meant a client who wrote one up and reloaded got an empty box
 * and no way through — a reload is the test.
 *
 * THE DRAFT SURVIVES. The most expensive thing to lose here is a paragraph
 * about a person written ten minutes after meeting them, so it persists per
 * round as they type and outlives Escape, a reload and a misclick. Saving
 * stays explicit, because "saved" is a promise about a server.
 *
 * WHAT IS DELIBERATELY NOT HERE: any sign of a second interviewer.
 * `round_artifacts.round_id` is UNIQUE — one write-up per round, with no
 * author on it — so "Priya has not written hers yet" is not a fact this
 * schema can state. The Figma frame promised it; the data model cannot, and
 * inventing it would be worse than leaving it out.
 *
 * And no capture: no recording, no transcription, no enrichment. That gate is
 * the DPIA's, not this screen's.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { InterviewRoom as Room, RoomRound } from "@/lib/agency/interview-room"

const DECISIONS: Array<{ key: "advance" | "hold" | "decline"; label: string; note: string }> = [
  { key: "advance", label: "Advance", note: "" },
  { key: "hold", label: "Hold", note: "not this wave" },
  { key: "decline", label: "Not for this role", note: "" },
]

const draftKey = (roundId: string) => `tailr:debrief:${roundId}`

function whenText(r: RoomRound): string {
  if (!r.scheduledAt) return "No time set"
  const d = new Date(r.scheduledAt)
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
}

export function InterviewRoom({
  roleId,
  candidateRef,
  inModal = false,
}: {
  roleId: string
  candidateRef: string
  /** Suppresses page chrome. Nothing else differs between the two entrances. */
  inModal?: boolean
}) {
  const router = useRouter()
  const [room, setRoom] = useState<Room | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading")
  const [notes, setNotes] = useState("")
  const [justWritten, setJustWritten] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hiring/roles/${roleId}/rounds/${encodeURIComponent(candidateRef)}`)
      if (res.status === 404) return setState("missing")
      if (!res.ok) return setState("error")
      const body = (await res.json()) as { room: Room }
      setRoom(body.room)
      setState("ready")
    } catch {
      setState("error")
    }
  }, [roleId, candidateRef])

  useEffect(() => {
    void load()
  }, [load])

  const current = useMemo(
    () => room?.rounds.find((r) => r.id === room.currentRoundId) ?? null,
    [room]
  )

  // Restore a draft for THIS round, keyed by round id so two candidates'
  // half-written impressions can never land on each other.
  useEffect(() => {
    if (!current) return
    try {
      setNotes(window.localStorage.getItem(draftKey(current.id)) ?? "")
    } catch {
      /* a private window is not a reason to fail */
    }
    setJustWritten(false)
  }, [current])

  function onNotes(v: string) {
    setNotes(v)
    if (!current) return
    try {
      window.localStorage.setItem(draftKey(current.id), v)
    } catch {
      /* storage can be off; the box still works */
    }
  }

  const written = Boolean(current?.hasDebrief || justWritten)

  async function saveDebrief() {
    if (!current || !notes.trim()) return
    setBusy("debrief")
    setError(null)
    try {
      const res = await fetch("/api/hiring/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: current.id, answers: [], notes }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        return setError(body.error || "That did not save.")
      }
      setJustWritten(true)
      await load()
    } catch {
      setError("That did not save.")
    } finally {
      setBusy(null)
    }
  }

  async function decide(decision: "advance" | "hold" | "decline") {
    if (!current) return
    setBusy(decision)
    setError(null)
    try {
      const res = await fetch("/api/hiring/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: current.id, decision }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        return setError(body.error || "That did not save.")
      }
      // The draft has become a record; it must not resurface on the next round.
      try {
        window.localStorage.removeItem(draftKey(current.id))
      } catch {
        /* nothing to clean up */
      }
      setNotes("")
      await load()
    } catch {
      setError("That did not save.")
    } finally {
      setBusy(null)
    }
  }

  if (state === "loading") {
    return (
      <div className="hm-room" data-modal={inModal}>
        <p className="ag-quiet" aria-live="polite">Opening the room…</p>
      </div>
    )
  }
  if (state === "missing") {
    return (
      <div className="hm-room" data-modal={inModal}>
        <p className="hm-room-title">This interview is not yours to open.</p>
        <p className="hm-room-note">
          You can open a room for somebody your recruiter has actually sent you. If you think that
          is wrong, ask them — nothing about the candidate has changed.
        </p>
      </div>
    )
  }
  if (state === "error" || !room) {
    return (
      <div className="hm-room" data-modal={inModal}>
        <p className="hm-room-title">We could not open this room.</p>
        <p className="hm-room-note">Reload the page. Nothing you have written is lost.</p>
      </div>
    )
  }

  const { candidate, role, rounds } = room
  const lastPlanned = role.plannedRounds

  return (
    <div className="hm-room" data-modal={inModal}>
      {/* WHO, and where in the plan. "of 3" is the role's own number now — it
          was a hardcoded 2 on both hiring-manager screens until 17 Sep, which
          told a three-round process it was on its last. */}
      <div className="hm-room-head">
        <div className="ag-grow" style={{ minWidth: 0 }}>
          <h1 className="hm-room-name">{candidate.fullName || candidate.ref}</h1>
          <p className="hm-room-sub">
            {[candidate.ref, candidate.currentTitle, `${role.title} · ${role.ref}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {current && (
          <span className="hm-room-where">
            Round {current.roundNumber} of {lastPlanned}
          </span>
        )}
      </div>

      {/* THEIR ROUNDS, in order. The chain is the thing frame 13 called the
          room's spine: you can see what happened before without leaving. */}
      <ol className="hm-room-rounds">
        {rounds.length === 0 && (
          <li className="hm-room-round" data-kind="todo">
            <span className="hm-room-rn">NO ROUNDS YET</span>
            <span className="hm-room-when">Your recruiter books the first one</span>
          </li>
        )}
        {rounds.map((r) => {
          const kind =
            r.decision ? "done" : r.id === room.currentRoundId ? "now" : r.status === "cancelled" ? "off" : "todo"
          return (
            <li key={r.id} className="hm-room-round" data-kind={kind}>
              <span className="hm-room-mark" aria-hidden="true">
                {kind === "done" ? "✓" : kind === "now" ? "●" : "○"}
              </span>
              <span className="hm-room-rn">ROUND {r.roundNumber}</span>
              <span className="hm-room-when">{whenText(r)}</span>
              <span className="ag-grow" />
              <span className="hm-room-state">
                {r.decision
                  ? `You said ${r.decision === "advance" ? "advance" : r.decision === "hold" ? "hold" : "not for this role"}`
                  : r.status === "cancelled"
                    ? "Cancelled"
                    : r.status === "completed"
                      ? r.hasDebrief
                        ? "Written up · needs your decision"
                        : "Needs your write-up"
                      : "Booked"}
              </span>
            </li>
          )
        })}
      </ol>

      {/* WHAT THEY ARE DECIDING AGAINST. Straight out of the submission
          snapshot — what the client was sent, frozen at generation. They
          approved this shortlist weeks ago and have not seen it since. */}
      {(candidate.narrative || candidate.strengths.length > 0 || candidate.gaps.length > 0) && (
        <section className="hm-room-ev" aria-labelledby="room-ev-h">
          <div className="hm-room-ev-head">
            <h2 className="hm-room-ev-title" id="room-ev-h">What you are deciding against</h2>
            {candidate.mustHaveTotal !== null && (
              <span className="hm-room-ev-meta">
                {candidate.mustHaveHit ?? 0} of {candidate.mustHaveTotal} must-haves evidenced
              </span>
            )}
          </div>
          {candidate.narrative && <p className="hm-room-ev-body">{candidate.narrative}</p>}
          {candidate.gaps.length > 0 && (
            <p className="hm-room-ev-gaps">
              <b>Known gaps:</b> {candidate.gaps.join(" · ")}
            </p>
          )}
        </section>
      )}

      {error && <p className="ag-banner" role="alert">{error}</p>}

      {/* THE ROUND THAT NEEDS THEM — or an honest statement that none does. */}
      {current ? (
        <>
          <section className="hm-room-act" aria-labelledby="room-act-h">
            <p className="hm-room-eyebrow">
              ROUND {current.roundNumber} · WRITE IT UP FIRST
            </p>
            <h2 className="hm-room-act-title" id="room-act-h">What happened?</h2>
            <p className="hm-room-note">
              Your decision should rest on a record rather than a memory, so the buttons below open
              once this is saved. Only your recruiter sees it.
            </p>
            <textarea
              className="ag-textarea"
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              placeholder="How did they do? What would you want somebody else to know before the next conversation?"
              style={{ minHeight: 120 }}
            />
            <div className="hm-room-actions">
              <button
                className="hm-room-save"
                disabled={busy !== null || !notes.trim()}
                onClick={() => void saveDebrief()}
              >
                {busy === "debrief" ? "Saving…" : written ? "Save changes" : "Save the write-up"}
              </button>
              <span className="hm-room-draft">
                {written ? "Saved" : notes.trim() ? "Draft kept as you type" : ""}
              </span>
            </div>
          </section>

          <section className="hm-room-dec" data-open={written} aria-labelledby="room-dec-h">
            <p className="hm-room-eyebrow" id="room-dec-h">
              {written
                ? room.atFinalRound
                  ? "THIS WAS THE LAST PLANNED ROUND"
                  : "THEN YOUR DECISION"
                : "THEN YOUR DECISION — OPENS WHEN THE WRITE-UP IS SAVED"}
            </p>
            <div className="hm-room-dec-row">
              {DECISIONS.map((d) => (
                <button
                  key={d.key}
                  className="hm-room-dec-btn"
                  disabled={!written || busy !== null}
                  onClick={() => void decide(d.key)}
                >
                  {busy === d.key ? "Saving…" : d.label}
                  {d.note && <span className="hm-room-dec-note">{d.note}</span>}
                </button>
              ))}
            </div>
            <p className="hm-room-note">
              {room.atFinalRound
                ? `Round ${current.roundNumber} of ${lastPlanned} planned. Advancing here ends the loop and your recruiter takes it to close-out — you can still ask them for another round.`
                : "Nobody is removed by any of these, and the candidate is not told. Your recruiter sees the signal and decides what happens next."}
            </p>
          </section>
        </>
      ) : (
        <section className="hm-room-act" data-quiet="true">
          <p className="hm-room-eyebrow">NOTHING NEEDS YOU</p>
          <h2 className="hm-room-act-title">
            {rounds.some((r) => r.decision) ? "You have had your say." : "No interview to write up yet."}
          </h2>
          <p className="hm-room-note">
            {rounds.some((r) => r.decision)
              ? "This room stays readable. A decision is append-only — what is above is the record of it, not a form to fill in again."
              : "Once a booked interview has happened, it opens here for your write-up and your decision."}
          </p>
        </section>
      )}

      {!inModal && (
        <button className="hm-room-back" onClick={() => router.push(`/hiring/roles/${roleId}/interviews`)}>
          ← Back to the loop
        </button>
      )}
    </div>
  )
}
