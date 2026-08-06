"use client"

/**
 * Agency home. Answers "what needs me today" before it shows anything else:
 * client signals and rights requests first, then the pipeline stalls
 * (screened but undecided, waiting on a call), then the compliance clocks
 * that run whether or not anyone is watching, then the roles themselves.
 *
 * Net new screen: the design handoff drew no dashboard. Built in the
 * approved handoff design language, and due a design review of its own.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface RoleRow { id: string; ref: string; title: string; company: string; status: string; candidate_count: number }
interface CandidateStub { id: string; ref: string; full_name: string; role_id: string; role_title: string }
interface ClientAction { id: string; candidate_ref: string; candidate_name: string; action: string; message: string; created_at: string }
interface RightsRequest { id: string; candidate_ref: string; kind: string; requested_at: string }
interface Activity { id: number; entity_type: string; entity_ref: string; action: string; created_at: string }

interface Dashboard {
  agency: { name: string; retention_days: number; notice_delay_days: number } | null
  caller_role: string
  needs_you: { client_actions: ClientAction[]; rights_requests: RightsRequest[] }
  pipeline: {
    awaiting_screening: CandidateStub[]
    awaiting_decision: CandidateStub[]
    awaiting_client: number
    parse_failures: number
  }
  compliance: { notices_due: number; retention_soon: number; rights_pending: number }
  roles: RoleRow[]
  activity: Activity[]
}

const ACTION_WORDS: Record<string, string> = {
  interview: "wants to interview",
  approve: "approved",
  decline: "passed on",
  question: "asked about",
}

export default function AgencyHomePage() {
  const router = useRouter()
  const [state, setState] = useState<"loading" | "unauthed" | "no_agency" | "ready">("loading")
  const [data, setData] = useState<Dashboard | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch("/api/agency/dashboard")
      .then(async (res) => {
        if (res.status === 401) return setState("unauthed")
        if (res.status === 403) return setState("no_agency")
        if (!res.ok) return setState("no_agency")
        setData(await res.json())
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

  const openRole = (roleId: string) => router.push(`/agencies/roles/${roleId}`)
  const ago = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 60) return `${Math.max(mins, 1)}m ago`
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`
    return `${Math.round(mins / 1440)}d ago`
  }

  const needsCount = data ? data.needs_you.client_actions.length + data.needs_you.rights_requests.length : 0

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
        {data?.agency && (
          <div className="ag-active-role">
            <div className="ag-rail-label" style={{ padding: 0 }}>Agency</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{data.agency.name}</div>
            <div className="ag-meta">
              {data.roles.filter((r) => r.status !== "closed").length} open · {data.caller_role}
            </div>
          </div>
        )}
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Decision support</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            All shortlists are subject to recruiter judgment. Nothing is rejected automatically.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen" style={{ maxWidth: 1000 }}>
          <div className="ag-screen-head">
            <div>
              <div className="ag-eyebrow">{data?.agency?.name ?? "Your agency"}</div>
              <h1 className="ag-title">{needsCount > 0 ? "A few things need you." : "Nothing is waiting on you."}</h1>
              <p className="ag-sub">
                {needsCount > 0
                  ? "Client signals and candidate requests come first. Everything else is below."
                  : "No client signals and no outstanding requests. The pipeline view is below."}
              </p>
            </div>
            {state === "ready" && (
              <button className="ag-btn ag-btn-primary" onClick={createRole} disabled={creating}>
                {creating ? <span className="ag-spin" /> : null} New role
              </button>
            )}
          </div>

          {state === "loading" && <div className="ag-card"><div className="ag-card-body"><span className="ag-spin" /></div></div>}

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

          {state === "ready" && data && (
            <div className="ag-stack" style={{ gap: 24 }}>
              {needsCount > 0 && (
                <div className="ag-attention">
                  <div className="ag-attention-head">
                    <span className="ag-eyebrow">Needs you now</span>
                    <span className="ag-meta">{needsCount} item{needsCount === 1 ? "" : "s"}</span>
                  </div>
                  {data.needs_you.rights_requests.map((r) => (
                    <div className="ag-attention-row" key={r.id}>
                      <span className="ag-pill ag-pill-coral">{r.kind}</span>
                      <span className="ag-grow" style={{ fontSize: 13 }}>
                        A candidate has asked to {r.kind === "erasure" ? "have their data deleted" : r.kind === "access" ? "see the data you hold" : r.kind === "objection" ? "stop being processed" : "correct their data"} · {r.candidate_ref}
                      </span>
                      <span className="ag-meta">{ago(r.requested_at)}</span>
                    </div>
                  ))}
                  {data.needs_you.client_actions.map((a) => (
                    <div className="ag-attention-row" key={a.id}>
                      <span className="ag-pill">{a.action}</span>
                      <span className="ag-grow" style={{ fontSize: 13 }}>
                        Your client {ACTION_WORDS[a.action] ?? a.action} <b>{a.candidate_name}</b>
                        {a.message ? <span style={{ color: "var(--ag-ink-2)" }}> · &ldquo;{a.message}&rdquo;</span> : null}
                      </span>
                      <span className="ag-meta">{ago(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="ag-rail-label" style={{ padding: 0, marginBottom: 10 }}>Pipeline</div>
                <div className="ag-tiles">
                  <button
                    className="ag-tile-stat"
                    data-quiet={data.pipeline.awaiting_screening.length === 0}
                    onClick={() => data.pipeline.awaiting_screening[0] && openRole(data.pipeline.awaiting_screening[0].role_id)}
                  >
                    <div className={`ag-stat${data.pipeline.awaiting_screening.length === 0 ? " zero" : ""}`}>{data.pipeline.awaiting_screening.length}</div>
                    <div className="ag-stat-label">Awaiting a screening call</div>
                    <div className="ag-stat-sub">
                      {data.pipeline.awaiting_screening.slice(0, 2).map((c) => c.full_name).join(", ") || "Everyone has been called"}
                    </div>
                  </button>
                  <button
                    className="ag-tile-stat"
                    data-quiet={data.pipeline.awaiting_decision.length === 0}
                    onClick={() => data.pipeline.awaiting_decision[0] && openRole(data.pipeline.awaiting_decision[0].role_id)}
                  >
                    <div className={`ag-stat${data.pipeline.awaiting_decision.length === 0 ? " zero" : ""}`}>{data.pipeline.awaiting_decision.length}</div>
                    <div className="ag-stat-label">Screened, no decision yet</div>
                    <div className="ag-stat-sub">
                      {data.pipeline.awaiting_decision.slice(0, 2).map((c) => c.full_name).join(", ") || "Every call has a decision"}
                    </div>
                  </button>
                  <div className="ag-tile-stat" data-quiet="true">
                    <div className={`ag-stat${data.pipeline.awaiting_client === 0 ? " zero" : ""}`}>{data.pipeline.awaiting_client}</div>
                    <div className="ag-stat-label">Sent, no client reply</div>
                    <div className="ag-stat-sub">Live shortlist links with no action yet</div>
                  </div>
                  <div className="ag-tile-stat" data-quiet="true">
                    <div className={`ag-stat${data.pipeline.parse_failures === 0 ? " zero" : ""}`}>{data.pipeline.parse_failures}</div>
                    <div className="ag-stat-label">CVs that would not read</div>
                    <div className="ag-stat-sub">Re upload or paste the text instead</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="ag-rail-label" style={{ padding: 0, marginBottom: 10 }}>Clocks that run on their own</div>
                <div className="ag-tiles">
                  <div className="ag-tile-stat" data-quiet="true">
                    <div className={`ag-stat${data.compliance.notices_due === 0 ? " zero" : ""}`}>{data.compliance.notices_due}</div>
                    <div className="ag-stat-label">Notices sending within {data.agency?.notice_delay_days ?? 7} days</div>
                    <div className="ag-stat-sub">Add a personal line before they go</div>
                  </div>
                  <div className="ag-tile-stat" data-quiet="true">
                    <div className={`ag-stat${data.compliance.retention_soon === 0 ? " zero" : ""}`}>{data.compliance.retention_soon}</div>
                    <div className="ag-stat-label">Candidates erased within 30 days</div>
                    <div className="ag-stat-sub">Retention is {data.agency?.retention_days ?? 180} days from role close</div>
                  </div>
                  <div className="ag-tile-stat" data-quiet="true">
                    <div className={`ag-stat${data.compliance.rights_pending === 0 ? " zero" : ""}`}>{data.compliance.rights_pending}</div>
                    <div className="ag-stat-label">Open rights requests</div>
                    <div className="ag-stat-sub">Access, correction, erasure, objection</div>
                  </div>
                </div>
              </div>

              <div className="ag-card">
                <div className="ag-card-head">
                  <span className="ag-card-title">Roles</span>
                  <span className="ag-meta">{data.roles.length} total</span>
                </div>
                {data.roles.length === 0 && (
                  <div className="ag-quiet">No roles yet. Create one and paste the client brief.</div>
                )}
                {data.roles.map((role) => (
                  <button
                    key={role.id}
                    className="ag-row"
                    style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--ag-border)", cursor: "pointer" }}
                    onClick={() => openRole(role.id)}
                  >
                    <div className="ag-grow">
                      <div style={{ fontWeight: 500 }}>{role.title}</div>
                      <div className="ag-meta">
                        {role.ref} · {role.company || "No company yet"} · {role.candidate_count} candidate{role.candidate_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <span className={`ag-pill${role.status === "open" ? " ag-pill-coral" : ""}`}>{role.status}</span>
                  </button>
                ))}
              </div>

              {data.activity.length > 0 && (
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Recent activity</span>
                    <span className="ag-meta">From the audit log</span>
                  </div>
                  <div className="ag-card-body ag-stack" style={{ gap: 6 }}>
                    {data.activity.map((entry) => (
                      <div key={entry.id} style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
                        <span className="ag-meta" style={{ width: 62, flex: "none" }}>{ago(entry.created_at)}</span>
                        <span className="ag-meta" style={{ width: 90, flex: "none" }}>{entry.entity_type}</span>
                        <span className="ag-grow">
                          {entry.entity_ref ? <b>{entry.entity_ref}</b> : null} {entry.action.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
