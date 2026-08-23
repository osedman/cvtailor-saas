"use client"

/**
 * The hiring manager's shared parts — extracted from app/hiring/page.tsx on
 * 23 Aug 2026, when the client side stopped being one long dashboard and
 * became a workspace with places: Dashboard, Interviews, a screen per role.
 *
 * One definition each for the round card, the availability widgets and the
 * nav, imported by every /hiring screen, so the write-up rule ("no artifact,
 * no progression") and the disclosure rules cannot fork between pages.
 *
 * Everything here talks to /api/hiring/* only. Hiring managers hold zero RLS
 * grants (docs/AGENCIES_SCHEMA.md §5.4) — nothing in this file may import a
 * Supabase client, and every payload it renders has already been through the
 * disclosure filter in lib/agency/client-auth.ts.
 */

import { useState } from "react"
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
export function HiringNav() {
  const pathname = usePathname() ?? ""
  const items = [
    { href: "/hiring", label: "Dashboard", exact: true },
    { href: "/hiring/interviews", label: "Interviews", exact: false },
  ]
  return (
    <nav className="hm-nav" aria-label="Hiring workspace">
      {items.map((it) => {
        const on = it.exact ? pathname === it.href : pathname.startsWith(it.href)
        return (
          <Link key={it.href} href={it.href} className={`hm-nav-item${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
            {it.label}
          </Link>
        )
      })}
      <span className="ag-grow" />
      <Link href="/hiring/briefs/new" className="agd-tbtn primary hm-nav-cta">
        Post a brief
      </Link>
    </nav>
  )
}

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

export function OfferTimes({ links, onDone }: { links: HiringLink[]; onDone: (changed: boolean) => void }) {
  const [contactId, setContactId] = useState(links[0]?.contactId ?? "")
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const recipient = links.find((l) => l.contactId === contactId) ?? links[0]

  async function offer() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch("/api/hiring/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          // datetime-local has no zone; the browser's own offset is the one
          // the person meant when they typed it.
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setErr(body.error || "Could not offer that time.")
        return
      }
      onDone(true)
    } catch {
      setErr("Could not offer that time.")
    } finally {
      setBusy(false)
    }
  }

  const ready = Boolean(startsAt && endsAt) && !busy

  return (
    <div className="agd-card hm-static hm-offer">
      <div className="hm-offer-row">
        {links.length > 1 && (
          <label className="hm-field">
            <span className="ag-field-label">Offer to</span>
            <select
              className="ag-input"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              {links.map((l) => (
                <option key={l.contactId} value={l.contactId}>
                  {l.company ? `${l.agencyName} · ${l.company}` : l.agencyName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="hm-field">
          <span className="ag-field-label">From</span>
          <input
            className="ag-input"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            autoFocus
          />
        </label>
        <label className="hm-field">
          <span className="ag-field-label">Until</span>
          <input
            className="ag-input"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
        <button className="agd-tbtn primary" onClick={offer} disabled={!ready}>
          {busy ? "Offering…" : "Offer this time"}
        </button>
        <button className="agd-tbtn" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
      {err && (
        <p className="hm-offer-err" role="alert">
          {err}
        </p>
      )}
      <p className="agd-aside">
        {recipient ? <b>{recipient.agencyName}</b> : "Your recruiter"} can book one candidate into
        this window. Nothing reaches your calendar until you offer the time.
      </p>
    </div>
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
  const canWrite = round.status === "completed"
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
            {canWrite ? (written ? "Needs your decision" : "Needs your write-up") : "Scheduled"}
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
          Nothing to do until this has happened. Your write-up and decision open here afterwards.
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
