"use client"

/**
 * The candidate's case, wherever the hiring manager decides — Figma board 31,
 * band A (approved 28 Sep 2026).
 *
 * Ose, 28 Sep: "I still can't see the evidence / dossier / CV / even the
 * score in the different rounds (how will the hiring manager see or justify
 * their decision for selection)". The round cards showed a ref and a time;
 * the case the recruiter submitted rendered only on the Shortlist stage.
 *
 * ONE GATE, NOT A NEW ONE. Everything here comes from the same read the
 * Shortlist stage uses — the latest submission addressed to this manager,
 * with the recruiter's disclosure switches as frozen at generation
 * (lib/agency/client-shortlist.ts). Nothing here widens what the client
 * sees: no recruiter notes beyond the narrative the recruiter chose to send,
 * no overrides, no dossier working.
 *
 * WITHHELD IS NOT ABSENT, AND A FAILED LOAD IS NOT AN EMPTY ONE. Each has
 * its own sentence, the same rule CandidateDetail holds.
 */

import { useCallback, useEffect, useState } from "react"
import { CandidateDetail } from "@/components/agency/hm-candidate"
import { HINTS, Hint } from "@/components/agency/hint"
import type { ShortlistDisclosure, ShortlistEntry } from "@/lib/agency/client-shortlist"

export type SubmittedCases =
  | { state: "loading" }
  | { state: "error" }
  /** No submission addressed to this manager on the role. */
  | { state: "none" }
  | { state: "ready"; byRef: Map<string, ShortlistEntry>; disclosure: ShortlistDisclosure }

/** One shortlist read per page; every card on it looks its person up by ref. */
export function useSubmittedCases(roleId: string): { cases: SubmittedCases; reload: () => void } {
  const [cases, setCases] = useState<SubmittedCases>({ state: "loading" })
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/hiring/roles/${roleId}/shortlist`, { cache: "no-store" })
      if (r.status === 404) return setCases({ state: "none" })
      if (!r.ok) return setCases({ state: "error" })
      const b = (await r.json()) as { shortlist?: { entries: ShortlistEntry[]; disclosure: ShortlistDisclosure } }
      if (!b.shortlist) return setCases({ state: "none" })
      setCases({
        state: "ready",
        byRef: new Map(b.shortlist.entries.map((e) => [e.ref, e])),
        disclosure: b.shortlist.disclosure,
      })
    } catch {
      setCases({ state: "error" })
    }
  }, [roleId])
  useEffect(() => {
    void load()
  }, [load])
  return { cases, reload: () => void load() }
}

export function displayName(entry: ShortlistEntry | undefined, ref: string): string {
  if (!entry || entry.redacted || !entry.fullName) return ref
  return entry.fullName
}

/** What the recruiter left out, as one sentence — or null when nothing was. */
export function withheldSentence(d: ShortlistDisclosure): string | null {
  const off = [
    !d.scores ? "scores" : null,
    !d.evidence ? "the evidence" : null,
    !d.cv ? "the CV" : null,
  ].filter(Boolean) as string[]
  if (off.length === 0) return null
  const list = off.length === 1 ? off[0] : `${off.slice(0, -1).join(", ")} or ${off[off.length - 1]}`
  return `Your recruiter did not include ${list} with this submission. Ask them if you need ${off.length === 1 ? "it" : "any of these"} — nothing else on this page has been hidden.`
}

/**
 * The case, summarised on a round card: numbers, the three strongest quotes,
 * gaps and probes — with the whole record (every quote, the CV) one click
 * away in CandidateDetail rather than re-implemented here.
 */
export function CaseSummary({
  roleId,
  refId,
  cases,
  quotes = 3,
  hideWho = false,
}: {
  roleId: string
  refId: string
  cases: SubmittedCases
  quotes?: number
  /** The card head already names them (board 32): show the numbers only. */
  hideWho?: boolean
}) {
  const [open, setOpen] = useState(false)

  if (cases.state === "loading") {
    return (
      <p className="ag-quiet" role="status">
        Loading what your recruiter sent about {refId}…
      </p>
    )
  }
  if (cases.state === "error") {
    return (
      <p className="ag-banner" role="alert">
        We could not load the evidence for {refId}. Nothing is wrong with their record — reload the page.
      </p>
    )
  }
  const entry = cases.state === "ready" ? cases.byRef.get(refId) : undefined
  if (!entry || cases.state !== "ready") {
    return (
      <p className="ag-quiet hm-case-none">
        Your recruiter has not sent you {refId}&apos;s evidence in a submission yet. Ask them for it before you decide.
      </p>
    )
  }

  const d = cases.disclosure
  const name = displayName(entry, refId)
  const strengths = entry.strengths ?? []
  const withheld = withheldSentence(d)

  return (
    <div className="hm-case">
      <div className="hm-case-who">
        {!hideWho && (
          <div className="ag-grow" style={{ minWidth: 0 }}>
            <p className="hm-case-name">{name}</p>
            {entry.currentTitle && <p className="hm-case-title">{entry.currentTitle}</p>}
          </div>
        )}
        {entry.overall !== null && (
          <Hint text={HINTS.fit} tone="fit">
            Fit {Math.round(entry.overall)}
          </Hint>
        )}
        {entry.mustHaveHit !== null && entry.mustHaveTotal !== null && (
          <Hint text={HINTS.mustHaves}>
            {entry.mustHaveHit} of {entry.mustHaveTotal} must-haves
          </Hint>
        )}
      </div>

      {!open && (
        <div className="hm-case-cols">
          {strengths.length > 0 && (
            <section className="hm-case-ev" aria-label={`Evidence for ${name}`}>
              <h4 className="agd-eyebrow">Why they are here · in their words</h4>
              <ul>
                {strengths.slice(0, quotes).map((s, i) => (
                  <li key={`${s.requirement}-${i}`}>
                    <b>{s.requirement}</b>
                    <q>{s.quote}</q>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {((entry.gaps && entry.gaps.length > 0) || (entry.probeAreas && entry.probeAreas.length > 0)) && (
            <section className="hm-case-side">
              {entry.gaps && entry.gaps.length > 0 && (
                <>
                  <h4 className="agd-eyebrow">Known gaps, stated plainly</h4>
                  <p>
                    {entry.gaps.map((g) => g.requirement).join(" · ")} — not in their CV. Nothing is inferred.
                  </p>
                </>
              )}
              {entry.probeAreas && entry.probeAreas.length > 0 && (
                <>
                  <h4 className="agd-eyebrow">Worth asking</h4>
                  <ul>
                    {entry.probeAreas.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      )}

      {withheld && !open && <p className="ag-quiet hm-case-withheld">{withheld}</p>}

      {open && <CandidateDetail roleId={roleId} entry={entry} disclosure={d} />}

      <button className="hm-linkbtn hm-case-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open
          ? "Show less"
          : d.cv && !entry.redacted
            ? `All ${strengths.length === 1 ? "evidence" : `${strengths.length} pieces of evidence`} and ${name}'s CV`
            : `All ${strengths.length === 1 ? "evidence" : `${strengths.length} pieces of evidence`}`}
      </button>
    </div>
  )
}
