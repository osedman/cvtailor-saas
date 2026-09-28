"use client"

/**
 * One candidate, to the hiring manager who was sent them — Figma frame 24,
 * bands E and F (22 Sep 2026).
 *
 * The snapshot has carried the score, every evidence quote and the probe
 * areas since it was built; the shortlist card rendered one quote and
 * dropped the rest. This is the rest — and, as of today, the CV.
 *
 * Two rules the markup holds up:
 *
 *   · WITHHELD IS NOT ABSENT. A switch the recruiter turned off says so, in
 *     words. Rendering "no notes" about a note that exists but was withheld
 *     would be a lie about the recruiter.
 *   · A FAILED LOAD IS NOT AN EMPTY ONE. The CV has four outcomes — loading,
 *     the document, a refusal with its reason, and a failure — and they read
 *     differently from each other.
 */

import { useState } from "react"
import type { ShortlistEntry, ShortlistDisclosure } from "@/lib/agency/client-shortlist"

interface CvPayload {
  ref: string
  fullName: string
  currentTitle: string | null
  text: string
  removed: { emails: number; phones: number; links: number; postcodes: number }
  anythingRemoved: boolean
  sharedBy: string
  redactionVersion: string
}

type CvState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; cv: CvPayload }
  /** The product said no, and said why — not a failure. */
  | { state: "refused"; why: string }
  /** Something broke. Offer the retry; never render this as "no CV". */
  | { state: "error" }

export function CandidateDetail({
  roleId,
  entry,
  disclosure,
}: {
  roleId: string
  entry: ShortlistEntry
  disclosure: ShortlistDisclosure
}) {
  const [cv, setCv] = useState<CvState>({ state: "idle" })

  async function openCv() {
    setCv({ state: "loading" })
    try {
      const res = await fetch(`/api/hiring/roles/${roleId}/candidates/${encodeURIComponent(entry.ref)}/cv`)
      const body = (await res.json().catch(() => ({}))) as { cv?: CvPayload; error?: string }
      if (res.status === 403 || res.status === 404) {
        return setCv({ state: "refused", why: body.error ?? "This CV is not available to you." })
      }
      if (!res.ok || !body.cv) return setCv({ state: "error" })
      setCv({ state: "ready", cv: body.cv })
    } catch {
      setCv({ state: "error" })
    }
  }

  const name = entry.redacted || !entry.fullName ? entry.ref : entry.fullName

  return (
    <div className="hm-cand">
      {/* Score. Withheld and zero are different things, so test for null. */}
      {entry.overall !== null && (
        <div className="hm-cand-score">
          <b className="hm-cand-score-n">{Math.round(entry.overall)}</b>
          {entry.mustHaveHit !== null && entry.mustHaveTotal !== null && (
            <span>
              clears {entry.mustHaveHit} of {entry.mustHaveTotal} must-haves
            </span>
          )}
        </div>
      )}

      {entry.narrative && (
        <section className="hm-cand-block">
          <h4 className="agd-eyebrow">Your recruiter&apos;s note</h4>
          <p>{entry.narrative}</p>
        </section>
      )}

      {entry.strengths && entry.strengths.length > 0 && (
        <section className="hm-cand-block">
          <h4 className="agd-eyebrow">Evidence · in their CV&apos;s own words</h4>
          <ul className="hm-cand-ev">
            {entry.strengths.map((s, i) => (
              <li key={`${s.requirement}-${i}`}>
                <b>{s.requirement}</b>
                <q>{s.quote}</q>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.gaps && entry.gaps.length > 0 && (
        <section className="hm-cand-block">
          <h4 className="agd-eyebrow">Known gaps, stated plainly</h4>
          <p>
            {entry.gaps.map((g) => g.requirement).join(" · ")} — nothing in the CV under{" "}
            {entry.gaps.length === 1 ? "this must-have" : "these must-haves"}. Not inferred either way.
          </p>
        </section>
      )}

      {entry.probeAreas && entry.probeAreas.length > 0 && (
        <section className="hm-cand-block">
          <h4 className="agd-eyebrow">Worth probing at interview</h4>
          <p>{entry.probeAreas.join(" · ")}</p>
        </section>
      )}

      {/* Withheld, said out loud. Silence here would read as "nothing known". */}
      {(!disclosure.notes || !disclosure.evidence || !disclosure.scores) && (
        <section className="hm-cand-block hm-cand-withheld">
          <h4 className="agd-eyebrow">Withheld in this submission</h4>
          <p>
            Your recruiter did not include{" "}
            {[
              !disclosure.scores ? "the score" : null,
              !disclosure.evidence ? "the evidence and gaps" : null,
              !disclosure.notes ? "their screening notes" : null,
            ]
              .filter(Boolean)
              .join(", ")}
            . Withheld, not absent — ask them if you need it.
          </p>
        </section>
      )}

      {/* The CV. */}
      <section className="hm-cand-block">
        <h4 className="agd-eyebrow">Their CV</h4>
        {!disclosure.cv ? (
          <p className="ag-quiet">
            Your recruiter did not include the CV in this submission. Withheld, not missing — ask them.
          </p>
        ) : entry.redacted ? (
          <p className="ag-quiet">
            This candidate asked to be considered without their details being shared.
          </p>
        ) : cv.state === "idle" ? (
          <button className="agd-tbtn" onClick={openCv}>
            Read {name}&apos;s CV
          </button>
        ) : cv.state === "loading" ? (
          <p className="ag-quiet" role="status">
            Opening the CV…
          </p>
        ) : cv.state === "refused" ? (
          <p className="ag-quiet">{cv.why}</p>
        ) : cv.state === "error" ? (
          <p className="ag-banner" role="alert">
            We could not open the CV. Nothing is wrong with the candidate&apos;s record —{" "}
            <button className="hm-linkbtn" onClick={openCv}>
              try again
            </button>
            .
          </p>
        ) : (
          <article className="hm-cv">
            <p className="hm-cv-seal">
              Shared with you by your recruiter · contact details removed · opening this is recorded
            </p>
            <h5 className="hm-cv-name">{cv.cv.fullName || cv.cv.ref}</h5>
            {cv.cv.currentTitle && <p className="hm-cv-title">{cv.cv.currentTitle}</p>}
            <pre className="hm-cv-text">{cv.cv.text}</pre>
            {cv.cv.anythingRemoved && (
              <p className="hm-cv-note">
                Their phone, email and personal links were removed. Reply to your recruiter to reach them.
              </p>
            )}
          </article>
        )}
      </section>
    </div>
  )
}
