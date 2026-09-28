"use client"

/**
 * The shortlist while it is still being built, on the hiring manager's
 * Shortlist stage — Figma board 29 (node 571:2), approved by Ose on 28 Sep
 * 2026 with one decision made at approval: "show names for unanswered too".
 *
 * Two places on the stage use it:
 *   A. before any submission — "Being shortlisted · n so far", replacing the
 *      old "nothing has reached this workspace" note;
 *   B. after a submission — "Added since · not sent yet · n", under the
 *      submission view, for anyone shortlisted since it went.
 *
 * NAMES ONLY, and only what the server chose to send: a ref, a name or the
 * reason it is withheld, and when the recruiter added them. The rules for
 * who appears and who is named live in lib/agency/client-shortlisting.ts;
 * nothing here second-guesses them. "Awaiting permission" is still drawn
 * because SHOW_NAMES_BEFORE_PERMISSION may be turned back off — while it is
 * on, the server never sends that state.
 *
 * LIVE. The list refetches when the window regains focus and every 60 s
 * while the tab is visible. A failed refetch keeps the last list and says
 * nothing; only a failed FIRST load is an error, and it is never drawn as
 * an empty list (an empty list would read as "nobody shortlisted"). A 404,
 * 401 or 403 is an answer, not a failure: the list is dropped, never kept.
 */

import { useEffect, useState } from "react"
import type { ShortlistingEntry } from "@/lib/agency/client-shortlisting"

/** How often the list refreshes while the tab is visible. */
export const SHORTLISTING_REFRESH_MS = 60_000

export type ShortlistingState =
  | { status: "loading" }
  | { status: "error" }
  /**
   * The server answered that this role is not the caller's (404), or that
   * they are not signed in / not linked (401, 403). Authoritative, not a
   * failure: nothing is drawn, and no earlier list is kept on screen.
   */
  | { status: "gone" }
  | { status: "ready"; entries: ShortlistingEntry[]; submitted: boolean }

/** What one fetch of the shortlisting came back as. */
export type ShortlistingOutcome =
  | { kind: "ok"; entries: ShortlistingEntry[]; submitted: boolean }
  | { kind: "gone" }
  | { kind: "failed" }

/** Classify a response status: 401/403/404 are answers, other non-2xx are failures. */
export function outcomeOfStatus(status: number): "ok" | "gone" | "failed" {
  if (status >= 200 && status < 300) return "ok"
  if (status === 401 || status === 403 || status === 404) return "gone"
  return "failed"
}

/**
 * The next state after one fetch. A success or an authoritative "gone"
 * always wins; a failure (network, 5xx, bad body) keeps whatever the page
 * already has once something has loaded, and only a failed FIRST load
 * becomes an error.
 */
export function nextShortlistingState(prev: ShortlistingState, outcome: ShortlistingOutcome): ShortlistingState {
  if (outcome.kind === "ok") return { status: "ready", entries: outcome.entries, submitted: outcome.submitted }
  if (outcome.kind === "gone") return { status: "gone" }
  const loaded = prev.status === "ready" || prev.status === "gone"
  return loaded ? prev : { status: "error" }
}

/**
 * The live shortlist for one role. Refetches on window focus and on an
 * interval while the document is visible; both are removed on unmount.
 */
export function useShortlisting(roleId: string): ShortlistingState {
  const [state, setState] = useState<ShortlistingState>({ status: "loading" })

  useEffect(() => {
    let live = true
    // Responses can land out of order (a focus refetch racing the interval);
    // only the newest request may write.
    let seq = 0
    const load = async () => {
      const mine = ++seq
      let outcome: ShortlistingOutcome
      try {
        const r = await fetch(`/api/hiring/roles/${roleId}/shortlisting`, { cache: "no-store" })
        const kind = outcomeOfStatus(r.status)
        if (kind !== "ok") {
          outcome = { kind }
        } else {
          const b = (await r.json()) as { entries?: unknown; submitted?: unknown }
          outcome = Array.isArray(b.entries)
            ? { kind: "ok", entries: b.entries as ShortlistingEntry[], submitted: b.submitted === true }
            : { kind: "failed" }
        }
      } catch {
        outcome = { kind: "failed" }
      }
      if (!live || mine !== seq) return
      setState((prev) => nextShortlistingState(prev, outcome))
    }

    void load()
    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, SHORTLISTING_REFRESH_MS)
    return () => {
      live = false
      window.removeEventListener("focus", onFocus)
      clearInterval(timer)
    }
  }, [roleId])

  return state
}

const DAY_MS = 86_400_000
// Fixed, not toLocaleDateString: ICU spells September "Sept" in en-GB on
// some runtimes, and the board says "26 Sep".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Added today" / "Added yesterday" / "Added 26 Sep", by calendar day. */
export function addedLabel(addedAt: string, nowMs: number): string | null {
  const t = Date.parse(addedAt)
  if (!addedAt || Number.isNaN(t)) return null
  const then = new Date(t)
  const now = new Date(nowMs)
  const dayOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((dayOf(now) - dayOf(then)) / DAY_MS)
  if (days <= 0) return "Added today"
  if (days === 1) return "Added yesterday"
  return `Added ${then.getDate()} ${MONTHS[then.getMonth()]}`
}

/** Up to two initials from a name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0][0] ?? ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : ""
  return (first + last).toUpperCase()
}

const WITHHELD_LINE: Record<NonNullable<ShortlistingEntry["withheld"]>, string> = {
  asked_to_be_withheld: "Asked to be withheld",
  // Not reached while SHOW_NAMES_BEFORE_PERMISSION is on (since 28 Sep 2026);
  // kept so turning the switch back off needs no UI change.
  awaiting_permission: "Name shown once they agree to be put forward",
}

/** The row list, shared by both bands. */
export function ShortlistingRows({ entries, nowMs }: { entries: ShortlistingEntry[]; nowMs: number }) {
  return (
    <ul className="hm-sling-list">
      {entries.map((e) => {
        const named = !e.withheld && e.name ? e.name : null
        const line = e.withheld ? WITHHELD_LINE[e.withheld] : null
        const when = addedLabel(e.addedAt, nowMs)
        return (
          <li key={e.ref} className="hm-sling-row">
            {named ? (
              <span className="hm-sling-avatar" aria-hidden="true">{initialsOf(named)}</span>
            ) : (
              <span className="hm-sling-avatar" data-unknown aria-hidden="true">?</span>
            )}
            <span className="hm-sling-who">
              <span className="hm-sling-name">{named ?? e.ref}</span>
              {line && <span className="hm-sling-why">{line}</span>}
            </span>
            {when && (
              <time className="hm-sling-when" dateTime={e.addedAt}>
                {when}
              </time>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Who is shortlisting, in the two forms a sentence needs. The agency's name
 * only when the caller is linked to exactly one agency — the room's
 * `agencyName` is the caller's FIRST link, which is the wrong firm for a
 * hiring manager linked to two. Otherwise the role's own recruiter (as the
 * room header does), else "your recruiter".
 */
export function shortlisterName({
  agencyName,
  agencyCount,
  recruiterName,
}: {
  agencyName: string | null | undefined
  agencyCount: number
  recruiterName?: string | null
}) {
  const agency = agencyCount === 1 ? (agencyName ?? "").trim() : ""
  const name = agency || (recruiterName ?? "").trim()
  return name ? { lead: name, mid: name } : { lead: "Your recruiter", mid: "your recruiter" }
}

/** A. Before any submission, with at least one person shortlisted. */
export function BeingShortlisted({ entries, agency, nowMs }: { entries: ShortlistingEntry[]; agency: { lead: string; mid: string }; nowMs: number }) {
  return (
    <section className="agd-band" aria-labelledby="hm-sling">
      <div className="agd-eyebrow-row">
        <h2 className="agd-eyebrow" id="hm-sling">Being shortlisted · {entries.length} so far</h2>
        <span className="hm-sling-aside">Updated as {agency.mid} adds people</span>
        <span className="agd-rule" />
      </div>
      <p className="hm-sling-sub">
        {agency.lead} is still building this shortlist. Each name appears the moment they add someone and goes
        if they take them off. Their CV, the evidence and the scores arrive with the submission.
      </p>
      <ShortlistingRows entries={entries} nowMs={nowMs} />
      <p className="hm-sling-foot">
        Nothing to decide yet. When the submission arrives you will read each person here in full and choose who
        to interview.
      </p>
    </section>
  )
}

/** A, empty. Before any submission, with nobody shortlisted yet. */
export function NothingShortlistedYet({ agency }: { agency: { lead: string; mid: string } }) {
  return (
    <section className="agd-band">
      <div className="hm-note-card">
        <p className="hm-note-title">Nothing shortlisted yet.</p>
        <p>
          Names appear here as {agency.mid} adds people to the shortlist. If your recruiter sends it by email
          instead, it will be in your inbox.
        </p>
      </div>
    </section>
  )
}

/** B. After a submission: anyone shortlisted since it went. */
export function AddedSince({ entries, agency, nowMs }: { entries: ShortlistingEntry[]; agency: { lead: string; mid: string }; nowMs: number }) {
  if (entries.length === 0) return null
  return (
    <>
      <hr className="hm-sling-divider" />
      <section className="agd-band" aria-labelledby="hm-sling-since">
        <div className="agd-eyebrow-row">
          <h2 className="agd-eyebrow" id="hm-sling-since">Added since · not sent yet · {entries.length}</h2>
          <span className="agd-rule" />
        </div>
        <p className="hm-sling-sub">
          {agency.lead} has shortlisted these since the submission. Their CV, evidence and scores arrive with the
          next one.
        </p>
        <ShortlistingRows entries={entries} nowMs={nowMs} />
      </section>
    </>
  )
}
