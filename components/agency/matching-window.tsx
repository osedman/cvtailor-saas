"use client"

/**
 * The matching window — Figma frame 16, approved 19 Sep 2026.
 *
 * Publishing a role used to produce a status pill and a cramped card. This is
 * the window that opens instead: what the scan is matching against, how far it
 * has got, and who consented to be seen.
 *
 * ── THE LINE THIS DOES NOT CROSS ──────────────────────────────────────────
 *
 * Ose asked for "an interactive insights pool of what candidates could be
 * considered". The METHOD is showable. The POOL is not, and the difference is
 * the only reason anybody opts in.
 *
 * `public.recruiter_profile_snapshot` returns null for a matched person who
 * has NOT opted in, from the same code path and with the same timing as for
 * somebody who never matched at all. No flag, no distinct error, no channel a
 * recruiter could read as "there is somebody here". A window that hinted at
 * those people would undo that property, and it is a consent commitment in
 * docs/LEGAL-REVIEW-PACK.md §3.2, not a preference.
 *
 * So, three rules this component keeps:
 *
 *   1. NOBODY IS BROWSED. Only people who matched AND chose to be seen are
 *      listed. There is no search, no filter over the pool, and no way to ask
 *      about a person who is not already here.
 *   2. THE OTHERS STAY ROUNDED. `bucket` is a word — "a handful", "a few" —
 *      never a number. An exact count is a disclosure: watch it move as you
 *      change the threshold and you have learned about individuals.
 *   3. BANDS, NEVER A SCORE. matched_people does not send the score to the
 *      browser, so no ranking of human beings exists on this screen and none
 *      can be reconstructed from it.
 *
 * Progress is LIVENESS, not a count. "Found nobody", "found people who have
 * not applied" and "the scan is broken" must stay distinguishable, which is
 * why the card this replaces refused to show a number too.
 */

import { useCallback, useEffect, useRef } from "react"

/** Two letters, the way every other avatar in this product is built. Copied
 *  rather than imported: the workflow screen declares it inline, and reaching
 *  into a page component from here would be the wrong direction. */
const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"

export interface MatchedPerson {
  recommendationId: string
  name: string
  headline: string
  band: string
  evidence: Array<{ requirement_ref: string; strength: string; quote: string | null }>
  state: string
  invitedAt: string | null
  appliedAt: string | null
}

export interface MatchingState {
  enabled: boolean
  minScore?: number | null
  scanQueued?: boolean
  lastScanAt?: string | null
}

export function MatchingWindow({
  open,
  onClose,
  roleRef,
  requirements,
  matching,
  matched,
  inviting,
  onInvite,
  canInvite,
}: {
  open: boolean
  onClose: () => void
  roleRef: string
  requirements: Array<{ id: string; ref: string; text: string; weight: string }>
  matching: MatchingState | null
  matched: { people: MatchedPerson[]; bucket: string } | null
  inviting: string | null
  onInvite: (recommendationId: string) => void
  canInvite: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  /** Whatever had focus when the window opened, so it can be given back. */
  const opener = useRef<HTMLElement | null>(null)

  const close = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement as HTMLElement
    panel.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close()
      }
    }
    document.addEventListener("keydown", onKey)
    // The screen behind must not scroll while a dialog is over it.
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
      opener.current?.focus?.()
    }
  }, [open, close])

  if (!open) return null

  const musts = requirements.filter((r) => r.weight === "must")
  const scanning = Boolean(matching?.scanQueued)
  const people = matched?.people ?? []

  return (
    <div className="ag-modal" role="presentation">
      {/* Three ways out, because a modal with one is a trap: Escape, the
          backdrop, and the button. */}
      <div className="ag-modal-scrim" onClick={close} />
      <div
        className="ag-modal-panel ag-match-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-win-h"
        tabIndex={-1}
        ref={panel}
      >
        <div className="ag-modal-bar">
          <span className="ag-field-label" style={{ marginBottom: 0 }}>
            {scanning ? `Scanning · ${roleRef}` : `Matching · ${roleRef}`}
          </span>
          <span className="ag-grow" />
          <button className="ag-btn" onClick={close}>Close</button>
        </div>

        <div className="ag-modal-body">
          <h2 className="ag-title" id="match-win-h" style={{ marginBottom: 6 }}>
            Who on Tailr could do this job?
          </h2>
          <p className="ag-sub" style={{ marginBottom: 22 }}>
            Tailr checks people who opted into being seen by recruiters, against the requirements
            you wrote. Nobody is contacted, nothing about this role is shared, and no agency
            browses anyone.
          </p>

          {/* ── What it is matching against ─────────────────────────────── */}
          <p className="ag-field-label">What it is matching against</p>
          <div className="ag-match-chips">
            {requirements.map((r) => (
              <span key={r.id} className="ag-match-chip" data-must={r.weight === "must" || undefined}>
                {r.text.length > 42 ? `${r.text.slice(0, 40)}…` : r.text}
              </span>
            ))}
          </div>
          <p className="ag-note" style={{ marginTop: 10 }}>
            {requirements.length} requirement{requirements.length === 1 ? "" : "s"},{" "}
            {musts.length} of them must-haves
            {matching?.minScore != null ? ` · minimum fit ${matching.minScore}` : ""}. A person is
            only ever considered against what this role asks for — there is no general ranking of
            people, and nothing is scored about anyone that is not a requirement you wrote.
          </p>

          {/* ── The scan, right now ─────────────────────────────────────── */}
          <div className="ag-match-scan" data-scanning={scanning || undefined}>
            <p className="ag-field-label" style={{ marginBottom: 6 }}>The scan, right now</p>
            <p className="ag-match-scan-line">
              {!matching?.enabled
                ? "Not published yet — nothing is being scanned."
                : scanning
                  ? "Checking people who opted in, against your must-haves first."
                  : matching.lastScanAt
                    ? `Last checked ${new Date(matching.lastScanAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
                    : "Published. The first scan is queued and will run shortly."}
            </p>
            {scanning && (
              <>
                <div className="ag-match-bar" aria-hidden="true"><span /></div>
                <p className="ag-note" style={{ marginTop: 8 }}>
                  This usually takes under a minute. You can close this and come back.
                </p>
              </>
            )}
          </div>

          {/* ── Who chose to be seen ────────────────────────────────────── */}
          <p className="ag-field-label" style={{ marginTop: 26 }}>
            Who chose to be seen{people.length > 0 ? ` · ${people.length}` : ""}
          </p>
          {matched === null ? (
            <p className="ag-note">Loading…</p>
          ) : people.length === 0 ? (
            <p className="ag-note">
              Nobody who matched has chosen to be seen yet. That is not the same as nobody matching
              — people control whether recruiters can see them, and they can change it at any time.
            </p>
          ) : (
            <>
              <div className="ag-matched-grid">
                {people.map((p) => (
                  <article key={p.recommendationId} className="ag-matched-card">
                    <div className="ag-matched-head">
                      <span className="ag-avatar">{initials(p.name)}</span>
                      <div className="ag-matched-who">
                        <div className="ag-matched-name">{p.name}</div>
                        {p.headline && <div className="ag-matched-headline">{p.headline}</div>}
                      </div>
                      {/* The band, never a number: matched_people does not
                          send the score to the browser. */}
                      <span className={`ag-band ${p.band === "very strong" ? "hi" : p.band === "strong" ? "med" : "lo"}`}>
                        {p.band}
                      </span>
                    </div>
                    <div className="ag-matched-body">
                      <span className="ag-field-label" style={{ marginBottom: 0 }}>Matched against</span>
                      <div className="ag-matched-evidence">
                        {p.evidence.map((e) => (
                          <span
                            key={e.requirement_ref}
                            className={`ag-ev ${e.strength}`}
                            title={e.quote ?? "MISSING — no evidence for this requirement"}
                          >
                            <span className={`ag-dot ${e.strength}`} />
                            {e.requirement_ref} {e.strength}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="ag-matched-foot">
                      {p.appliedAt ? (
                        <span className="ag-meta">Applied</span>
                      ) : p.invitedAt ? (
                        <span className="ag-meta">
                          Invited · {new Date(p.invitedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      ) : (
                        <button
                          className="ag-btn ag-btn-primary"
                          disabled={inviting === p.recommendationId || !canInvite}
                          onClick={() => onInvite(p.recommendationId)}
                        >
                          {inviting === p.recommendationId ? "Inviting…" : "Invite to apply"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <p className="ag-note" style={{ marginTop: 12 }}>
                A row is what they consented to show: name, headline, band and the evidence that
                matched. Their CV and contact details arrive only if they apply. Bands, never a
                ranking.
              </p>
            </>
          )}

          {/* ── And some who did not ────────────────────────────────────── */}
          {matched && matched.bucket !== "none" && (
            <div className="ag-match-bucket">
              <p className="ag-field-label" style={{ marginBottom: 6 }}>And some who did not</p>
              <p style={{ margin: 0 }}>
                {matched.bucket === "handful" ? "A handful" : "Some"} of the people who matched have
                not chosen to be seen. They stay a rounded count — never listed, never counted
                exactly, and never hinted at again. That is what makes choosing to be seen a real
                choice.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
