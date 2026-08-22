"use client"

/**
 * The audit log — Figma "Recruiter · Audit log".
 *
 * Every AUDIT LOGGED pill in this product wrote a row that no human could read
 * until now. That was the same shape of gap as the missing revocation control:
 * an interface making a promise the product could not keep.
 *
 * Two things this screen has to get right.
 *
 * WHO. A null actor is not "unknown" — a candidate answering a consent link and
 * a referee replying have no account and never will, so the absence IS the
 * attribution. Rendering those as unknown would misattribute the most
 * consequential rows in the log. The actor's colour says which kind of person
 * acted: coral for the people outside the agency whose data this is about.
 *
 * IMMUTABILITY, SAID PLAINLY. The footer is not reassurance copy — it is the
 * one place the product explains that nothing, including this screen and
 * whoever is reading it, can edit or remove a row.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { SignOut } from "@/components/agency/sign-out"
import type { AuditEntry } from "@/lib/agency/audit-view"

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "Everything" },
  { key: "candidates", label: "Candidates" },
  { key: "decisions", label: "Decisions" },
  { key: "access", label: "Client access" },
  { key: "interviews", label: "Interviews" },
  { key: "rights", label: "Rights & notices" },
]

/** People outside the agency read coral: it is their data being acted on. */
const ACTOR_TONE: Record<string, string> = {
  you: "var(--ag-ink)",
  teammate: "var(--ag-ink)",
  client: "var(--ag-ink-2)",
  candidate: "var(--ag-coral-text)",
  referee: "var(--ag-coral-text)",
  system: "var(--ag-ink-3)",
}

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const yesterday = new Date(today.getTime() - 86_400_000).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  if (sameDay) return `Today ${time}`
  if (yesterday) return `Yesterday ${time}`
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`
}

export default function AuditPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [group, setGroup] = useState("")
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/agency/audit${group ? `?group=${group}` : ""}`)
      if (res.status === 401) return router.push("/agencies")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body?.error === "string" ? body.error : "Could not load the log.")
        setEntries([])
        return
      }
      const body = await res.json()
      setEntries(Array.isArray(body?.entries) ? body.entries : [])
    } catch {
      setError("Could not load the log.")
      setEntries([])
    }
  }, [group, router])

  useEffect(() => {
    void load()
  }, [load])

  const heading = useMemo(() => {
    if (entries === null || error) return "Audit log"
    if (entries.length === 0) return "Nothing logged yet"
    return "Everything that happened, and who did it"
  }, [entries, error])

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
        <AgencyNav current="audit" />
        <SignOut />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Append-only</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Nothing in Tailr can edit or delete a row here, including this screen.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
              {" / "}
              <b>Audit log</b>
            </span>
          </div>

          <p className="ag-step-eyebrow">Audit log</p>
          <h1 className="ag-title">{heading}</h1>
          <p className="ag-sub">
            Every <span className="ag-pill">Audit logged</span> pill in this product writes a row
            here. Append-only: nothing in the app can edit or remove one, including this screen.
          </p>

          <div className="ag-filters" role="group" aria-label="Filter the log">
            {FILTERS.map((f) => (
              <button
                key={f.key || "all"}
                className={`ag-chip${group === f.key ? " on" : ""}`}
                onClick={() => setGroup(f.key)}
                aria-pressed={group === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="ag-banner" role="alert">
              {error}
            </p>
          )}

          {entries === null ? (
            <p className="ag-quiet" aria-live="polite">
              Loading…
            </p>
          ) : entries.length === 0 && !error ? (
            <div className="ag-card" style={{ padding: "20px 24px" }}>
              <p className="ag-note">
                {group
                  ? "Nothing of that kind has happened yet."
                  : "Nothing has been logged for this agency yet. The first role, candidate or client action will appear here."}
              </p>
            </div>
          ) : (
            <div className="ag-stack" style={{ gap: 10 }}>
              {entries.map((e) => (
                <article key={e.id} className="ag-audit-row">
                  <div className="ag-audit-when">
                    <span className="ag-meta">{when(e.at)}</span>
                    <span
                      className="ag-audit-who"
                      style={{ color: ACTOR_TONE[e.actor.kind] ?? "var(--ag-ink)" }}
                    >
                      {e.actor.label}
                    </span>
                  </div>
                  <div className="ag-grow" style={{ minWidth: 0 }}>
                    <p className="ag-audit-what">{e.what}</p>
                    {e.detail && <p className="ag-note">{e.detail}</p>}
                  </div>
                  {e.entityRef && <span className="ag-meta ag-audit-ref">{e.entityRef}</span>}
                </article>
              ))}
            </div>
          )}

          <p className="ag-note-quiet" style={{ marginTop: 26, maxWidth: "72ch" }}>
            Append-only. Nothing in Tailr can edit or delete a row here — not this screen, not an
            administrator, not the code that writes them. A candidate erased under retention leaves
            exactly one row behind: their reference, their name and their score, so the record that
            they were considered survives without the data that described them.
          </p>
        </div>
      </main>
    </>
  )
}
