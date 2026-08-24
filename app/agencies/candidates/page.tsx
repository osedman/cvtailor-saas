"use client"

/**
 * Candidates — Figma "Recruiter · Candidates — every person the agency holds".
 *
 * The sidebar counted candidates from the first build and the count was never
 * a route: you reached a person only by knowing which role they were on. So
 * somebody rejected from one role was invisible when a second role would have
 * suited them, and "do we already know this person?" could not be answered
 * without opening roles one at a time. Found in Ose's walk-through, 22 Aug.
 *
 * A TABLE, deliberately. This is a place to find somebody, not a dashboard,
 * and rows are the shape that serves scanning and comparison.
 *
 * A REJECTED CANDIDATE IS LISTED, NEVER HIDDEN — the whole point is that a no
 * on one role is not a no on the next. Decision is a fact in a column, never
 * a rank: the default order is when somebody was added, and the filters
 * narrow what you are looking at rather than scoring anyone.
 *
 * Right to work, sponsorship and represent answers are deliberately absent.
 * They belong on the person, not in a list somebody scans — a compliance
 * column in a table is one sort away from being a filter on people.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { SignOut } from "@/components/agency/sign-out"

interface Row {
  id: string
  ref: string
  fullName: string
  currentTitle: string
  redacted: boolean
  roleId: string
  roleRef: string
  roleTitle: string
  roleCompany: string
  roleClosed: boolean
  decision: "shortlist" | "hold" | "reject" | null
  score: number | null
  source: string
  addedAt: string
}

type Filter = "all" | "shortlist" | "reject" | "none"

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "shortlist", label: "Shortlisted" },
  { key: "reject", label: "Rejected" },
  { key: "none", label: "No decision" },
]

const DECISION_LABEL: Record<string, string> = {
  shortlist: "Shortlisted",
  hold: "On hold",
  reject: "Rejected",
}

export default function CandidatesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/candidates")
      if (res.status === 401) return router.push("/agencies")
      if (!res.ok) return setError("Could not load your candidates.")
      const body = await res.json()
      setRows(body.candidates as Row[])
    } catch {
      setError("Could not load your candidates.")
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === "none" ? r.decision !== null : filter !== "all" && r.decision !== filter) return false
      if (!q) return true
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.ref.toLowerCase().includes(q) ||
        r.currentTitle.toLowerCase().includes(q) ||
        r.roleRef.toLowerCase().includes(q) ||
        r.roleCompany.toLowerCase().includes(q)
      )
    })
  }, [rows, filter, query])

  const counts = useMemo(() => {
    const all = rows ?? []
    return {
      all: all.length,
      shortlist: all.filter((r) => r.decision === "shortlist").length,
      reject: all.filter((r) => r.decision === "reject").length,
      none: all.filter((r) => r.decision === null).length,
    }
  }, [rows])

  return (
    <>
      <aside className="ag-sidebar">
        <button
          className="ag-brand"
          style={{ border: "none", background: "none", cursor: "pointer" }}
          onClick={() => router.push("/agencies")}
        >
          <div className="ag-brand-mark">T</div>
          <div style={{ textAlign: "left" }}>
            <div className="ag-brand-name">Tailr</div>
            <div className="ag-brand-sub">For agencies</div>
          </div>
        </button>
        <AgencySwitcher />
        <AgencyNav current="candidates" />
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Everyone you hold</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Across every role, open and closed. A decision on one role says nothing about the next.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
              {" / "}
              <b>Candidates</b>
            </span>
          </div>

          <p className="ag-step-eyebrow">Candidates</p>
          <h1 className="ag-title">Everyone the agency holds</h1>
          <p className="ag-sub">
            Across every role, open and closed. Somebody rejected for one role may be right for the
            next, so nobody is hidden here — search by name, reference, title or client.
          </p>

          {error && <p className="ag-banner" role="alert">{error}</p>}

          {rows === null ? (
            <p className="ag-quiet" aria-live="polite">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="ag-card" style={{ padding: 28 }}>
              <div className="ag-quiet">
                No candidates yet. They are added on a role — open one and use{" "}
                <b>Add candidates</b>, and everyone you add appears here.
              </div>
            </div>
          ) : (
            <div className="ag-card ag-cand-table">
              <div className="ag-cand-filters">
                <input
                  className="ag-input ag-cand-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, ref or current title…"
                  aria-label="Search candidates"
                />
                <div className="ag-cand-chips" role="group" aria-label="Filter by decision">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      className={`ag-cand-chip${filter === f.key ? " on" : ""}`}
                      aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                      <span className="ag-cand-chip-n">{counts[f.key]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="ag-cand-scroll">
                <table className="ag-cand">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Name</th>
                      <th>Current title</th>
                      <th>Role</th>
                      <th>Decision</th>
                      <th className="num">Score</th>
                      <th>Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr
                        key={r.id}
                        tabIndex={0}
                        role="link"
                        // The file, not the workflow: from this agency-wide
                        // list you are doing paperwork, not scoring. The file
                        // links onward to the evidence map.
                        onClick={() => router.push(`/agencies/candidates/${r.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            router.push(`/agencies/candidates/${r.id}`)
                          }
                        }}
                      >
                        <td className="ag-cand-ref">{r.ref}</td>
                        <td className="ag-cand-name">
                          {r.fullName}
                          {r.redacted && <span className="ag-cand-erased">erased</span>}
                        </td>
                        <td>{r.currentTitle || "—"}</td>
                        <td className="ag-cand-role">
                          {r.roleRef ? `${r.roleRef} · ${r.roleCompany || r.roleTitle}` : "—"}
                          {r.roleClosed && <span className="ag-cand-closed">closed</span>}
                        </td>
                        <td>
                          {r.decision ? (
                            <span className={`ag-cand-pill ${r.decision}`}>
                              {DECISION_LABEL[r.decision]}
                            </span>
                          ) : (
                            <span className="ag-cand-none">—</span>
                          )}
                        </td>
                        <td className="num">
                          {r.score === null ? <span className="ag-cand-none">Not scored</span> : r.score}
                        </td>
                        <td className="ag-cand-date">
                          {new Date(r.addedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown.length === 0 && (
                  <div className="ag-quiet" style={{ padding: 24 }}>
                    Nobody matches that. {query && "Try a different search, or "}
                    <button className="ag-crumb-link" onClick={() => { setFilter("all"); setQuery("") }}>
                      show everyone
                    </button>
                    .
                  </div>
                )}
              </div>
            </div>
          )}

          {rows !== null && rows.length > 0 && (
            <p className="ag-note-quiet" style={{ marginTop: 14 }}>
              Decisions are made on the role, not here — this is where you find someone. Sorted by
              when they were added.
            </p>
          )}
        </div>
      </main>
    </>
  )
}
