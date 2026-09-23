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
import { AgencyNav } from "@/components/agency/agency-nav"
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
interface Contact {
  id: string
  company: string
  email: string
  full_name: string
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
  const [contacts, setContacts] = useState<Contact[]>([])
  const [starting, setStarting] = useState(false)
  const [newContact, setNewContact] = useState("")

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([fetch("/api/agency/briefs"), fetch("/api/agency/contacts")])
      if (!b.ok) {
        setRows(null)
        return setError(b.status === 401 ? "Sign in to see your briefs." : "Could not load your briefs. Reload the page.")
      }
      const body = (await b.json()) as { briefs?: Row[] }
      setRows(Array.isArray(body.briefs) ? body.briefs : [])
      setError(null)
      if (c.ok) setContacts(((await c.json()) as { contacts?: Contact[] }).contacts ?? [])
    } catch {
      setRows(null)
      setError("Could not load your briefs. Reload the page.")
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function startBrief() {
    if (!newContact) return
    setStarting(true)
    setError(null)
    try {
      const res = await fetch("/api/agency/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: newContact, title: "" }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.briefId) return setError(typeof body?.error === "string" ? body.error : "Could not start a brief.")
      router.push(`/agencies/briefs/${body.briefId}`)
    } catch {
      setError("Could not start a brief.")
    } finally {
      setStarting(false)
    }
  }

  const sorted = (rows ?? []).slice().sort((a, b) => {
    const pri = (r: Row) => (r.waitingOn === "recruiter" ? 0 : r.state === "draft" ? 1 : r.waitingOn === "client" ? 2 : 3)
    return pri(a) - pri(b) || b.createdAt.localeCompare(a.createdAt)
  })

  return (
    <div className="ag-app ag-themed">
      <AgencyNav current="briefs" />
      <main className="ag-main">
        <div className="ag-screen-head">
          <div>
            <div className="ag-field-label">Briefs</div>
            <h1 className="ag-h1">The terms of each search</h1>
            <p className="ag-lead">
              How a search runs — rounds, decisions, what the client sees, the money — agreed by both sides before a role runs on it. A role connects to an approved brief and inherits it.
            </p>
          </div>
        </div>

        {error && (
          <p className="ag-banner" role="alert">
            {error}
          </p>
        )}

        <section className="ag-card" style={{ marginBottom: 16 }}>
          <div className="ag-card-head">
            <span className="ag-card-title">Start a brief</span>
          </div>
          <div className="ag-card-body ag-brief-start">
            <label className="ag-label" htmlFor="brief-contact">
              Send to
            </label>
            <select id="brief-contact" className="ag-input" value={newContact} onChange={(e) => setNewContact(e.target.value)}>
              <option value="">Choose the client contact…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company} · {c.full_name || c.email}
                </option>
              ))}
            </select>
            <button className="ag-btn ag-btn-primary" onClick={() => void startBrief()} disabled={!newContact || starting}>
              {starting ? "Starting…" : "Start from your defaults"}
            </button>
            <p className="ag-note">A brief is addressed to one person at the client; they sign for their side. Add people under Client access.</p>
          </div>
        </section>

        {rows === null && !error && <p className="ag-note">Loading…</p>}
        {rows !== null && rows.length === 0 && <p className="ag-note">No briefs yet. Start one above — it opens pre-filled from your defaults.</p>}
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
