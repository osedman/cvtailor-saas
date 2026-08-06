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

type StageState = "here" | "blocked" | "waiting" | "done"
interface RoleRow {
  id: string; ref: string; title: string; company: string; status: string; candidate_count: number
  stage: number; stage_state: StageState; needs: string; needs_action: boolean
  top_score: number | null; top_delta: number | null; top_name: string
}
interface CandidateStub { id: string; ref: string; full_name: string; role_id: string; role_title: string }
interface ClientAction { id: string; candidate_ref: string; candidate_name: string; action: string; message: string; created_at: string }
interface RightsRequest { id: string; candidate_ref: string; kind: string; requested_at: string }
interface Activity { id: number; entity_type: string; entity_ref: string; action: string; created_at: string }
interface NextCall { id: string; ref: string; full_name: string; role_id: string; role_title: string; current: number; potential: number; uplift: number; gaps: string[] }
interface HeatRow { recipient_id: string; contact_name: string; company: string; role_title: string; sent_at: string; last_opened_at: string | null }
interface Suggestion { candidate_id: string; candidate_ref: string; full_name: string; from_role_id: string; from_role_title: string; to_role_id: string; to_role_title: string; covered: number; total: number }

interface Dashboard {
  agency: { name: string; retention_days: number; notice_delay_days: number } | null
  caller_role: string
  needs_you: { client_actions: ClientAction[]; rights_requests: RightsRequest[] }
  next_calls: NextCall[]
  client_heat: { opened_silent: HeatRow[]; never_opened: HeatRow[] }
  worth_a_look: Suggestion[]
  pipeline: {
    awaiting_screening: CandidateStub[]
    awaiting_decision: CandidateStub[]
    awaiting_client: number
    parse_failures: number
  }
  compliance: { notices_due: number; retention_soon: number; rights_pending: number }
  focus: { role_id: string; title: string; company: string; reason: string } | null
  roles: RoleRow[]
  activity: Activity[]
}

const ACTION_WORDS: Record<string, string> = {
  interview: "wants to interview",
  approve: "approved",
  decline: "passed on",
  question: "asked about",
}

// The six step rail, in the order the role page runs them.
const STAGES = ["Intake", "Parse", "Add", "Calls", "Compare", "Send"]

// Urgency ladder. Coral is already "strong evidence" in this product, so it
// is spent only on things that are actually breaking.
const ACTION_SEVERITY: Record<string, "now" | "soon" | "calm"> = {
  decline: "now",
  question: "soon",
  interview: "calm",
  approve: "calm",
}

export default function AgencyHomePage() {
  const router = useRouter()
  const [state, setState] = useState<"loading" | "unauthed" | "no_agency" | "ready">("loading")
  const [data, setData] = useState<Dashboard | null>(null)
  const [creating, setCreating] = useState(false)
  const [actioning, setActioning] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<"live" | "attention" | "closed">("live")

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

  const openRole = (roleId: string, step?: string) =>
    router.push(step ? `/agencies/roles/${roleId}?step=${step}` : `/agencies/roles/${roleId}`)
  const ago = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 60) return `${Math.max(mins, 1)}m ago`
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`
    return `${Math.round(mins / 1440)}d ago`
  }

  const needsCount = data ? data.needs_you.client_actions.length + data.needs_you.rights_requests.length : 0

  /**
   * Pipeline counts and compliance clocks were two banks of tiles, seven
   * boxes competing at equal weight, most of them reading zero most days.
   * One strip: anything with a number gets a tile, everything at zero
   * collapses into a single line that names what is clear.
   */
  const clocks = data
    ? [
        {
          key: "screening",
          n: data.pipeline.awaiting_screening.length,
          label: "Awaiting a screening call",
          sub: data.pipeline.awaiting_screening.slice(0, 2).map((c) => c.full_name).join(", "),
          clear: "screening calls",
          go: () => data.pipeline.awaiting_screening[0] && openRole(data.pipeline.awaiting_screening[0].role_id, "screening"),
        },
        {
          key: "decision",
          n: data.pipeline.awaiting_decision.length,
          label: "Screened, no decision yet",
          sub: data.pipeline.awaiting_decision.slice(0, 2).map((c) => c.full_name).join(", "),
          clear: "decisions",
          go: () => data.pipeline.awaiting_decision[0] && openRole(data.pipeline.awaiting_decision[0].role_id, "compare"),
        },
        {
          key: "client",
          n: data.pipeline.awaiting_client,
          label: "Sent, no client reply",
          sub: "Live shortlist links with no action yet",
          clear: "client replies",
          go: null,
        },
        {
          key: "parse",
          n: data.pipeline.parse_failures,
          label: "CVs that would not read",
          sub: "Re upload or paste the text instead",
          clear: "CV parsing",
          go: null,
        },
        {
          key: "notices",
          n: data.compliance.notices_due,
          label: `Notices sending within ${data.agency?.notice_delay_days ?? 7} days`,
          sub: "Add a personal line before they go",
          clear: "candidate notices",
          go: null,
        },
        {
          key: "retention",
          n: data.compliance.retention_soon,
          label: "Candidates erased within 30 days",
          sub: `Retention is ${data.agency?.retention_days ?? 180} days from role close`,
          clear: "retention",
          go: null,
        },
        {
          key: "rights",
          n: data.compliance.rights_pending,
          label: "Open rights requests",
          sub: "Access, correction, erasure, objection",
          clear: "rights requests",
          go: null,
        },
      ]
    : []
  const liveClocks = clocks.filter((c) => c.n > 0)
  const clearClocks = clocks.filter((c) => c.n === 0)

  const visibleRoles = (data?.roles ?? []).filter((r) =>
    roleFilter === "closed" ? r.status === "closed"
      : roleFilter === "attention" ? r.status !== "closed" && r.needs_action
      : r.status !== "closed"
  )

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
              <h1 className="ag-title">
                {needsCount > 0
                  ? "A few things need you."
                  : data?.focus
                    ? "One thing worth doing first."
                    : "Nothing is waiting on you."}
              </h1>
              <p className="ag-sub">
                {needsCount > 0
                  ? "Client signals and candidate requests come first. Everything else is below."
                  : data?.focus
                    ? `${data.focus.title}${data.focus.company ? ` at ${data.focus.company}` : ""}: ${data.focus.reason.toLowerCase()}.`
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
                    <div
                      className="ag-attention-row"
                      data-sev={r.kind === "erasure" || r.kind === "objection" ? "now" : "soon"}
                      key={r.id}
                    >
                      <span className="ag-pill ag-pill-coral">{r.kind}</span>
                      <span className="ag-grow" style={{ fontSize: 13 }}>
                        A candidate has asked to {r.kind === "erasure" ? "have their data deleted" : r.kind === "access" ? "see the data you hold" : r.kind === "objection" ? "stop being processed" : "correct their data"} · {r.candidate_ref}
                      </span>
                      <span className="ag-meta">{ago(r.requested_at)}</span>
                      <button
                        className="ag-btn ag-btn-secondary"
                        disabled={actioning === r.id}
                        onClick={async () => {
                          const strong = r.kind === "erasure" || r.kind === "objection"
                          if (strong && !window.confirm(`Completing this ${r.kind} request erases ${r.candidate_ref}'s CV and their assessment. The audit record of the decision survives. This cannot be undone.`)) return
                          setActioning(r.id)
                          await fetch("/api/agency/rights", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ request_id: r.id, outcome: "completed" }),
                          })
                          setActioning(null)
                          const res = await fetch("/api/agency/dashboard")
                          if (res.ok) setData(await res.json())
                        }}
                      >
                        {actioning === r.id ? <span className="ag-spin" /> : "Action it"}
                      </button>
                    </div>
                  ))}
                  {data.needs_you.client_actions.map((a) => (
                    <div className="ag-attention-row" data-sev={ACTION_SEVERITY[a.action] ?? "soon"} key={a.id}>
                      <span className={`ag-pill${ACTION_SEVERITY[a.action] === "now" ? " ag-pill-coral" : ""}`}>{a.action}</span>
                      <span className="ag-grow" style={{ fontSize: 13 }}>
                        Your client {ACTION_WORDS[a.action] ?? a.action} <b>{a.candidate_name}</b>
                        {a.message ? <span style={{ color: "var(--ag-ink-2)" }}> · &ldquo;{a.message}&rdquo;</span> : null}
                      </span>
                      <span className="ag-meta">{ago(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}

              {data.next_calls.length > 0 && (
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Best next calls</span>
                    <span className="ag-meta">Where a confirming call moves the score most</span>
                  </div>
                  {data.next_calls.map((call) => (
                    <button
                      key={call.id}
                      className="ag-row"
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--ag-border)", cursor: "pointer" }}
                      onClick={() => openRole(call.role_id)}
                    >
                      <div className="ag-grow">
                        <div style={{ fontWeight: 500 }}>{call.full_name}</div>
                        <div className="ag-meta">{call.role_title} · ask about {call.gaps.join(", ") || "the gaps"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span className="ag-delta" style={{ fontSize: 14 }}>{call.current} → {call.potential}</span>
                        <div className="ag-meta" style={{ marginTop: 2 }}>if the call confirms</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {(data.client_heat.opened_silent.length > 0 || data.client_heat.never_opened.length > 0) && (
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Client heat</span>
                    <span className="ag-meta">From your shortlist links</span>
                  </div>
                  {data.client_heat.opened_silent.map((row) => (
                    <div className="ag-row" key={row.recipient_id}>
                      <span className="ag-pill ag-pill-coral">Opened</span>
                      <span className="ag-grow" style={{ fontSize: 13 }}>
                        <b>{row.contact_name}</b>{row.company ? ` at ${row.company}` : ""} opened {row.role_title || "your shortlist"} {row.last_opened_at ? ago(row.last_opened_at) : ""} and has not acted. Worth a call.
                      </span>
                    </div>
                  ))}
                  {data.client_heat.never_opened.map((row) => (
                    <div className="ag-row" key={row.recipient_id}>
                      <span className="ag-pill">Unopened</span>
                      <span className="ag-grow" style={{ fontSize: 13 }}>
                        <b>{row.contact_name}</b>{row.company ? ` at ${row.company}` : ""} has not opened {row.role_title || "the shortlist"} yet · sent {ago(row.sent_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {data.worth_a_look.length > 0 && (
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Worth a look</span>
                    <span className="ag-meta">Open roles only · nothing happens without you</span>
                  </div>
                  {data.worth_a_look.map((s) => (
                    <button
                      key={`${s.candidate_id}:${s.to_role_id}`}
                      className="ag-row"
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--ag-border)", cursor: "pointer" }}
                      onClick={() => router.push(`/agencies/roles/${s.from_role_id}/candidates/${s.candidate_id}`)}
                    >
                      <div className="ag-grow">
                        <div style={{ fontWeight: 500 }}>{s.full_name} <span className="ag-meta">{s.candidate_ref}</span></div>
                        <div className="ag-meta">On {s.from_role_title} · already evidences {s.covered} of {s.total} core requirements for {s.to_role_title}</div>
                      </div>
                      <span className="ag-btn">See their evidence →</span>
                    </button>
                  ))}
                  <div style={{ padding: "10px 18px" }}>
                    <span className="ag-meta">Uses assessments you already made. Suggestions never add or screen anyone automatically.</span>
                  </div>
                </div>
              )}

              <div>
                <div className="ag-rail-label" style={{ padding: 0, marginBottom: 10 }}>Counts and clocks</div>
                {liveClocks.length > 0 && (
                  <div className="ag-tiles" style={{ marginBottom: clearClocks.length > 0 ? 12 : 0 }}>
                    {liveClocks.map((c) => (
                      <button
                        key={c.key}
                        className="ag-tile-stat"
                        data-quiet={c.go === null}
                        onClick={() => c.go?.()}
                      >
                        <div className="ag-stat">{c.n}</div>
                        <div className="ag-stat-label">{c.label}</div>
                        <div className="ag-stat-sub">{c.sub}</div>
                      </button>
                    ))}
                  </div>
                )}
                {clearClocks.length > 0 && (
                  <div className="ag-clear">
                    <span className="tick" aria-hidden="true">&#10003;</span>
                    <span>
                      {clearClocks.length === clocks.length ? "Everything is clear: " : "Also clear: "}
                      {clearClocks.map((c) => c.clear).join(", ")}.
                    </span>
                  </div>
                )}
              </div>

              <div className="ag-card">
                <div className="ag-card-head">
                  <span className="ag-card-title">Roles</span>
                  <div className="ag-filters">
                    {([
                      ["live", "Live"],
                      ["attention", "Needs action"],
                      ["closed", "Closed"],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        className="ag-filter"
                        aria-pressed={roleFilter === key}
                        onClick={() => setRoleFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {visibleRoles.length === 0 && (
                  <div className="ag-quiet">
                    {data.roles.length === 0
                      ? "No roles yet. Create one and paste the client brief."
                      : roleFilter === "attention"
                        ? "No role is blocked. Nothing here needs you right now."
                        : roleFilter === "closed"
                          ? "No closed roles yet."
                          : "No live roles. Every role you have is closed."}
                  </div>
                )}
                {visibleRoles.map((role) => (
                  <button
                    key={role.id}
                    className="ag-role-row"
                    data-flag={role.stage_state === "blocked" ? "blocked" : undefined}
                    onClick={() => openRole(role.id)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="ag-role-title">{role.title}</div>
                      <div className="ag-meta">
                        {role.ref} · {role.company || "No company yet"} · {role.candidate_count} candidate{role.candidate_count === 1 ? "" : "s"}
                      </div>
                      {role.needs && (
                        <div
                          className="ag-role-needs"
                          data-tone={role.stage_state === "blocked" ? "blocked" : role.stage_state === "waiting" ? "waiting" : undefined}
                        >
                          {role.needs}
                        </div>
                      )}
                    </div>
                    <div className="ag-stage" aria-label={`Step ${role.stage} of 6: ${STAGES[role.stage - 1]}`}>
                      {STAGES.map((name, i) => {
                        const n = i + 1
                        const s =
                          role.stage_state === "done" ? "done"
                            : n < role.stage ? "done"
                              : n === role.stage ? role.stage_state
                                : "todo"
                        return (
                          <span className="ag-stage-seg" key={name} data-s={s} title={`${n}. ${name}`}>
                            <span className="ag-stage-bar" />
                            <span className="ag-stage-label">{name}</span>
                          </span>
                        )
                      })}
                    </div>
                    <div className="ag-role-score">
                      {role.top_score === null ? (
                        <span className="none">no score yet</span>
                      ) : (
                        <>
                          <span className="num">{role.top_score}</span>
                          {role.top_delta !== null && role.top_delta !== 0 && (
                            <span className={`ag-delta${role.top_delta < 0 ? " down" : ""}`}>
                              {role.top_delta > 0 ? "+" : ""}{role.top_delta} since parse
                            </span>
                          )}
                        </>
                      )}
                    </div>
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
