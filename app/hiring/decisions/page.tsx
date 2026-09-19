"use client"

/**
 * Decisions — what this hiring manager has already said, in their own words.
 *
 * Added 19 Sep 2026 (Figma frame 15) as one of the five places. Decisions
 * were only ever visible on the round they belonged to, which meant "what did
 * I say about that person in March" had no answer short of opening rounds one
 * at a time.
 *
 * READ-ONLY, DELIBERATELY. Decisions are append-only upstream: deciding again
 * replaces yours by adding a new one, and that happens in the room where the
 * write-up is, next to the evidence. A screen that let somebody revise a
 * judgement at a distance from what it was based on would be a worse product,
 * so this one shows and links, and changes nothing.
 *
 * AND IT REMOVES NOBODY. A decline is a signal on a round, never a removal
 * and never a verdict on a person — the copy here says so, because a list of
 * declines with no context is exactly where that reading creeps back in.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SignOut } from "@/components/agency/sign-out"
import { DECISION_LABEL, EmptyBand, fmtWhen } from "@/components/agency/hm-shared"
import type { HiringDashboard, HiringRound } from "@/lib/agency/types"

type Screen = "loading" | "unauthed" | "not_linked" | "error" | "ready"

export default function HiringDecisionsPage() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [data, setData] = useState<HiringDashboard | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch("/api/hiring/dashboard")
        if (!live) return
        if (res.status === 401) return setScreen("unauthed")
        if (res.status === 403) return setScreen("not_linked")
        if (!res.ok) return setScreen("error")
        const body = (await res.json()) as { dashboard?: HiringDashboard }
        if (!body.dashboard) return setScreen("error")
        setData(body.dashboard)
        setScreen("ready")
      } catch {
        if (live) setScreen("error")
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const decided = useMemo(
    () =>
      (data?.rounds ?? [])
        .filter((r) => r.latest_decision)
        .sort((a, b) => (b.scheduled_at ?? "").localeCompare(a.scheduled_at ?? "")),
    [data]
  )

  /** Grouped by role, newest first, so a decision sits with its own loop. */
  const byRole = useMemo(() => {
    const roles = new Map<string, { title: string; rounds: HiringRound[] }>()
    for (const r of decided) {
      const role = roles.get(r.role_id) ?? { title: r.role_title || "Untitled role", rounds: [] }
      role.rounds.push(r)
      roles.set(r.role_id, role)
    }
    return roles
  }, [decided])

  const owed = (data?.rounds ?? []).filter((r) => r.status === "completed" && !r.latest_decision).length

  return (
    <main className="ag-main agd-main hm-main">
      <div className="agd-topbar">
        <div className="ag-brand-mark" aria-hidden="true">T</div>
        <span className="agd-crumb">
          <Link href="/hiring" style={{ color: "inherit", textDecoration: "none" }}>Hiring</Link> / Decisions
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
        {screen === "unauthed" && <EmptyBand title="Sign in to see your decisions." body="Sign in from the dashboard first." />}
        {screen === "not_linked" && (
          <EmptyBand title="This account has no client access yet." body="Ask your recruiter for an invitation." />
        )}
        {screen === "error" && (
          <EmptyBand title="We could not load your decisions." body="Reload the page. Nothing you have decided is lost." />
        )}

        {screen === "ready" && (
          <>
            <section className="agd-hero">
              <h1 className="agd-h1">
                {decided.length === 0
                  ? "Nothing decided yet."
                  : decided.length === 1
                    ? "One decision."
                    : `${decided.length} decisions.`}
              </h1>
              <p className="agd-sub">
                Every round you have had your say on, with the date and your own words. Deciding
                again replaces yours — that happens in the round itself, next to the write-up it
                should rest on.
                {owed > 0
                  ? ` ${owed === 1 ? "One round is" : `${owed} rounds are`} still waiting on you, over in Interviews.`
                  : ""}
              </p>
            </section>

            {byRole.size > 0 ? (
              <section className="agd-band" aria-labelledby="hm-decided">
                <div className="agd-eyebrow-row">
                  <h2 className="agd-eyebrow" id="hm-decided">What you have said</h2>
                  <span className="agd-rule" />
                  <span className="agd-aside">newest first</span>
                </div>
                <div className="ag-stack" style={{ gap: 12 }}>
                  {[...byRole.entries()].map(([roleId, role]) => (
                    <article key={roleId} className="agd-card hm-static" style={{ display: "block" }}>
                      <p className="agd-eyebrow" style={{ marginBottom: 10 }}>
                        <Link href={`/hiring/roles/${roleId}`} style={{ color: "inherit" }}>
                          {role.title} →
                        </Link>
                      </p>
                      <div className="ag-stack" style={{ gap: 8 }}>
                        {role.rounds.map((r) => (
                          <Link
                            key={r.id}
                            href={`/hiring/roles/${roleId}/rounds/${r.candidate_ref}`}
                            className="hm-decision-row"
                          >
                            <span className="ag-meta" style={{ minWidth: 92 }}>
                              {r.candidate_ref} · R{r.round_number}
                            </span>
                            <span className="ag-pill">
                              {DECISION_LABEL[r.latest_decision as keyof typeof DECISION_LABEL] ?? r.latest_decision}
                            </span>
                            <span className="ag-grow ag-meta">
                              {r.scheduled_at ? fmtWhen(r.scheduled_at) : "No time recorded"}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : (
              <EmptyBand
                title="Nothing decided yet."
                body="After each interview you write it up and then say what you think. Both land here, with the date, so you can see what you decided and when."
              />
            )}

            <p className="agd-foot">
              <b>NOTE</b>
              <span style={{ maxWidth: "88ch" }}>
                Not advancing a round is a signal to your recruiter about that round — it is never a
                verdict on the person, and nobody is removed from the process by anything on this
                page. Candidates are never told what you chose.
              </span>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
