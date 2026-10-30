"use client"

/**
 * Briefs — the terms of each search, and where each stands (frame 25).
 *
 * One row per brief: which client, which version, whose move. "Waiting on
 * you" rows first, because a client who has sent back a change is a client
 * waiting. A failed load says so; it never reads as "no briefs yet".
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { SignOut } from "@/components/agency/sign-out"
import type { BriefState, BriefSide } from "@/lib/agency/brief-options"

interface Row {
  id: string
  title: string
  company: string
  contactName: string
  currentVersion: number
  state: BriefState
  waitingOn: BriefSide | null
  createdAt: string
  connectedRoles: number
}
const STATE_WORD: Record<BriefState, string> = {
  draft: "Draft · not sent",
  sent: "Waiting on the client",
  amended: "Client changed it · waiting on you",
  approved: "Approved by both",
  superseded: "Superseded",
}

export default function BriefsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const b = await fetch("/api/agency/briefs")
      if (!b.ok) {
        setRows(null)
        return setError(b.status === 401 ? "Sign in to see your briefs." : "Could not load your briefs. Reload the page.")
      }
      const body = (await b.json()) as { briefs?: Row[] }
      setRows(Array.isArray(body.briefs) ? body.briefs : [])
      setError(null)
    } catch {
      setRows(null)
      setError("Could not load your briefs. Reload the page.")
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const sorted = (rows ?? []).slice().sort((a, b) => {
    const pri = (r: Row) => (r.waitingOn === "recruiter" ? 0 : r.state === "draft" ? 1 : r.waitingOn === "client" ? 2 : 3)
    return pri(a) - pri(b) || b.createdAt.localeCompare(a.createdAt)
  })

  return (
    <div className="ag-app ag-themed">
      <aside className="ag-sidebar">
        <button className="ag-brand" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => router.push("/agencies")}>
          <div className="ag-brand-mark">T</div>
          <div style={{ textAlign: "left" }}>
            <div className="ag-brand-name">Tailr</div>
            <div className="ag-brand-sub">For agencies</div>
          </div>
        </button>
        <AgencySwitcher />
        <AgencyNav current="briefs" />
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Signed by both sides</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>A brief is the terms of a search, one per role. Both sides sign the same version.</div>
        </div>
      </aside>
      <main className="ag-main">
        <div className="ag-screen-head">
          <div>
            <div className="ag-field-label">Briefs</div>
            <h1 className="ag-h1">The terms of each search</h1>
            <p className="ag-lead">
              How a search runs — rounds, decisions, what the client sees — agreed by both sides. Each role has its own brief, written on the role&rsquo;s first step, Role &amp; brief. This is every brief in one list, with whose move it is.
            </p>
          </div>
        </div>

        {error && (
          <p className="ag-banner" role="alert">
            {error}
          </p>
        )}


        {rows === null && !error && <p className="ag-note">Loading…</p>}
        {rows !== null && rows.length === 0 && <p className="ag-note">No briefs yet. Open a role and start its terms on step 01, Role &amp; brief.</p>}
        {sorted.length > 0 && (
          <ul className="ag-brief-list">
            {sorted.map((r) => (
              <li key={r.id} className="ag-brief-row" data-waiting={r.waitingOn === "recruiter" || undefined}>
                <Link href={`/agencies/briefs/${r.id}`} className="ag-brief-row-main">
                  <span className="ag-brief-row-title">{r.title || "Untitled brief"}</span>
                  <span className="ag-meta">
                    {r.company}
                    {r.contactName ? ` · ${r.contactName}` : ""} · v{r.currentVersion}
                    {r.connectedRoles > 0 ? ` · ${r.connectedRoles} role${r.connectedRoles === 1 ? "" : "s"}` : ""}
                  </span>
                </Link>
                <span className={`ag-pill${r.waitingOn === "recruiter" ? " warn" : ""}`}>{STATE_WORD[r.state]}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
