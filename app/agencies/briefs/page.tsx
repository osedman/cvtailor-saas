"use client"

/**
 * Client briefs — the recruiter's inbox, and the moment a client's request
 * becomes a role in the pipeline.
 *
 * Built to the signed-off frame "Recruiter · Client briefs inbox" (Figma:
 * Tailr — Hiring Manager Concept, page 02). Light surface: this is part of the
 * agency workflow, not the dark dashboard.
 *
 * Two things here are product decisions, not styling:
 *   - Decline sits beside Accept at equal weight and always asks for a reason.
 *     A brief is a request from a person the recruiter has a relationship
 *     with; burying the decline would make saying no feel like a failure state.
 *   - A declined brief is never removed from this list. The client sees what
 *     they were told, so the recruiter should see it too.
 *
 * Accepting is the only destructive-ish action here (it mints a role ref that
 * cannot be un-minted), so it confirms first, the same way Reset call does on
 * the screening step.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { BriefStatus } from "@/lib/agency/types"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { SignOut } from "@/components/agency/sign-out"

interface BriefRow {
  id: string
  roleTitle: string
  company: string
  contactName: string
  status: BriefStatus
  createdAt: string
  decidedAt: string | null
  roleId: string | null
  roleRef: string | null
  hasJd: boolean
  /** Which agency this brief was sent to — the inbox spans all of yours. */
  agencyId: string
  agencyName: string
  isActiveAgency: boolean
}

type Filter = "all" | "submitted" | "accepted" | "declined"

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "submitted", label: "Awaiting you" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
]

export default function AgencyBriefsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<BriefRow[] | null>(null)
  const [filter, setFilter] = useState<Filter>("submitted")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/briefs")
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error || "Could not load briefs.")
        setRows([])
        return
      }
      const body = (await res.json()) as { briefs?: BriefRow[] }
      setRows(body.briefs ?? [])
      setError(null)
    } catch {
      setError("Could not load briefs.")
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => {
    if (!rows) return []
    return filter === "all" ? rows : rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const waiting = useMemo(
    () => (rows ?? []).filter((r) => r.status === "submitted").length,
    [rows]
  )

  async function act(id: string, action: "accept" | "decline", why?: string) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/agency/briefs/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "decline" ? { action, reason: why } : { action }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        roleId?: string
      }
      if (!res.ok) {
        setError(body.error || "That did not go through.")
        setBusy(null)
        return
      }
      setConfirming(null)
      setDeclining(null)
      setReason("")
      // Accepting mints the role — go straight into it. The server has
      // always returned roleId; the page used to throw it away and leave the
      // recruiter standing in the inbox, which is half of how "post a brief"
      // never became "start the intake".
      if (action === "accept" && body.roleId) {
        router.push(`/agencies/roles/${body.roleId}`)
        return
      }
      await load()
    } catch {
      setError("That did not go through.")
    } finally {
      setBusy(null)
    }
  }

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
        <AgencyNav current="briefs" />
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Their words</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            A brief is the client&apos;s own request. Accepting turns it into a role; declining keeps it, with your reason.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
              {" / "}
              <b>Client briefs</b>
            </span>
            <span className="ag-grow" />
            <button className="ag-btn ag-btn-secondary" onClick={() => router.push("/agencies")}>← Dashboard</button>
          </div>
        <header className="ag-screen-head">
          <p className="ag-step-eyebrow">Client briefs</p>
          {/* Never claim "nothing waiting" when the load FAILED — an empty inbox
              and a refused request would read identically, which is how a broken
              integration hides in plain sight. */}
          <h1 className="ag-title">
            {rows === null || error
              ? "Client briefs"
              : waiting === 0
                ? "Nothing waiting on you"
                : `${waiting} brief${waiting === 1 ? "" : "s"} waiting on you`}
          </h1>
          <p className="ag-sub">
            A brief is what your client asked for, in their words. Accepting turns it into a role
            with its own reference and opens step 01 — declining keeps the request on the record
            with your reason.
          </p>
        </header>

        <div className="ag-filters" role="group" aria-label="Filter briefs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`ag-chip${filter === f.key ? " on" : ""}`}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
            >
              {f.label}
            </button>
          ))}
          <span className="ag-pill">Audit logged</span>
        </div>

        {error && (
          <p className="ag-banner" role="alert">
            {error}
          </p>
        )}

        {rows === null ? (
          <p className="ag-quiet" aria-live="polite">
            Loading…
          </p>
        ) : error ? null : shown.length === 0 ? (
          <div className="ag-card ag-brief-empty">
            <p className="ag-brief-empty-title">
              {filter === "submitted" ? "No briefs waiting." : "Nothing here yet."}
            </p>
            <p className="ag-note">
              {filter === "submitted"
                ? "When a hiring manager you have invited posts a brief, it lands here for you to accept or decline."
                : "Briefs your clients post appear here. Invite a client contact from Client access to get started."}
            </p>
            <p style={{ marginTop: 12 }}>
              <Link className="ag-btn ag-btn-secondary" href="/agencies/clients">
                Client access
              </Link>
            </p>
          </div>
        ) : (
          <div className="ag-brief-list">
            {shown.map((row) => (
              <article
                key={row.id}
                className={`ag-card ag-brief${row.status === "submitted" ? " awaiting" : ""}`}
              >
                <div className="ag-brief-head">
                  <div className="ag-grow">
                    <p className="ag-brief-who">
                      {/* Named only when it is NOT the workspace you are
                          standing in: the common case stays uncluttered, and
                          the exception — a brief waiting in your other agency
                          — is exactly what used to be invisible. Acting on it
                          needs no switch; the server resolves the tenant from
                          the brief. */}
                      {!row.isActiveAgency && (
                        <span className="ag-pill" style={{ marginRight: 8 }}>
                          {row.agencyName}
                        </span>
                      )}
                      {row.company} · {row.contactName} · {relative(row.createdAt)}
                      {row.hasJd && (
                        <span className="ag-meta" style={{ marginLeft: 8, color: "var(--ag-calm)" }}>
                          JD attached — accepting carries it into intake
                        </span>
                      )}
                    </p>
                    <h2 className="ag-brief-title">{row.roleTitle}</h2>
                  </div>
                  <StatusPill row={row} />
                </div>

                {row.status === "submitted" ? (
                  <div className="ag-brief-actions">
                    {confirming === row.id ? (
                      <>
                        <span className="ag-note ag-brief-confirm">
                          Accept this brief? It mints your next role reference, which cannot be
                          un-minted.
                        </span>
                        <button
                          className="ag-btn ag-btn-primary"
                          onClick={() => act(row.id, "accept")}
                          disabled={busy === row.id}
                        >
                          {busy === row.id ? "Creating…" : "Yes, create the role"}
                        </button>
                        <button className="ag-btn ag-btn-secondary" onClick={() => setConfirming(null)}>
                          Keep waiting
                        </button>
                      </>
                    ) : declining === row.id ? (
                      <>
                        <label className="ag-field-label" htmlFor={`why-${row.id}`}>
                          Why are you declining this brief?
                        </label>
                        <input
                          id={`why-${row.id}`}
                          className="ag-input ag-brief-reason"
                          value={reason}
                          onChange={(e) => setReason(e.target.value.slice(0, 200))}
                          placeholder="Outside our desk — we do not cover contract analytics"
                          autoFocus
                        />
                        <button
                          className="ag-btn ag-btn-primary"
                          onClick={() => act(row.id, "decline", reason.trim() || undefined)}
                          disabled={busy === row.id}
                        >
                          {busy === row.id ? "Sending…" : "Decline"}
                        </button>
                        <button
                          className="ag-btn ag-btn-secondary"
                          onClick={() => {
                            setDeclining(null)
                            setReason("")
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="ag-btn ag-btn-primary"
                          onClick={() => setConfirming(row.id)}
                        >
                          Accept — create the role
                        </button>
                        <button
                          className="ag-btn ag-btn-secondary"
                          onClick={() => setDeclining(row.id)}
                        >
                          Decline with a reason
                        </button>
                        <span className="ag-note ag-brief-note">
                          Accepting mints the next reference for your agency and drops you into
                          01 · Intake with these fields already in place.
                        </span>
                      </>
                    )}
                  </div>
                ) : row.status === "accepted" && row.roleId ? (
                  <p className="ag-brief-note">
                    <Link className="ag-link" href={`/agencies/roles/${row.roleId}`}>
                      Open {row.roleRef || "the role"} →
                    </Link>
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}

          <p className="ag-note-quiet" style={{ marginTop: 28 }}>
            A declined brief is kept, with its reason — the client sees what you told them.
          </p>
        </div>
      </main>
    </>
  )
}

function StatusPill({ row }: { row: BriefRow }) {
  if (row.status === "submitted") return <span className="ag-pill warn">Awaiting you</span>
  if (row.status === "accepted")
    return <span className="ag-pill">{row.roleRef ? `Accepted → ${row.roleRef}` : "Accepted"}</span>
  return <span className="ag-pill">Declined</span>
}

/** Dates are the reader's, not the server's — same rule as the HM dashboard. */
function relative(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ""
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return "yesterday"
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString()
}
