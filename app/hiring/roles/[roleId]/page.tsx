"use client"

/**
 * One role, on the client's side of the wall.
 *
 * The dashboard's role rows used to be dead ends — everything about a role
 * (its brief, its rounds, your decisions) had to be found in other bands.
 * This screen is the click-through: the brief you wrote, where the process
 * has got to, and each candidate's rounds as lanes with your write-up and
 * decision cards inline.
 *
 * Everything renders from the same /api/hiring/dashboard payload the other
 * screens use, filtered to this role — one disclosure filter, one shape, no
 * second door to widen. Candidates appear as refs only, per the rule at the
 * top of getHiringDashboard.
 */

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SignOut } from "@/components/agency/sign-out"
import {
  EmptyBand,
  HiringNav,
  RoundActions,
  RoundProgress,
} from "@/components/agency/hm-shared"
import { RoleHeader } from "@/components/agency/role-header"
import type { HiringBrief, HiringDashboard, HiringRound } from "@/lib/agency/types"

type Screen = "loading" | "unauthed" | "not_linked" | "error" | "ready"

const BRIEF_STATUS_LINE: Record<string, string> = {
  submitted: "With your recruiter — nothing is needed from you until they come back on it.",
  accepted: "Accepted — your recruiter is working it.",
  declined: "Your recruiter declined this brief; their reason is on the record.",
}

export default function HiringRolePage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const [screen, setScreen] = useState<Screen>("loading")
  const [data, setData] = useState<HiringDashboard | null>(null)
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

  const rounds = useMemo(
    () => (data?.rounds ?? []).filter((r) => r.role_id === roleId && r.status !== "cancelled"),
    [data, roleId]
  )
  const brief: HiringBrief | null = useMemo(
    () => (data?.briefs ?? []).find((b) => b.role_id === roleId) ?? null,
    [data, roleId]
  )
  const byCandidate = useMemo(() => {
    const m = new Map<string, HiringRound[]>()
    for (const r of rounds) {
      const list = m.get(r.candidate_ref) ?? []
      list.push(r)
      m.set(r.candidate_ref, list)
    }
    return m
  }, [rounds])

  const title = brief?.role_title || rounds[0]?.role_title || "This role"
  const known = brief !== null || rounds.length > 0

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
          / {screen === "ready" ? title : "Role"}
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
          <EmptyBand title="Sign in to see this role." body="Sign in from the dashboard first." />
        )}
        {screen === "not_linked" && (
          <EmptyBand
            title="This account has no client access yet."
            body="Hiring-manager access is given by invitation only — ask your recruiter for one."
          />
        )}
        {screen === "error" && (
          <EmptyBand
            title="We could not load this role."
            body="Reload the page. If it keeps failing, tell your recruiter."
          />
        )}

        {screen === "ready" && data && !known && (
          <EmptyBand
            title="Nothing of yours on this role."
            body="Either it belongs to a different contact, or nothing has been briefed or booked against it yet."
          />
        )}

        {screen === "ready" && data && known && <RoleHeader roleId={roleId} hat="client" />}
        {screen === "ready" && data && known && (
          <>
            <section className="agd-hero">
              <p className="agd-date">{brief ? [brief.team, brief.location].filter(Boolean).join(" · ") || "Your role" : "Opened by your recruiter"}</p>
              <h1 className="agd-h1">{title}</h1>
              {brief && (
                <p className="agd-sub">
                  {BRIEF_STATUS_LINE[brief.status] ?? ""}
                  {brief.comp ? ` Comp: ${brief.comp}.` : ""}
                </p>
              )}
            </section>

            <section className="agd-band" aria-labelledby="hm-role-loop">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-role-loop">
                  Where each candidate is
                </h2>
                <span className="agd-rule" />
                <span className="agd-aside">round 1 → round 2 → outcome</span>
              </div>
              {byCandidate.size > 0 ? (
                <div className="ag-stack" style={{ gap: 8 }}>
                  {[...byCandidate.entries()].map(([ref, list]) => (
                    <div key={ref} className="hm-loop-row agd-card hm-static">
                      <span className="ag-meta" style={{ minWidth: 64 }}>{ref}</span>
                      <RoundProgress rounds={list} planned={2} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="No interviews on this role yet."
                  body="When the shortlist arrives and you have offered times, your recruiter books the rounds and they appear here."
                />
              )}
            </section>

            {rounds.length > 0 && (
              <section className="agd-band" aria-labelledby="hm-role-rounds">
                <div className="agd-eyebrow-row">
                  <h2 className="agd-eyebrow" id="hm-role-rounds">
                    The rounds
                  </h2>
                  <span className="agd-rule" />
                </div>
                <div className="ag-stack" style={{ gap: 12 }}>
                  {rounds.map((r) => (
                    <RoundActions key={r.id} round={r} onDone={reload} />
                  ))}
                </div>
              </section>
            )}

            <p className="agd-foot">
              <b>NOTE</b>
              <span style={{ maxWidth: "88ch" }}>
                Candidates are never rejected automatically, here or anywhere in Tailr. Anything
                you do on this page is attributed to you by name and written to your
                recruiter&apos;s audit log.
              </span>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
