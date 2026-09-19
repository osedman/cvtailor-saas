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

export interface PoolPerson {
  userId: string
  name: string
  headline: string
  arc: string
  matchedOn: string[]
  gaps: string[]
  relevance: number
  evidenceCount: number
  switching: boolean
  recommendationId: string | null
  state: string | null
}

export interface MatchingState {
  enabled: boolean
  minScore?: number | null
  scanQueued?: boolean
  lastScanAt?: string | null
  /**
   * When another scan is allowed. THE ANTI-PROBING CONTROL, not a cost one:
   * without a cooldown a recruiter could move the threshold, rescan, and read
   * the bucketed count changing, which over a few iterations says something
   * about individual people.
   *
   * It has to be ON SCREEN. This was explained on the card that publishing
   * replaced, and dropping it made "Update score" look broken — the score
   * saves, no scan runs, and nothing says why.
   */
  nextScanAllowedAt?: string | null
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
  pool,
  minScore,
  onMinScoreChange,
  onPublish,
  busy,
  canPublish,
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
  /** Everyone who may be shown, not only those a scan accepted. */
  pool: { people: PoolPerson[] } | null
  /** The draft threshold, live while it is being typed. */
  minScore: number
  onMinScoreChange: (n: number) => void
  /** Publish, re-publish with a new minimum, or pause. */
  onPublish: (enabled: boolean) => void
  busy: boolean
  canPublish: boolean
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
  const nextAllowed = matching?.nextScanAllowedAt ? new Date(matching.nextScanAllowedAt) : null
  const cooldownUntil = nextAllowed && nextAllowed > new Date() ? nextAllowed : null
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

          {/*
            PUBLISHING LIVES HERE (19 Sep 2026, Ose). It was a separate card
            below the step content, so the thing you switch on and the thing
            that shows you what it did were two different places on the
            screen. One window: decide, then watch.

            The copy is carried over verbatim from that card — it was written
            carefully and says exactly what the scan does and does not do.
          */}
          <div className="ag-match-publish" data-live={matching?.enabled || undefined}>
            {requirements.length === 0 ? (
              <>
                <p className="ag-note" style={{ marginTop: 0 }}>
                  Matching scores people against this role&apos;s requirements, so it needs them
                  parsed first. Extract them and this turns on.
                </p>
                <button className="ag-btn ag-btn-secondary" style={{ marginTop: 12 }} disabled>
                  Parse requirements first
                </button>
                <p className="ag-note" style={{ marginTop: 8 }}>
                  Nothing has been published and nobody has been scanned.
                </p>
              </>
            ) : (
              <>
                <p className="ag-note" style={{ marginTop: 0 }}>
                  There is no job board. Tailr scans each consumer user&apos;s own evidence — on
                  their side — and quietly nudges the people who fit. Applying is their consent;
                  until someone applies, you see nobody.
                </p>

                <div className="ag-match-publish-row">
                  <span className="ag-match-publish-field">
                    <label className="ag-label" htmlFor="ag-min-score">Minimum score</label>
                    <input
                      id="ag-min-score"
                      className="ag-input"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      style={{ width: 90 }}
                      value={minScore}
                      onChange={(e) => onMinScoreChange(Number(e.target.value))}
                      disabled={busy || !canPublish}
                    />
                    <span className="ag-meta">as scored on arrival — before review or overrides</span>
                  </span>
                  <span className="ag-grow" />
                  <button
                    className={matching?.enabled ? "ag-btn ag-btn-secondary" : "ag-btn ag-btn-coral"}
                    onClick={() => onPublish(!matching?.enabled)}
                    disabled={busy || !canPublish}
                  >
                    {busy && <span className="ag-spin" />}
                    {matching?.enabled ? "Pause matching" : matching ? "Resume matching" : "Publish for matching"}
                  </button>
                  {matching?.enabled && (
                    <button
                      className="ag-btn ag-btn-secondary"
                      onClick={() => onPublish(true)}
                      disabled={busy || !canPublish || minScore === matching.minScore}
                    >
                      Update score
                    </button>
                  )}
                </div>

                {/*
                  WHY NOTHING APPEARS TO HAPPEN (19 Sep 2026). The score saves
                  immediately and the next scan is what uses it — so with the
                  cooldown running, a correct update looks identical to a
                  broken button. Said plainly here, where the button is.
                */}
                {matching?.enabled && (
                  <p className="ag-note" style={{ marginTop: 10 }}>
                    {minScore === matching.minScore && matching.minScore != null && (
                      <>Minimum fit is {matching.minScore}. </>
                    )}
                    {cooldownUntil ? (
                      <>
                        The next scan runs{" "}
                        <b>{cooldownUntil.toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" })}</b>
                        , and your score applies to it. Changing the number does not buy an extra
                        scan — a day between scans is what stops the threshold being used to probe
                        who is in the pool.
                      </>
                    ) : (
                      <>A scan is available now — updating the score runs one.</>
                    )}
                  </p>
                )}
              </>
            )}
          </div>

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

          {/* ── The pool ───────────────────────────────────────────────────
              Everyone who may be shown, with the arc they wrote and what
              they have evidenced. Ordered by overlap, but ordering a list is
              not ranking people: every row here is selectable whatever the
              number says, and the switchers are the point. */}
          <p className="ag-field-label" style={{ marginTop: 26 }}>
            The pool{pool ? ` · ${pool.people.length}` : ""}
          </p>
          {pool === null ? (
            <p className="ag-note">Reading the pool…</p>
          ) : pool.people.length === 0 ? (
            <p className="ag-note">
              Nobody on Tailr has turned on both switches yet — &ldquo;let recruiters see me&rdquo;
              and &ldquo;show me when a role matches&rdquo;. Until somebody does, there is no pool
              to read.
            </p>
          ) : (
            <>
              <ul className="ag-pool">
                {pool.people.map((p) => (
                  <li key={p.userId} className="ag-pool-row" data-switching={p.switching || undefined}>
                    <span className="ag-avatar">{initials(p.name)}</span>
                    <div className="ag-pool-who">
                      <div className="ag-pool-name">
                        {p.name}
                        {p.switching && <span className="ag-pool-tag">may be switching</span>}
                      </div>
                      {p.headline && <div className="ag-pool-headline">{p.headline}</div>}
                      {p.arc && <p className="ag-pool-arc">{p.arc}</p>}
                      {p.matchedOn.length > 0 && (
                        <ul className="ag-pool-evidence">
                          {p.matchedOn.map((line, i) => (
                            <li key={i}>&ldquo;{line}&rdquo;</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="ag-pool-metrics">
                      <span className="ag-pool-rel" aria-label={`Overlap with this role: ${p.relevance} percent`}>
                        <span className="ag-pool-rel-bar"><span style={{ width: `${p.relevance}%` }} /></span>
                        <b>{p.relevance}%</b> of your requirements evidenced
                      </span>
                      <span className="ag-meta">{p.evidenceCount} evidenced claims</span>
                      {p.gaps.length > 0 && (
                        <span className="ag-meta">Nothing yet on {p.gaps.slice(0, 4).join(", ")}</span>
                      )}
                    </div>
                    <div className="ag-pool-act">
                      {p.state === "applied" ? (
                        <span className="ag-meta">Applied</span>
                      ) : p.state === "invited" ? (
                        <span className="ag-meta">Invited</span>
                      ) : p.recommendationId ? (
                        <button
                          className="ag-btn ag-btn-primary"
                          disabled={inviting === p.recommendationId || !canInvite}
                          onClick={() => onInvite(p.recommendationId as string)}
                        >
                          {inviting === p.recommendationId ? "Inviting…" : "Invite to apply"}
                        </button>
                      ) : (
                        <span className="ag-meta">Not matched by the last scan</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="ag-note" style={{ marginTop: 12 }}>
                Everyone here chose to be seen by recruiters. The percentage is how much of THIS
                role they have already evidenced — a reading aid, not a ranking, and nobody is
                excluded by it. Somebody mid-switch scores low on purpose: their arc points here
                and their evidence has not caught up.
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
