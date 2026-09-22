"use client"

/**
 * The role room · Shortlist stage — Figma frame 23, band D (22 Sep 2026).
 *
 * THIS role's candidates only, as the recruiter sent them, each with the
 * CURRENT truth: once a round has happened the row says what the rounds
 * decided, not the choice made at the shortlist ("declined after round 1",
 * never "you asked to interview them"). Replaces the cross-role Shortlist
 * screen, where you could not tell which role a candidate was for.
 */

import { use, useEffect, useState } from "react"
import { HandOff, HmFrame, RoomHeader, useRoom } from "@/components/agency/hm-room"
import { CandidateDetail } from "@/components/agency/hm-candidate"
import type { ShortlistEntry, ShortlistDisclosure } from "@/lib/agency/client-shortlist"
import { outcomeByRef, outcomeSentence, plannedFor, stageHref } from "@/lib/agency/hm-room"

const ACTION_LABEL: Record<string, string> = {
  interview: "You chose to interview them",
  approve: "You approved them",
  hold: "On hold",
  decline: "Not for this role",
  question: "You asked a question",
}

type Loaded =
  | { state: "loading" }
  | { state: "none" }
  | { state: "error" }
  | { state: "ready"; intro: string; generatedAt: string; entries: ShortlistEntry[]; disclosure: ShortlistDisclosure }

export default function ShortlistStage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const room = useRoom(roleId)
  const [list, setList] = useState<Loaded>({ state: "loading" })
  /**
   * Which candidates are open. A Set rather than one id: reading two people
   * side by side is the actual job, and an accordion that closes the last
   * one makes comparing them a memory test (22 Sep 2026).
   */
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (ref: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })

  useEffect(() => {
    let live = true
    fetch(`/api/hiring/roles/${roleId}/shortlist`)
      .then(async (r) => {
        if (!live) return
        if (r.status === 404) return setList({ state: "none" })
        if (!r.ok) return setList({ state: "error" })
        const b = (await r.json()) as { shortlist?: { intro: string; generatedAt: string; entries: ShortlistEntry[]; disclosure: ShortlistDisclosure } }
        if (!b.shortlist) return setList({ state: "none" })
        setList({ state: "ready", ...b.shortlist })
      })
      .catch(() => live && setList({ state: "error" }))
    return () => {
      live = false
    }
  }, [roleId])

  const outcomes = outcomeByRef(room.rounds)
  const planned = plannedFor(room.rounds)
  const undecided = list.state === "ready" ? list.entries.filter((e) => !e.action && !outcomes.has(e.ref)).length : 0
  const chosen = list.state === "ready" ? list.entries.filter((e) => e.action === "interview" || e.action === "approve").length : 0
  const hasRounds = room.rounds.some((r) => r.status !== "cancelled")

  return (
    <HmFrame screen={room.screen} crumb="Hiring / Roles / Shortlist">
      <RoomHeader room={room} roleId={roleId} here={{ key: "shortlist" }} />

      {list.state === "loading" && <p className="ag-quiet" aria-live="polite">Loading the shortlist…</p>}
      {list.state === "error" && (
        <p className="ag-banner" role="alert">We could not load the shortlist. Reload the page.</p>
      )}
      {list.state === "none" && (
        <section className="agd-band">
          <div className="hm-note-card">
            <p className="hm-note-title">No shortlist has reached this workspace.</p>
            <p>
              If your recruiter sent it by email or as a document, it is in your inbox rather than here — reply
              to them with who you would like to interview.
            </p>
          </div>
        </section>
      )}

      {list.state === "ready" && (
        <section className="agd-band" aria-labelledby="hm-sl">
          <div className="agd-eyebrow-row">
            <h2 className="agd-eyebrow" id="hm-sl">
              {list.entries.length === 1 ? "1 candidate" : `${list.entries.length} candidates`} sent{" "}
              {room.row?.role.recruiterName ? `by ${room.row.role.recruiterName}` : "by your recruiter"}
            </h2>
            <span className="agd-rule" />
          </div>
          {list.intro && (
            <blockquote className="hm-sl-intro">
              <span>From your recruiter</span>
              {list.intro}
            </blockquote>
          )}
          <ul className="hm-sl-list">
            {list.entries.map((e) => {
              const outcome = outcomeSentence(outcomes.get(e.ref), planned)
              const state = outcome ?? (e.action ? ACTION_LABEL[e.action] ?? e.action : "Not decided yet")
              const fwd = outcomes.get(e.ref)?.decision === "advance"
              return (
                <li key={e.ref} className="hm-sl-card">
                  <div className="hm-sl-head">
                    <span className="hm-sl-name">{e.redacted || !e.fullName ? e.ref : e.fullName}</span>
                    <span className="hm-sl-state" data-tone={fwd ? "fwd" : outcome || e.action ? "done" : "open"}>
                      {state}
                    </span>
                  </div>
                  <p className="hm-sl-sub">
                    {[e.ref, e.currentTitle, e.location, e.years ? `${e.years} yrs` : null].filter(Boolean).join(" · ")}
                    {e.mustHaveHit !== null && e.mustHaveTotal !== null ? ` · clears ${e.mustHaveHit} of ${e.mustHaveTotal} must-haves` : ""}
                  </p>
                  {e.narrative ? (
                    <p className="hm-sl-note">{e.narrative}</p>
                  ) : !list.disclosure.notes ? (
                    <p className="hm-sl-gaps">The recruiter&apos;s screening notes are not part of this submission.</p>
                  ) : null}
                  {e.strengths && e.strengths.length > 0 && (
                    <p className="hm-sl-evidence">
                      <b>{e.strengths[0].requirement}:</b> “{e.strengths[0].quote}”
                    </p>
                  )}
                  {e.gaps && e.gaps.length > 0 && (
                    <p className="hm-sl-gaps">Known gaps: {e.gaps.map((g) => g.requirement).join(" · ")}</p>
                  )}
                  {e.redacted && <p className="ag-meta">Name withheld at the candidate&apos;s request.</p>}
                  {/*
                    The rest of what the recruiter disclosed, and the CV.
                    Collapsed by default: the list's job is to be scannable,
                    and the detail's job is to be read.
                  */}
                  <button
                    className="hm-sl-more"
                    onClick={() => toggle(e.ref)}
                    aria-expanded={open.has(e.ref)}
                    aria-controls={`cand-${e.ref}`}
                  >
                    {open.has(e.ref)
                      ? "Hide the evidence"
                      : list.disclosure.cv && !e.redacted
                        ? "See the evidence and CV"
                        : "See the evidence"}
                  </button>
                  {open.has(e.ref) && (
                    <div id={`cand-${e.ref}`}>
                      <CandidateDetail roleId={roleId} entry={e} disclosure={list.disclosure} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {list.state === "ready" &&
        (hasRounds ? (
          <HandOff
            text="Interviews have started. The rounds are where this role is being decided now."
            href={stageHref(roleId, { key: "round", n: 1 })}
            label="Round 1"
            ready
          />
        ) : undecided > 0 || chosen === 0 ? (
          <HandOff
            text="Choose who you want to interview, then offer the times you can do — the candidates you choose book themselves in."
            href={`/hiring/roles/${roleId}/interviews`}
            label="Choose and offer times"
            ready
          />
        ) : (
          <HandOff
            text={`You chose ${chosen === 1 ? "one candidate" : `${chosen} candidates`}. They are picking times from the windows you offered.`}
            href={`/hiring/roles/${roleId}/interviews`}
            label="See who has booked"
            ready={false}
          />
        ))}
    </HmFrame>
  )
}
