"use client"

/**
 * Shortlist — who the recruiter sent, across every role.
 *
 * Added 19 Sep 2026 (Figma frame 15). The shortlist was reachable only from
 * inside "Set up interviews", which meant looking at the people you were sent
 * required being on your way to booking them.
 *
 * WHY "SHORTLIST" IS THE RIGHT WORD HERE and nowhere else. It is a reserved
 * noun in this product, in two places at once: a value of the recruiter's
 * per-candidate decision enum, and the client-facing name of the deliverable
 * (/portal titles itself Shortlist). THIS is the second of those — the thing
 * the client received — so it is the one place the word is correct as a
 * container. It must still never name the unit the seven steps run on.
 *
 * DISCLOSURE, NOT ROW FILTERING. Everything here comes from
 * /api/hiring/roles/{id}/shortlist, which serves the frozen snapshot the
 * recruiter generated. The client sees what was disclosed to them and
 * nothing else — no recruiter notes, no rejected candidates, no overrides.
 *
 * Deciding still happens on the role's own set-up screen, where the decision
 * is made next to the times being offered. This place shows and links.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { SignOut } from "@/components/agency/sign-out"
import { EmptyBand } from "@/components/agency/hm-shared"
import type { NextAction } from "@/lib/agency/next-action"

type Screen = "loading" | "unauthed" | "not_linked" | "error" | "ready"

interface TodayRow {
  role: { id: string; ref: string; title: string; company: string; recruiterName: string | null }
  next: NextAction
}
interface Entry {
  ref: string
  fullName: string
  currentTitle: string | null
  location: string | null
  years: number | null
  redacted: boolean
  action: string | null
  overall: number | null
  mustHaveHit: number | null
  mustHaveTotal: number | null
  narrative: string | null
  strengths: Array<{ requirement: string; quote: string }> | null
  gaps: Array<{ requirement: string; weight: string }> | null
  probeAreas: string[] | null
}
/** Only the round fields this screen needs; the dashboard sends more. */
interface RoundRow {
  role_id: string
  candidate_ref: string
  round_number: number
  scheduled_at: string | null
  duration_minutes: number
  status: string
}

/** "Mon 21 Sep, 09:00", or a plain phrase when a round has no time yet. */
function whenLabel(iso: string | null): string {
  if (!iso) return "no time set"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "no time set"
  return d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

/**
 * This candidate's live round on this role, if any.
 *
 * `live` is started-and-not-ended, the same two facts cohortStatus and
 * loopState use, so the chip here cannot drift from what the rest of the
 * product says about the same round.
 */
function roundFor(rounds: RoundRow[], roleId: string, ref: string) {
  const nowMs = Date.now()
  const mine = rounds
    .filter((r) => r.role_id === roleId && r.candidate_ref === ref && r.status === "scheduled" && r.scheduled_at)
    .sort((a, b) => Date.parse(a.scheduled_at as string) - Date.parse(b.scheduled_at as string))
  const r = mine[mine.length - 1]
  if (!r) return null
  const starts = Date.parse(r.scheduled_at as string)
  const ends = starts + (r.duration_minutes || 0) * 60_000
  return { ...r, live: starts <= nowMs && nowMs < ends }
}

interface Disclosure {
  scores: boolean
  evidence: boolean
  probes: boolean
  notes: boolean
  logistics: boolean
}
interface Shortlist {
  generatedAt: string
  intro: string
  disclosure: Disclosure
  entries: Entry[]
}

const ACTION_LABEL: Record<string, string> = {
  interview: "You asked to interview them",
  approve: "You approved them",
  hold: "On hold",
  decline: "Not for this role",
  question: "You asked a question",
}

export default function HiringShortlistPage() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [roles, setRoles] = useState<TodayRow[]>([])
  /** roleId → its shortlist, or null when that role has none yet. */
  const [lists, setLists] = useState<Record<string, Shortlist | null>>({})
  /** Rounds across every role, so a row can say which one and when. */
  const [rounds, setRounds] = useState<RoundRow[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hiring/today")
      if (res.status === 401) return setScreen("unauthed")
      if (res.status === 403) return setScreen("not_linked")
      if (!res.ok) return setScreen("error")
      const body = (await res.json()) as { roles?: TodayRow[] }
      const rows = Array.isArray(body.roles) ? body.roles : []
      setRoles(rows)
      setScreen("ready")

      // Best effort: the shortlist is the point of this screen, and losing
      // the round chips must never turn it into an error state.
      void fetch("/api/hiring/dashboard")
        .then((d) => (d.ok ? d.json() : null))
        .then((body) => {
          if (body && Array.isArray(body.rounds)) setRounds(body.rounds as RoundRow[])
        })
        .catch(() => {})

      /*
       * One fetch per role, in parallel. A 404 means "no shortlist on this
       * role for you" — a real and ordinary state, not an error, so it is
       * stored as null and rendered as a sentence rather than a failure.
       */
      const results = await Promise.all(
        rows.map(async (r) => {
          try {
            const s = await fetch(`/api/hiring/roles/${r.role.id}/shortlist`)
            if (!s.ok) return [r.role.id, null] as const
            const sb = (await s.json()) as { shortlist?: Shortlist }
            return [r.role.id, sb.shortlist ?? null] as const
          } catch {
            return [r.role.id, null] as const
          }
        })
      )
      setLists(Object.fromEntries(results))
    } catch {
      setScreen("error")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const withList = roles.filter((r) => lists[r.role.id]?.entries?.length)
  const total = withList.reduce((n, r) => n + (lists[r.role.id]?.entries.length ?? 0), 0)

  return (
    <main className="ag-main agd-main hm-main">
      <div className="agd-topbar">
        <div className="ag-brand-mark" aria-hidden="true">T</div>
        <span className="agd-crumb">
          <Link href="/hiring" style={{ color: "inherit", textDecoration: "none" }}>Hiring</Link> / Shortlist
        </span>
        <span className="agd-spacer" />
        {screen === "ready" && (
          <>
            <span className="ag-pill hm-role-chip">Hiring manager</span>
            <SignOut door="consumer" />
          </>
        )}
      </div>

      <div className="agd-page" aria-busy={screen === "loading"}>
        {screen === "loading" && (
          <div className="ag-card">
            <div className="ag-card-body" style={{ textAlign: "center", padding: 48 }}>
              <span className="ag-spin" />
            </div>
          </div>
        )}
        {screen === "unauthed" && <EmptyBand title="Sign in to see your shortlists." body="Sign in from the dashboard first." />}
        {screen === "not_linked" && (
          <EmptyBand title="This account has no client access yet." body="Ask your recruiter for an invitation." />
        )}
        {screen === "error" && (
          <EmptyBand title="We could not load your shortlists." body="Reload the page. If it keeps failing, tell your recruiter." />
        )}

        {screen === "ready" && (
          <>
            <section className="agd-hero">
              <h1 className="agd-h1">
                {total === 0
                  ? "No shortlist yet."
                  : `${total} candidate${total === 1 ? "" : "s"} sent to you.`}
              </h1>
              <p className="agd-sub">
                Everyone your recruiter has put in front of you, with the evidence behind each in
                the role&apos;s own screen. Choosing who to interview happens there, next to the
                times you are offering.
              </p>
            </section>

            {withList.length > 0 ? (
              withList.map((r) => {
                const list = lists[r.role.id]!
                return (
                  <section key={r.role.id} className="agd-band" aria-label={r.role.title}>
                    <div className="agd-eyebrow-row">
                      <h2 className="agd-eyebrow">{r.role.title}</h2>
                      <span className="agd-rule" />
                      <Link className="agd-tbtn primary" href={`/hiring/roles/${r.role.id}/interviews`}>
                        Open the role →
                      </Link>
                    </div>
                    {/* A message from a person, set as prose. It used to
                        render in .agd-aside — monospace, the face this
                        product reserves for machine data — which made the
                        recruiter's own greeting read like a system log. */}
                    {list.intro && (
                      <blockquote className="hm-sl-intro">
                        <p>{list.intro}</p>
                        {r.role.recruiterName && <cite>— {r.role.recruiterName}</cite>}
                      </blockquote>
                    )}
                    <div className="ag-stack" style={{ gap: 10 }}>
                      {list.entries.map((e) => {
                        const round = roundFor(rounds, r.role.id, e.ref)
                        return (
                        <article key={e.ref} className="agd-card hm-static hm-sl-card">
                          <div className="hm-sl-head">
                            <span className="hm-sl-name">{e.redacted ? e.ref : e.fullName || e.ref}</span>
                            <span className="ag-meta hm-sl-sub">
                              {[e.ref, e.currentTitle, e.location, e.years ? `${e.years} yrs` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            {e.mustHaveHit !== null && e.mustHaveTotal !== null && (
                              <span className="hm-sl-chip">
                                MUST {e.mustHaveHit}/{e.mustHaveTotal}
                              </span>
                            )}
                            {round && (
                              <span className="hm-sl-chip" data-live={round.live || undefined}>
                                {round.live
                                  ? `Round ${round.round_number} · happening now`
                                  : `Round ${round.round_number} · ${whenLabel(round.scheduled_at)}`}
                              </span>
                            )}
                          </div>

                          {/* The recruiter's own words about this person. */}
                          {e.narrative && <p className="hm-sl-note">{e.narrative}</p>}

                          {/* One traced line, and the gaps stated plainly —
                              the same "Known gaps" the client document keeps.
                              Nothing here is inferred: every quote is verbatim
                              from the CV and every gap is an explicit MISSING. */}
                          {e.strengths && e.strengths.length > 0 && (
                            <p className="hm-sl-evidence">
                              <b>{e.strengths[0].requirement}:</b> “{e.strengths[0].quote}”
                            </p>
                          )}
                          {e.gaps && e.gaps.length > 0 && (
                            <p className="hm-sl-gaps">
                              Known gaps: {e.gaps.map((g) => g.requirement).join(" · ")}
                            </p>
                          )}
                          {e.probeAreas && e.probeAreas.length > 0 && (
                            <p className="hm-sl-gaps">Worth probing: {e.probeAreas.join(" · ")}</p>
                          )}

                          <div className="hm-sl-foot">
                            <span className="hm-sl-state" data-mode={e.action ? "done" : "act"}>
                              {e.action ? ACTION_LABEL[e.action] ?? e.action : "You have not decided yet"}
                            </span>
                            {e.redacted && <span className="ag-meta">name withheld</span>}
                          </div>
                        </article>
                        )
                      })}
                    </div>
                    {/* Withheld is not the same as absent, and the screen
                        must not imply the recruiter wrote nothing. */}
                    {!list.disclosure.notes && (
                      <p className="hm-sl-withheld">
                        Your recruiter's screening notes are not part of this submission.
                      </p>
                    )}
                  </section>
                )
              })
            ) : (
              <EmptyBand
                title="Nothing sent to you yet."
                body="When your recruiter finishes screening, the shortlist they send appears here — everyone they are putting forward, with the evidence behind each. You will get an email when it lands."
              />
            )}
          </>
        )}
      </div>
    </main>
  )
}
