"use client"

/**
 * My roles — every role this hiring manager is named on, and where each is.
 *
 * Split out of the dashboard 19 Sep 2026 (Figma frame 15). The dashboard was
 * a roles list, a task list, a rounds list and a diary on one screen; naming
 * the five places is what stops it being a corridor.
 *
 * This place answers ONE question: what am I on, and where has each got to.
 * Not what needs me — that is Tasks — so the rows carry the ladder and the
 * party a role is waiting on, and only the roles where the act is genuinely
 * the hiring manager's carry a control.
 *
 * Reads /api/hiring/today, the same ladder Tasks and the role header read.
 * No second derivation: two would disagree the first time either changed.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { SignOut } from "@/components/agency/sign-out"
import { EmptyBand } from "@/components/agency/hm-shared"
import type { NextAction } from "@/lib/agency/next-action"

type Screen = "loading" | "unauthed" | "not_linked" | "error" | "ready"

interface TodayRow {
  role: { id: string; ref: string; title: string; company: string; recruiterName: string | null }
  subState: { key: string; chip: string }
  next: NextAction
}

export default function MyRolesPage() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [rows, setRows] = useState<TodayRow[]>([])

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch("/api/hiring/today")
        if (!live) return
        if (res.status === 401) return setScreen("unauthed")
        if (res.status === 403) return setScreen("not_linked")
        if (!res.ok) return setScreen("error")
        const body = (await res.json()) as { roles?: TodayRow[] }
        setRows(Array.isArray(body.roles) ? body.roles : [])
        setScreen("ready")
      } catch {
        if (live) setScreen("error")
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const yours = rows.filter((r) => r.next.mode === "act")

  return (
    <main className="ag-main agd-main hm-main">
      <div className="agd-topbar">
        <div className="ag-brand-mark" aria-hidden="true">T</div>
        <span className="agd-crumb">
          <Link href="/hiring" style={{ color: "inherit", textDecoration: "none" }}>Hiring</Link> / My roles
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
        {screen === "unauthed" && (
          <EmptyBand title="Sign in to see your roles." body="Your email address and a link we send you — no password." />
        )}
        {screen === "not_linked" && (
          <EmptyBand
            title="This account has no client access yet."
            body="Hiring-manager access is given by invitation only — ask your recruiter for one."
          />
        )}
        {screen === "error" && (
          <EmptyBand title="We could not load your roles." body="Reload the page. If it keeps failing, tell your recruiter." />
        )}

        {screen === "ready" && (
          <>
            <section className="agd-hero">
              <h1 className="agd-h1">
                {rows.length === 0
                  ? "No roles yet."
                  : rows.length === 1
                    ? "One role."
                    : `${rows.length} roles.`}
              </h1>
              <p className="agd-sub">
                Everything your recruiter has opened for you, and where each one has got to.{" "}
                {yours.length > 0
                  ? `${yours.length === 1 ? "One is" : `${yours.length} are`} waiting on you — those carry a button.`
                  : "Nothing here is waiting on you right now."}
              </p>
            </section>

            <section className="agd-band" aria-labelledby="hm-roles">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-roles">Your roles</h2>
                <span className="agd-rule" />
              </div>
              {rows.length > 0 ? (
                <div className="ag-stack" style={{ gap: 10 }}>
                  {rows.map((r) => (
                    <article key={r.role.id} className="agd-card hm-static hm-across-row">
                      <span className="hm-across-who">
                        <Link href={`/hiring/roles/${r.role.id}`} className="agd-eyebrow" style={{ color: "inherit" }}>
                          {r.role.title} →
                        </Link>
                        <span className="ag-meta">
                          {r.role.ref}
                          {r.role.company ? ` · ${r.role.company}` : ""}
                          {r.role.recruiterName ? ` · ${r.role.recruiterName}` : ""}
                        </span>
                      </span>
                      <span className="hm-across-what" data-mode={r.next.mode}>
                        {r.next.title}
                      </span>
                      {/* No control on somebody else's turn — the same rule
                          the recruiter's loop table keeps. */}
                      {r.next.mode === "act" && r.next.cta ? (
                        <Link className="agd-tbtn primary" href={r.next.cta.href}>
                          {r.next.cta.label} →
                        </Link>
                      ) : (
                        <span className="ag-meta hm-across-wait">
                          {r.next.mode === "done" ? "nothing outstanding" : r.next.waitingOn.label}
                        </span>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="No roles yet."
                  body="Every role your recruiter opens for you appears here, with where it has got to. They open the role; you are named on it."
                />
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
