"use client"

/**
 * The hiring manager's Interviews screen — the selection process, on their
 * side of the wall.
 *
 * Split out of the dashboard on 23 Aug 2026: write-ups, decisions and the
 * diary were all being performed inside one long page, which made the
 * interview phase feel like furniture rather than a place. This screen owns
 * three things and nothing else:
 *
 *   1. What you owe — rounds that happened and need your write-up or decision.
 *   2. What is coming — booked rounds, in order.
 *   3. Your diary — the windows you have offered, and offering more.
 *
 * Grouped by role, with each candidate's rounds as lanes (R1 → R2 → outcome),
 * so the transition between rounds is visible instead of implied. Same data,
 * same rules as everywhere else on this side: /api/hiring/* only, refs never
 * names, decisions are signals about rounds and remove nobody.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SignOut } from "@/components/agency/sign-out"
import {
  EmptyBand,
  HiringNav,
  OfferTimes,
  RoundActions,
  RoundProgress,
  SlotChip,
} from "@/components/agency/hm-shared"
import type { HiringDashboard, HiringRound } from "@/lib/agency/types"

type Screen = "loading" | "unauthed" | "not_linked" | "error" | "ready"

export default function HiringInterviewsPage() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [data, setData] = useState<HiringDashboard | null>(null)
  const [offering, setOffering] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const reload = () => setRefresh((n) => n + 1)

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
  }, [refresh])

  const rounds = useMemo(() => (data?.rounds ?? []).filter((r) => r.status !== "cancelled"), [data])

  /** Rounds grouped by role, candidates grouped inside — the loop as a shape,
   * not a flat list. */
  const byRole = useMemo(() => {
    const roles = new Map<string, { title: string; byCandidate: Map<string, HiringRound[]> }>()
    for (const r of rounds) {
      const role = roles.get(r.role_id) ?? { title: r.role_title || "Untitled role", byCandidate: new Map() }
      const list = role.byCandidate.get(r.candidate_ref) ?? []
      list.push(r)
      role.byCandidate.set(r.candidate_ref, list)
      roles.set(r.role_id, role)
    }
    return roles
  }, [rounds])

  const owed = useMemo(
    () => rounds.filter((r) => r.status === "completed" && !r.latest_decision),
    [rounds]
  )
  const upcoming = useMemo(
    () =>
      rounds
        .filter((r) => r.status === "scheduled")
        .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")),
    [rounds]
  )
  const decided = useMemo(() => rounds.filter((r) => r.latest_decision), [rounds])

  const links = data?.links ?? []
  const slots = data?.slots ?? []

  return (
    <main className="ag-main agd-main hm-main">
      <div className="agd-topbar">
        <div className="ag-brand-mark" aria-hidden="true">
          T
        </div>
        <span className="agd-crumb">
          <Link href="/hiring" style={{ color: "inherit", textDecoration: "none" }}>
            Hiring
          </Link>{" "}
          / Interviews
        </span>
        <span className="agd-spacer" />
        {screen === "ready" && (
          <>
            <span className="ag-pill hm-role-chip">Hiring manager</span>
            <SignOut door="consumer" />
          </>
        )}
      </div>

      {screen === "ready" && <HiringNav />}

      <div className="agd-page" aria-busy={screen === "loading"}>
        {screen === "loading" && (
          <div className="ag-card">
            <div className="ag-card-body" style={{ textAlign: "center", padding: 48 }}>
              <span className="ag-spin" />
            </div>
          </div>
        )}
        {screen === "unauthed" && (
          <EmptyBand
            title="Sign in to see your interviews."
            body="Your email address and a link we send you — no password. Sign in from the dashboard."
          />
        )}
        {screen === "not_linked" && (
          <EmptyBand
            title="This account has no client access yet."
            body="Hiring-manager access is given by invitation only — ask your recruiter for one."
          />
        )}
        {screen === "error" && (
          <EmptyBand
            title="We could not load your interviews."
            body="Reload the page. If it keeps failing, tell your recruiter — nothing you have done is lost."
          />
        )}

        {screen === "ready" && data && (
          <>
            <section className="agd-hero">
              <h1 className="agd-h1">
                {owed.length > 0
                  ? `${owed.length} round${owed.length === 1 ? "" : "s"} need${owed.length === 1 ? "s" : ""} your say.`
                  : upcoming.length > 0
                    ? `${upcoming.length} interview${upcoming.length === 1 ? "" : "s"} coming up.`
                    : "Nothing is waiting on you."}
              </h1>
              <p className="agd-sub">
                Meet the person, write up what happened, then advance or not. The write-up comes
                first — your decision should rest on a record, not a memory. Declining never
                removes anyone; it is your signal on the round.
              </p>
            </section>

            {/* ── 1. What you owe ─────────────────────────────────────────── */}
            <section className="agd-band" aria-labelledby="hm-owed">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-owed">
                  Needs your write-up or decision
                </h2>
                <span className="agd-rule" />
              </div>
              {owed.length > 0 ? (
                <div className="ag-stack" style={{ gap: 12 }}>
                  {owed.map((r) => (
                    <RoundActions key={r.id} round={r} onDone={reload} />
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="Nothing owed."
                  body="When a round happens, its card opens here for your write-up and decision. Nothing moves on a candidate until you have had your say."
                />
              )}
            </section>

            {/* ── 2. The loop, role by role ───────────────────────────────── */}
            <section className="agd-band" aria-labelledby="hm-loop">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-loop">
                  The loop, role by role
                </h2>
                <span className="agd-rule" />
                <span className="agd-aside">round 1 → round 2 → outcome</span>
              </div>
              {byRole.size > 0 ? (
                <div className="ag-stack" style={{ gap: 12 }}>
                  {[...byRole.entries()].map(([roleId, role]) => (
                    <article key={roleId} className="agd-card hm-static" style={{ display: "block" }}>
                      <p className="agd-eyebrow" style={{ marginBottom: 10 }}>
                        <Link href={`/hiring/roles/${roleId}`} style={{ color: "inherit" }}>
                          {role.title} →
                        </Link>
                      </p>
                      <div className="ag-stack" style={{ gap: 8 }}>
                        {[...role.byCandidate.entries()].map(([ref, list]) => (
                          <div key={ref} className="hm-loop-row">
                            <span className="ag-meta" style={{ minWidth: 64 }}>{ref}</span>
                            <RoundProgress rounds={list} planned={2} />
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="No rounds yet."
                  body="Once your recruiter books a candidate into one of your windows, the loop appears here — each candidate's rounds in order, with where it got to."
                />
              )}
            </section>

            {/* ── 3. Coming up, then your diary ───────────────────────────── */}
            <section className="agd-band" aria-labelledby="hm-upcoming">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-upcoming">
                  Coming up
                </h2>
                <span className="agd-rule" />
              </div>
              {upcoming.length > 0 ? (
                <div className="ag-stack" style={{ gap: 12 }}>
                  {upcoming.map((r) => (
                    <RoundActions key={r.id} round={r} onDone={reload} />
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="Nothing booked."
                  body="Offer times below — your recruiter books candidates into the windows you give them, and the interviews appear here."
                />
              )}
            </section>

            <section className="agd-band" aria-labelledby="hm-avail">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-avail">
                  Your availability
                </h2>
                <span className="agd-rule" />
                <button
                  className="agd-tbtn primary"
                  onClick={() => setOffering(true)}
                  disabled={links.length === 0}
                >
                  Offer times
                </button>
              </div>
              {offering && (
                <OfferTimes
                  links={links}
                  onDone={(changed) => {
                    setOffering(false)
                    if (changed) reload()
                  }}
                />
              )}
              {slots.length > 0 ? (
                <div className="hm-slots">
                  {slots.map((slot) => (
                    <SlotChip key={slot.id} slot={slot} onWithdraw={reload} />
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="No times offered."
                  body="Windows you say you are free in appear here as chips, and drop out once your recruiter books one. Nothing is ever booked into your calendar without you offering the time first."
                />
              )}
            </section>

            {decided.length > 0 && (
              <p className="agd-foot">
                <b>DECIDED</b>
                <span style={{ maxWidth: "88ch" }}>
                  {decided.length} round{decided.length === 1 ? "" : "s"} carry your decision — each
                  one is on its role&apos;s screen, in words, with the date. Deciding again replaces
                  yours; nothing here removes anyone from the process.
                </span>
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
