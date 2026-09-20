"use client"

/**
 * The hiring manager's shared parts — extracted from app/hiring/page.tsx on
 * 23 Aug 2026, when the client side stopped being one long dashboard and
 * became a workspace with places: Dashboard, Interviews, a screen per role.
 *
 * One definition each for the round card, the window widgets and the
 * nav, imported by every /hiring screen, so the write-up rule ("no artifact,
 * no progression") and the disclosure rules cannot fork between pages.
 *
 * Everything here talks to /api/hiring/* only. Hiring managers hold zero RLS
 * grants (docs/AGENCIES_SCHEMA.md §5.4) — nothing in this file may import a
 * Supabase client, and every payload it renders has already been through the
 * disclosure filter in lib/agency/client-auth.ts.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { HiringLink, HiringRound, HiringSlot, RoundDecision } from "@/lib/agency/types"

// ── Formatters (locale-honest: client components so the reader's own zone wins) ──

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
}

export function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export function fmtWhen(iso: string): string {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`
}

/** Decisions are stored as machine values and were once rendered raw, so a
 * client's own call came back to them as "advance". Both maps stay neutral in
 * tone: a decline is a state for THE ROUND, never a verdict on the person. */
export const DECISION_LABEL: Record<RoundDecision, string> = {
  advance: "Advancing",
  hold: "On hold",
  decline: "Not advancing",
}

export const DECISION_SENTENCE: Record<RoundDecision, string> = {
  advance: "chose to advance this candidate",
  hold: "put this round on hold",
  decline: "chose not to advance this round",
}

// ── Navigation ──────────────────────────────────────────────────────────────

/**
 * The client's own nav. Three places and a primary act — deliberately small,
 * because a hiring manager visits between meetings; this is not their job.
 * Rendered by the workspace screens only, never the doorways (invite stays a
 * doorway, and doorways do not get workspace chrome).
 */
/**
 * The five places, and which one a path belongs to.
 *
 * PURE, AND EXPORTED, so the rules below are tested against paths rather
 * than asserted as a regex over this file's source. The old guard matched the
 * literal string `["/hiring/roles"]`; when /hiring/roles became its own place
 * that string changed and the test failed while the behaviour was correct —
 * a proxy breaking on a safe change, which is the same trap as counting
 * deletes in the seed script.
 */
export interface HiringNavItem {
  href: string
  label: string
  on: boolean
}

/**
 * Does this path get the workspace rail?
 *
 * Doorways do not. /hiring/invite is where somebody accepts an invitation and
 * is not yet inside anything — a rail of five places they cannot reach would
 * be five dead links, which is the same broken promise as a button that does
 * nothing. Pure and exported so the rule is tested against paths rather than
 * scanned for in the component.
 */
export function showsHiringRail(pathname: string): boolean {
  return !pathname.startsWith("/hiring/invite")
}

export function hiringNavFor(pathname: string): HiringNavItem[] {
  /*
   * FIVE PLACES, ONE PER PHASE (19 Sep 2026, Ose — Figma frame 15).
   *
   * This was Home and Interviews. Two items meant everything else lived on
   * the dashboard, and a hiring manager with six live roles had one screen
   * that was a roles list, a task list, a rounds list and a diary at once.
   * Frame 03 argued against a stacked sidebar and was right about the
   * RECRUITER's eighteen links; the client's side has five things in it, and
   * naming them is what stops the dashboard being a corridor.
   *
   * Each place reaches real data. A nav item opening an empty screen is the
   * same broken promise as a button that cannot do anything.
   */
  const onCohort = /^\/hiring\/roles\/[^/]+\/interviews/.test(pathname)
  // A role page is a door opened from a task, so Tasks stays lit there — the
  // same reasoning that kept Home lit before. The TRAILING SLASH matters:
  // /hiring/roles exactly is My roles, /hiring/roles/<id> is a door out of
  // Tasks. Without it, My roles could never light.
  const onRoleDoor = /^\/hiring\/roles\/.+/.test(pathname) && !onCohort

  const exact = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return [
    { href: "/hiring/roles", label: "My roles", on: pathname === "/hiring/roles" },
    { href: "/hiring", label: "Tasks", on: pathname === "/hiring" || onRoleDoor },
    { href: "/hiring/shortlist", label: "Shortlist", on: exact("/hiring/shortlist") },
    { href: "/hiring/interviews", label: "Interviews", on: exact("/hiring/interviews") || onCohort },
    { href: "/hiring/decisions", label: "Decisions", on: exact("/hiring/decisions") },
  ]
}

/*
 * HiringNav is GONE (19 Sep 2026). It was a horizontal strip of uppercase
 * mono pills rendered inside each page's <main>; the five places belong in a
 * left rail in the shell, which is what Figma frame 15 drew and what
 * components/agency/hiring-sidebar.tsx now renders once for every screen.
 *
 * `hiringNavFor` above survives and is the shared rule — the rail reads it,
 * and it is tested against paths rather than asserted as a regex over this
 * file.
 */

// ── Small shared blocks ─────────────────────────────────────────────────────

export function EmptyBand({ title, body }: { title: string; body: string }) {
  return (
    <div className="ag-card">
      <div className="ag-card-body">
        <p className="ag-card-title" style={{ margin: 0 }}>
          {title}
        </p>
        <p className="ag-note" style={{ marginTop: 6, maxWidth: "62ch" }}>
          {body}
        </p>
      </div>
    </div>
  )
}

export function SlotChip({ slot, onWithdraw }: { slot: HiringSlot; onWithdraw: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function withdraw() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/hiring/availability?slotId=${encodeURIComponent(slot.id)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setErr(body.error || "Could not withdraw that time.")
        return
      }
      onWithdraw()
    } catch {
      setErr("Could not withdraw that time.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="ag-chip hm-static hm-slot">
      {fmtDate(slot.starts_at)}
      <span className="id">
        {fmtTime(slot.starts_at)}–{fmtTime(slot.ends_at)}
      </span>
      {slot.booked ? (
        // Booked times are not withdrawable from here: somebody is expecting
        // that call. Cancelling the interview is the decision that frees it.
        <span className="ag-pill">Booked</span>
      ) : (
        <button
          className="hm-slot-x"
          onClick={withdraw}
          disabled={busy}
          title="Withdraw this time"
          aria-label={`Withdraw ${fmtDate(slot.starts_at)} ${fmtTime(slot.starts_at)}`}
        >
          ×
        </button>
      )}
      {err && <span className="hm-offer-err">{err}</span>}
    </span>
  )
}


// ── The round card ──────────────────────────────────────────────────────────

/**
 * One round, with the two things a hiring manager owes it: the write-up, and
 * the decision.
 *
 * The order on the card is the order of the rule. AGENCIES_SCHEMA.md §5.5 says
 * "no artifact, no progression" — a decision should rest on a record of what
 * happened, not on memory. So the write-up sits above the decision, and the
 * decision buttons stay disabled until something has been written.
 *
 * That rule is what makes declining a recording free: a debrief is an artifact
 * of equal standing to a transcript, so the process can require a record
 * without ever requiring consent.
 *
 * Decline is offered at the same weight as advance, and says what it does. It
 * is a state for THE ROUND — it never removes the candidate, and the server has
 * no code path that would let it.
 */
export function RoundActions({ round, onDone }: { round: HiringRound; onDone: () => void }) {
  const [notes, setNotes] = useState("")
  const [justWritten, setJustWritten] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decided = round.latest_decision
  /**
   * When the write-up opens.
   *
   * Was `status === "completed"`, i.e. after the RECRUITER pressed "Mark
   * done". So a round that finished an hour ago rendered as "Scheduled"
   * with "nothing to do until this has happened" underneath it — over an
   * interview the hiring manager had just walked out of.
   *
   * It opens when the round has ENDED. Saving the write-up is what completes
   * the round (see recordDebrief), so this is the act that moves it on rather
   * than something waiting on one.
   *
   * A missing duration means the end is unknowable, and unknowable counts as
   * ended: better to offer the write-up early than to withhold it for ever.
   */
  const ends = round.scheduled_at
    ? Date.parse(round.scheduled_at) + (Number(round.duration_minutes) > 0 ? Number(round.duration_minutes) * 60_000 : 0)
    : NaN
  const hasEnded = Number.isFinite(ends) && Date.now() >= ends
  const hasStarted =
    !!round.scheduled_at && Number.isFinite(Date.parse(round.scheduled_at)) && Date.parse(round.scheduled_at) <= Date.now()
  /** Started, not yet ended — the same rule cohortStatus and loopState use. */
  const inProgress = round.status === "scheduled" && hasStarted && !hasEnded
  const canWrite = round.status === "completed" || (round.status === "scheduled" && hasEnded)
  // The gate reads from the SERVER's answer, falling back to what just
  // happened in this tab. It used to be component state alone, which meant a
  // client who wrote this up and reloaded got an empty box and no way to
  // their decision without writing a second one. A reload is the test.
  const written = round.has_debrief || justWritten

  async function saveDebrief() {
    if (!notes.trim()) return
    setBusy("debrief")
    setError(null)
    try {
      const res = await fetch("/api/hiring/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: round.id, answers: [], notes }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error || "That did not save.")
        return
      }
      setJustWritten(true)
    } catch {
      setError("That did not save.")
    } finally {
      setBusy(null)
    }
  }

  async function decide(decision: "advance" | "hold" | "decline") {
    setBusy(decision)
    setError(null)
    try {
      const res = await fetch("/api/hiring/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: round.id, decision }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error || "That did not save.")
        return
      }
      onDone()
    } catch {
      setError("That did not save.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="agd-card hm-static hm-round">
      <div className="hm-round-head">
        <div className="ag-grow" style={{ minWidth: 0 }}>
          <p className="agd-eyebrow">
            {round.role_title} · round {round.round_number} · {round.candidate_ref}
          </p>
          <p className="hm-round-when">
            {round.scheduled_at ? fmtWhen(round.scheduled_at) : "No time set"} ·{" "}
            {round.duration_minutes} min
          </p>
        </div>
        {decided ? (
          <span className="ag-pill">{DECISION_LABEL[decided]}</span>
        ) : (
          <span className="ag-pill warn">
            {canWrite
              ? written
                ? "Needs your decision"
                : "Needs your write-up"
              : inProgress
                ? "Happening now"
                : "Scheduled"}
          </span>
        )}
      </div>

      {canWrite && !decided && (
        <>
          <label className="hm-field" htmlFor={`notes-${round.id}`}>
            <span className="ag-field-label">What happened</span>
            <textarea
              id={`notes-${round.id}`}
              className="ag-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 8000))}
              placeholder="What they said, in your words. This is the record your decision rests on."
              disabled={written}
            />
          </label>
          {!written ? (
            <button
              className="agd-tbtn primary"
              onClick={saveDebrief}
              disabled={!notes.trim() || busy === "debrief"}
            >
              {busy === "debrief" ? "Saving…" : "Save the write-up"}
            </button>
          ) : (
            <>
              <p className="agd-aside">Write-up saved. Now your decision.</p>
              <div className="hm-decide">
                <button className="agd-tbtn primary" onClick={() => decide("advance")} disabled={!!busy}>
                  Advance
                </button>
                <button className="agd-tbtn" onClick={() => decide("hold")} disabled={!!busy}>
                  Hold
                </button>
                <button className="agd-tbtn" onClick={() => decide("decline")} disabled={!!busy}>
                  Decline
                </button>
              </div>
              <p className="agd-aside">
                Yours and reversible — deciding again replaces this one. Declining records your
                view of this round; it never removes anyone from the process.
              </p>
            </>
          )}
        </>
      )}

      {!canWrite && !decided && (
        <p className="agd-aside">
          {inProgress
            ? "In the room now. Your write-up opens here the moment it ends."
            : "Nothing to do until this has happened. Your write-up and decision open here afterwards."}
        </p>
      )}

      {/*
        A decided round used to collapse to a bare pill, so the record the
        decision rested on disappeared from the client's own screen the moment
        they made it. It says the decision in words, when it was made, and that
        a write-up is on file.

        It does NOT reproduce the write-up's text. A debrief can be written by
        the recruiter as well as by the client (recordDebrief takes either
        context), so rendering the body here would open a route for recruiter
        working to cross the wall. Existence and date only.
      */}
      {decided && (
        <p className="agd-aside">
          You {DECISION_SENTENCE[decided]}
          {round.latest_decision_at ? ` on ${fmtDate(round.latest_decision_at)}` : ""}.{" "}
          {round.has_debrief
            ? "The write-up it rests on is on file with your recruiter."
            : "No write-up is on file for this round."}{" "}
          Deciding again replaces this; nothing here removes anyone from the process.
        </p>
      )}

      {error && (
        <p className="hm-offer-err" role="alert">
          {error}
        </p>
      )}
    </article>
  )
}

// ── Round progression (per candidate ref, per role) ─────────────────────────

/**
 * Round 1 → round 2 → outcome for one candidate ref, on the client's side of
 * the wall. Same idea as the recruiter's loop lanes, built only from what a
 * client may see: refs, round status, their own decisions. A declined lane
 * stays visible — it is their signal on the round, not the person vanishing.
 */
export function RoundProgress({ rounds, planned }: { rounds: HiringRound[]; planned: number }) {
  const live = rounds.filter((r) => r.status !== "cancelled").sort((a, b) => a.round_number - b.round_number)
  if (live.length === 0) return null
  const lanes = Math.max(planned, live[live.length - 1].round_number)
  const byNumber = new Map(live.map((r) => [r.round_number, r]))
  return (
    <span className="ag-loop-lanes">
      {Array.from({ length: lanes }, (_, i) => i + 1).map((n) => {
        const r = byNumber.get(n)
        const state = !r
          ? "todo"
          : r.status === "scheduled"
            ? "booked"
            : r.latest_decision
              ? r.latest_decision === "decline" ? "declined" : "advanced"
              : "waiting"
        const label = !r
          ? `R${n}`
          : r.status === "scheduled"
            ? `R${n} · ${fmtDate(r.scheduled_at ?? "")}`
            : r.latest_decision
              ? `R${n} ${r.latest_decision === "decline" ? "· not advancing" : "✓"}`
              : `R${n} · yours to write up`
        return (
          <span key={n} className={`ag-loop-lane ${state}`}>
            {label}
          </span>
        )
      })}
    </span>
  )
}

/**
 * "That's all my decisions" — the client's own statement that they have
 * finished deciding on a role.
 *
 * The product used to infer this from the round count against planned_rounds
 * (next-action.ts), which is a plan and not a gate: a client who decided
 * early was told to keep going, and one who wanted an extra round was told
 * to close out. This is the fact that outranks that inference.
 *
 * It closes nothing. The role stays open, the recruiter can still add a
 * candidate, and the retention clock does not start — closing is the
 * recruiter's act. Reopening is one click and writes a row of its own, so
 * the record keeps the whole sequence of minds changed.
 */
export function DecisionsComplete({ roleId }: { roleId: string }) {
  const [completeAt, setCompleteAt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")

  const url = `/api/hiring/roles/${roleId}/decisions-complete`

  useEffect(() => {
    let live = true
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (live && b) setCompleteAt(b.completeAt ?? null)
      })
      .catch(() => {})
      .finally(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [url])

  async function send(action: "completed" | "withdrawn") {
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "That did not save.")
      setCompleteAt(action === "completed" ? body.completion.at : null)
      setNote("")
    } catch {
      /* the band stays as it was rather than claiming something it did not do */
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null

  return (
    <section className="agd-band" aria-labelledby="hm-decisions-complete">
      <div className="agd-eyebrow-row">
        <h2 className="agd-eyebrow" id="hm-decisions-complete">Your decisions</h2>
        <span className="agd-rule" />
      </div>
      {completeAt ? (
        <>
          <p className="agd-sub" style={{ marginBottom: 10 }} role="status">
            You told your recruiter you had finished deciding on{" "}
            {new Date(completeAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.
            They are taking it to close-out. Nothing is closed, and you can still change your mind.
          </p>
          <button className="agd-tbtn" disabled={busy} onClick={() => void send("withdrawn")}>
            {busy ? "Reopening…" : "Actually, I am not finished"}
          </button>
        </>
      ) : (
        <>
          <p className="agd-sub" style={{ marginBottom: 10 }}>
            When you have decided on everyone you want to, say so and your recruiter can take it
            to close-out. It does not close the role, and you can undo it.
          </p>
          <div className="ag-stack" style={{ gap: 8 }}>
            <input
              className="ag-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything you want your recruiter to know (optional)"
            />
            <span>
              <button className="agd-tbtn primary" disabled={busy} onClick={() => void send("completed")}>
                {busy ? "Saving…" : "That's all my decisions"}
              </button>
            </span>
          </div>
        </>
      )}
    </section>
  )
}
