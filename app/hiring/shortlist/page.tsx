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
}
interface Shortlist {
  generatedAt: string
  intro: string
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
                    {list.intro && <p className="agd-aside" style={{ marginBottom: 10 }}>{list.intro}</p>}
                    <div className="ag-stack" style={{ gap: 8 }}>
                      {list.entries.map((e) => (
                        <article key={e.ref} className="agd-card hm-static hm-across-row">
                          <span className="hm-across-who">
                            <span className="agd-eyebrow">
                              {e.redacted ? e.ref : e.fullName || e.ref}
                            </span>
                            <span className="ag-meta">
                              {[e.ref, e.currentTitle, e.location, e.years ? `${e.years} yrs` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          <span className="hm-across-what" data-mode={e.action ? "done" : "act"}>
                            {e.action ? ACTION_LABEL[e.action] ?? e.action : "You have not decided yet"}
                          </span>
                          <span className="ag-meta hm-across-wait">
                            {e.redacted ? "name withheld" : ""}
                          </span>
                        </article>
                      ))}
                    </div>
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
