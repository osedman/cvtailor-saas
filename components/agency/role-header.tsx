"use client"

/**
 * The role header: one header, every role screen.
 *
 * Company · ref · title, the phase rail carrying the sub-state, and the
 * ownership strip — owner, waiting on, since — with the next action as a
 * chip. Everything but the owner is derived on the server from facts the
 * role already carries (lib/agency/next-action.ts); the owner is the one
 * stored column, and this is the one place it is set.
 *
 * Two hats, one component. The recruiter's variant reads from
 * /api/agency/roles/:id/header and can reassign the owner; the client's
 * reads from /api/hiring/roles/:id/header, which is disclosure-shaped, and
 * shows "your recruiter" where the recruiter sees an owner select.
 *
 * Refreshes itself when the tab regains focus and when a page dispatches
 * `ag:role-changed` after a consequential action, so a booking or a
 * decision moves the chip without a reload.
 *
 * Renders nothing until loaded. A header that guessed while the fetch was
 * in flight would tell a recruiter in handover that they were at the start.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { PhaseRail } from "./phase-rail"
import { HandoffReceipt } from "./handoff-receipt"
import { ageLabel, type Handoff, type NextAction } from "@/lib/agency/next-action"
import type { PhaseKey } from "@/lib/agency/phases"

export const ROLE_CHANGED = "ag:role-changed"

/** Tell every mounted header on the page that the role's facts moved. */
export function announceRoleChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ROLE_CHANGED))
}

interface HeaderPayload {
  role: { id: string; ref: string; title: string; company: string; ownerId?: string | null; ownerName?: string | null; recruiterName?: string | null; status?: string }
  client?: string | null
  phase: PhaseKey | null
  subState: { key: string; chip: string }
  next: NextAction
  handoff: Handoff | null
  callerRole?: string
  now: string
}

interface Member {
  user_id: string
  role: string
  status: string
  profile: { full_name?: string; email?: string } | null
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ""
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

export function RoleHeader({ roleId, hat }: { roleId: string; hat: "recruiter" | "client" }) {
  const [data, setData] = useState<HeaderPayload | null>(null)
  const [team, setTeam] = useState<Member[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const endpoint = hat === "recruiter" ? `/api/agency/roles/${roleId}/header` : `/api/hiring/roles/${roleId}/header`

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint)
      if (!res.ok) return
      setData((await res.json()) as HeaderPayload)
    } catch {
      /* the page's own error banner covers a dead network */
    }
  }, [endpoint])

  useEffect(() => {
    void load()
    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)
    window.addEventListener(ROLE_CHANGED, onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      window.removeEventListener(ROLE_CHANGED, onFocus)
    }
  }, [load])

  useEffect(() => {
    if (hat !== "recruiter" || !data || data.callerRole === "viewer") return
    fetch("/api/agency/team")
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => t?.members && setTeam(t.members as Member[]))
      .catch(() => {})
  }, [hat, data?.callerRole, data])

  async function reassignOwner(userId: string) {
    if (!data || userId === (data.role.ownerId ?? "")) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: userId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not change the owner.")
        return
      }
      await load()
    } catch {
      setError("Could not change the owner.")
    } finally {
      setBusy(false)
    }
  }

  // The role menu (board 34): closing and the audit trail left step 07,
  // where they sat under the send as if they were part of it. Closing is
  // still a consequential act — it starts the retention clock and tells the
  // unsuccessful candidates — so it asks first, in words, every time.
  const [menuOpen, setMenuOpen] = useState(false)
  const [closeAsk, setCloseAsk] = useState(false)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  async function setStatus(status: "open" | "closed") {
    setBusy(true)
    setError(null)
    setStatusNote(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not change the role.")
        return
      }
      setCloseAsk(false)
      if (status === "closed") {
        const c = body?.closure as { sent: number; failed: number; deferred: number } | null | undefined
        setStatusNote(
          c
            ? c.sent > 0
              ? `Closed. ${c.sent} candidate${c.sent === 1 ? " was" : "s were"} told the role has closed${c.failed ? `, ${c.failed} email${c.failed === 1 ? "" : "s"} failed` : ""}${c.deferred ? `, ${c.deferred} still to go — close again to send the rest` : ""}.`
              : "Closed. Nobody needed telling — everyone had already been told, or was never contacted about this role."
            : "Closed. The retention clock is running."
        )
      } else {
        setStatusNote("Reopened. The retention clock has stopped.")
      }
      announceRoleChanged()
      await load()
    } catch {
      setError("Could not change the role.")
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null

  const { role, next, subState, handoff } = data
  const canReassign = hat === "recruiter" && data.callerRole && data.callerRole !== "viewer" && team.length > 0
  const ownerLabel = hat === "recruiter" ? "Owner" : "Your recruiter"
  const ownerValue = hat === "recruiter" ? role.ownerName ?? "Unassigned" : role.recruiterName ?? "Your recruiter"
  const since = next.since ? `${dateLabel(next.since)} · ${ageLabel(next.since, data.now)}` : "—"
  const chipWord = next.mode === "done" ? "Done" : next.mode === "act" ? (hat === "client" ? "Needs you" : "Next") : "Waiting"
  const chipInner = (
    <>
      <span className="ag-rh-next-word">{chipWord}</span>
      <span className="ag-rh-next-sep" aria-hidden="true">
        ·
      </span>
      <span className="ag-rh-next-title">{next.title}</span>
      {next.cta && (
        <span className="ag-rh-next-arrow" aria-hidden="true">
          →
        </span>
      )}
    </>
  )

  return (
    <header className="ag-rh" aria-label="Role">
      <div className="ag-rh-top">
        <span className="ag-meta">
          {role.company ? `${role.company} · ` : ""}
          {role.ref}
        </span>
        <span className="ag-grow" />
        <PhaseRail current={data.phase} roleId={roleId} subState={subState.chip} />
        {hat === "recruiter" && (
          <div className="ag-rh-menu" ref={menuRef}>
            <button
              className="ag-rh-menu-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Role options"
              onClick={() => setMenuOpen((v) => !v)}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="ag-rh-menu-list" role="menu">
                <Link role="menuitem" className="ag-rh-menu-item" href="/agencies/audit" onClick={() => setMenuOpen(false)}>
                  Audit trail
                </Link>
                {data.callerRole !== "viewer" &&
                  (role.status === "closed" ? (
                    <button role="menuitem" className="ag-rh-menu-item" disabled={busy} onClick={() => { setMenuOpen(false); void setStatus("open") }}>
                      Reopen role
                    </button>
                  ) : (
                    <button role="menuitem" className="ag-rh-menu-item" data-tone="warn" onClick={() => { setMenuOpen(false); setCloseAsk(true) }}>
                      Close role…
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
      {closeAsk && (
        <div className="ag-rh-ask" role="alertdialog" aria-labelledby="rh-close-h">
          <p className="ag-rh-ask-title" id="rh-close-h">Close {role.ref}?</p>
          <p className="ag-rh-ask-body">
            Closing starts the retention clock on every candidate attached to it: their CV data is erased once the window
            passes. Anyone not hired is told the role has closed. It is recorded against your name, and you can reopen it.
          </p>
          <div className="ag-rh-ask-actions">
            <button className="ag-btn ag-btn-primary" disabled={busy} onClick={() => void setStatus("closed")}>
              {busy ? "Closing…" : "Close role and start retention"}
            </button>
            <button className="ag-btn ag-btn-secondary" disabled={busy} onClick={() => setCloseAsk(false)}>
              Keep it open
            </button>
          </div>
        </div>
      )}
      {statusNote && (
        <p className="ag-rh-note" role="status">
          {statusNote}
        </p>
      )}
      <h1 className="ag-rh-title">{role.title}</h1>
      <div className="ag-rh-strip">
        <div className="ag-rh-cell">
          <span className="ag-rh-label">{ownerLabel}</span>
          {canReassign ? (
            <select
              className="ag-owner-select ag-rh-owner"
              aria-label="Role owner"
              value={role.ownerId ?? ""}
              disabled={busy}
              onChange={(e) => void reassignOwner(e.target.value)}
            >
              {!role.ownerId && <option value="">Unassigned</option>}
              {team
                .filter((m) => m.status === "active" && m.role !== "viewer")
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profile?.full_name || m.profile?.email || "Unnamed"}
                  </option>
                ))}
            </select>
          ) : (
            <span className="ag-rh-value">{ownerValue}</span>
          )}
        </div>
        <div className="ag-rh-cell">
          <span className="ag-rh-label">Waiting on</span>
          <span className="ag-rh-value">
            {next.waitingOn.label}
            {next.mode !== "done" && next.detail ? <span className="ag-rh-detail"> · {next.detail}</span> : null}
          </span>
        </div>
        <div className="ag-rh-cell">
          <span className="ag-rh-label">Since</span>
          <span className="ag-rh-value">{since}</span>
        </div>
        <span className="ag-grow" />
        {next.cta ? (
          <Link className={`ag-rh-next ${next.mode}`} href={next.cta.href}>
            {chipInner}
          </Link>
        ) : (
          <span className={`ag-rh-next ${next.mode}`}>{chipInner}</span>
        )}
      </div>
      {error && (
        <p className="ag-rh-error" role="alert">
          {error}
        </p>
      )}
      <HandoffReceipt handoff={handoff} eventKey={`${roleId}:${subState.key}:${next.since ?? ""}`} />
    </header>
  )
}
