"use client"

/** Roles list — the front door. Wired to /api/agency/roles. */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface RoleRow {
  id: string
  ref: string
  title: string
  company: string
  status: string
  created_at: string
}

export default function AgencyRolesPage() {
  const router = useRouter()
  const [state, setState] = useState<"loading" | "unauthed" | "no_agency" | "ready">("loading")
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch("/api/agency/roles")
      .then(async (res) => {
        if (res.status === 401) return setState("unauthed")
        if (res.status === 403) return setState("no_agency")
        const body = await res.json()
        setRoles(body.roles ?? [])
        setState("ready")
      })
      .catch(() => setState("no_agency"))
  }, [])

  async function createRole() {
    setCreating(true)
    try {
      const res = await fetch("/api/agency/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled role" }),
      })
      const body = await res.json()
      if (res.ok && body.role?.id) router.push(`/agencies/roles/${body.role.id}`)
      else setCreating(false)
    } catch {
      setCreating(false)
    }
  }

  return (
    <>
      <aside className="ag-sidebar">
        <div className="ag-brand">
          <div className="ag-brand-mark">T</div>
          <div>
            <div className="ag-brand-name">Tailr</div>
            <div className="ag-brand-sub">For agencies</div>
          </div>
        </div>
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Decision support</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            All shortlists are subject to recruiter judgment. Nothing is rejected automatically.
          </div>
        </div>
      </aside>
      <main className="ag-main">
        <div className="ag-screen" style={{ maxWidth: 860 }}>
          <div className="ag-screen-head">
            <div>
              <div className="ag-eyebrow">Roles</div>
              <h1 className="ag-title">Your client roles.</h1>
              <p className="ag-sub">One role, a handful of candidates, an explainable shortlist.</p>
            </div>
            {state === "ready" && (
              <button className="ag-btn ag-btn-primary" onClick={createRole} disabled={creating}>
                {creating ? <span className="ag-spin" /> : null} New role
              </button>
            )}
          </div>

          {state === "loading" && (
            <div className="ag-card"><div className="ag-card-body"><span className="ag-spin" /> </div></div>
          )}

          {state === "unauthed" && (
            <div className="ag-card">
              <div className="ag-card-body" style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Sign in to see your agency.</div>
                <p style={{ fontSize: 12.5, color: "var(--ag-ink-3)", margin: "6px 0 16px" }}>
                  Same login as Tailr: your email address and a magic link.
                </p>
                <a className="ag-btn ag-btn-primary" href="/login" style={{ textDecoration: "none" }}>Sign in</a>
              </div>
            </div>
          )}

          {state === "no_agency" && (
            <div className="ag-card">
              <div className="ag-card-body" style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Your account is not part of an agency yet.</div>
                <p style={{ fontSize: 12.5, color: "var(--ag-ink-3)", marginTop: 6 }}>
                  Ask your agency owner to invite you, and this page fills in by itself.
                </p>
              </div>
            </div>
          )}

          {state === "ready" && roles.length === 0 && (
            <div className="ag-drop">
              <div style={{ fontWeight: 600, fontSize: 15 }}>No roles yet.</div>
              <p style={{ fontSize: 12.5, color: "var(--ag-ink-3)", margin: "6px 0 0" }}>
                Create your first role and paste the client brief.
              </p>
            </div>
          )}

          {state === "ready" && roles.length > 0 && (
            <div className="ag-card">
              {roles.map((role) => (
                <button
                  key={role.id}
                  className="ag-row"
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--ag-border)", cursor: "pointer" }}
                  onClick={() => router.push(`/agencies/roles/${role.id}`)}
                >
                  <div className="ag-grow">
                    <div style={{ fontWeight: 500 }}>{role.title}</div>
                    <div className="ag-meta">
                      {role.ref} · {role.company || "No company yet"}
                    </div>
                  </div>
                  <span className={`ag-pill${role.status === "open" ? " ag-pill-coral" : ""}`}>{role.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
