"use client"

/**
 * Roles — the list. Every role in the agency, one row each, with where it
 * is (phase and sub-state), who holds it, who it is waiting on, and the
 * next action, from the same ladder as the header and Today. Today answers
 * "what needs me"; this answers "where is everything". The dashboard's
 * cards were the only way to reach a role until now.
 *
 * Open roles come from /api/agency/today (which already assembles the
 * facts); closed ones from the dashboard payload, which carries them with
 * their closed_at. Filters narrow the recruiter's own view, client-side.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import "../agencies.css"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { SignOut } from "@/components/agency/sign-out"
import { PHASES, type PhaseKey } from "@/lib/agency/phases"
import { ageLabel, type NextAction } from "@/lib/agency/next-action"

interface Row {
  role: { id: string; ref: string; title: string; company: string; ownerId: string | null; ownerName: string | null }
  phase: PhaseKey
  subState: { key: string; chip: string }
  next: NextAction
}
interface DashboardRole {
  id: string
  ref: string
  title: string
  company: string
  status: string
  closed_at: string | null
  /** The caller owns or created it — the dashboard's own flag. */
  mine?: boolean
}
type ClosedRow = DashboardRole

const phaseLabel = (p: PhaseKey) => PHASES.find((x) => x.key === p)?.label ?? p

export default function RolesListPage() {
  const router = useRouter()
  const [state, setState] = useState<"loading" | "ready" | "unauthed" | "error">("loading")
  const [rows, setRows] = useState<Row[]>([])
  const [closed, setClosed] = useState<ClosedRow[]>([])
  const [now, setNow] = useState<string>(() => new Date().toISOString())
  const [q, setQ] = useState("")
  const [view, setView] = useState<"open" | "mine" | "waiting" | "closed">("open")
  const [mine, setMine] = useState<Set<string>>(new Set())

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [t, d] = await Promise.all([fetch("/api/agency/today"), fetch("/api/agency/dashboard")])
        if (t.status === 401) return setState("unauthed")
        if (!t.ok) return setState("error")
        const tb = await t.json()
        if (!live) return
        setRows(Array.isArray(tb.roles) ? (tb.roles as Row[]) : [])
        if (typeof tb.now === "string") setNow(tb.now)
        if (d.ok) {
          const db = await d.json()
          const all = (db.roles ?? []) as DashboardRole[]
          setClosed(all.filter((r) => r.status === "closed"))
          setMine(new Set(all.filter((r) => r.mine).map((r) => r.id)))
        }
        setState("ready")
      } catch {
        if (live) setState("error")
      }
    })()
    return () => {
      live = false
    }
  }, [])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match = (t: string) => !needle || t.toLowerCase().includes(needle)
    if (view === "closed") return closed.filter((r) => match(`${r.title} ${r.company} ${r.ref}`))
    let list = rows
    if (view === "mine") list = list.filter((r) => mine.has(r.role.id))
    if (view === "waiting") list = list.filter((r) => r.next.mode === "wait")
    return list.filter((r) => match(`${r.role.title} ${r.role.company} ${r.role.ref} ${r.role.ownerName ?? ""}`))
  }, [rows, closed, view, q, mine])

  return (
    <>
      <aside className="ag-sidebar">
        <button className="ag-brand" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => router.push("/agencies")}>
          <div className="ag-brand-mark">T</div>
          <div style={{ textAlign: "left" }}>
            <div className="ag-brand-name">Tailr</div>
            <div className="ag-brand-sub">For agencies</div>
          </div>
        </button>
        <AgencySwitcher />
        <AgencyNav current="list" />
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Where everything is</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            One row per role, from the same facts as the role header. Today is the queue; this is the map.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-screen-head">
            <div>
              <h1 className="ag-title">Roles</h1>
              <p className="ag-sub">Every role, where it is, who holds it, and what happens next.</p>
            </div>
          </div>

          <div className="ag-crumbbar" style={{ marginTop: 8 }}>
            <div className="agd-seg" role="group" aria-label="Which roles">
              <button aria-pressed={view === "open"} onClick={() => setView("open")}>Open</button>
              <button aria-pressed={view === "mine"} onClick={() => setView("mine")}>Mine</button>
              <button aria-pressed={view === "waiting"} onClick={() => setView("waiting")}>Waiting on others</button>
              <button aria-pressed={view === "closed"} onClick={() => setView("closed")}>Closed</button>
            </div>
            <span className="ag-grow" />
            <input className="ag-input" style={{ maxWidth: 260 }} placeholder="Search title, client, ref" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search roles" />
          </div>

          {state === "loading" && <div className="ag-card"><div className="ag-card-body" style={{ textAlign: "center", padding: 48 }}><span className="ag-spin" /></div></div>}
          {state === "unauthed" && <div className="ag-card"><div className="ag-card-body"><a className="ag-btn ag-btn-primary" href="/agencies/sign-in" style={{ textDecoration: "none" }}>Sign in</a></div></div>}
          {state === "error" && <p className="ag-banner" role="alert">We could not load the roles. Reload the page.</p>}

          {state === "ready" && view !== "closed" && (
            <div className="agd-today">
              <div className="agd-today-group">
                <div className="agd-today-head">
                  <span className="agd-today-title">{view === "mine" ? "Mine" : view === "waiting" ? "Waiting on others" : "Open"}</span>
                  <span className="agd-today-count">{shown.length}</span>
                </div>
                {shown.length === 0 && <div className="agd-today-empty">{q ? "Nothing matches." : "No roles here."}</div>}
                {(shown as Row[]).map((r) => (
                  <Link key={r.role.id} className={`agd-today-row ${r.next.mode}`} href={`/agencies/roles/${r.role.id}`}>
                    <span className="agd-today-role">
                      <span className="agd-today-role-title">{r.role.title}</span>
                      <span className="agd-today-role-meta">
                        {r.role.company ? `${r.role.company} · ` : ""}
                        {r.role.ref}
                        {r.role.ownerName ? ` · ${r.role.ownerName}` : " · unassigned"}
                      </span>
                    </span>
                    <span className="agd-today-state">
                      <span className="agd-today-chip">{phaseLabel(r.phase)} · {r.subState.chip}</span>
                      <span className="agd-today-next">{r.next.title}</span>
                    </span>
                    <span className="agd-today-since">
                      {r.next.waitingOn.label}
                      {r.next.since ? ` · ${ageLabel(r.next.since, now)}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {state === "ready" && view === "closed" && (
            <div className="agd-today">
              <div className="agd-today-group">
                <div className="agd-today-head">
                  <span className="agd-today-title">Closed</span>
                  <span className="agd-today-count">{shown.length}</span>
                </div>
                {shown.length === 0 && <div className="agd-today-empty">{q ? "Nothing matches." : "Nothing closed yet."}</div>}
                {(shown as ClosedRow[]).map((r) => (
                  <Link key={r.id} className="agd-today-row done" href={`/agencies/roles/${r.id}/close-out`}>
                    <span className="agd-today-role">
                      <span className="agd-today-role-title">{r.title}</span>
                      <span className="agd-today-role-meta">{r.company ? `${r.company} · ` : ""}{r.ref}</span>
                    </span>
                    <span className="agd-today-state">
                      <span className="agd-today-chip">Closed</span>
                      <span className="agd-today-next">The record is complete.</span>
                    </span>
                    <span className="agd-today-since">{r.closed_at ? `closed ${ageLabel(r.closed_at, now)} ago` : ""}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
