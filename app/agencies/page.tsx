"use client"

/**
 * Agency home, rebuilt to the approved dashboard design
 * (mockups/agency-dashboard-v2.html). Three bands in falling urgency:
 *
 *   Needs you now   at most three cards, each one thing with a severity rail
 *   Queue           one panel, two tenses: Still to do / Just happened
 *   Live roles      every role with its six step rail, top score and delta
 *
 * then Clients (portal heat) and Desk health (three numbers that each name
 * the row breaching them). Every card and row links into the step of the
 * workflow it talks about. The judgment features (best next calls, client
 * heat, worth a look) are folded into the cards and queue, not dropped.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { PHASES, workflowHref, type PhaseKey } from "@/lib/agency/phases"
import { ageLabel, type NextAction } from "@/lib/agency/next-action"
import { SignOut } from "@/components/agency/sign-out"

type StageState = "here" | "blocked" | "waiting" | "done"

/** One row of Today: a role and its next action, from /api/agency/today. */
interface TodayRow {
  role: { id: string; ref: string; title: string; company: string; ownerId: string | null; ownerName: string | null }
  phase: PhaseKey
  subState: { key: string; chip: string }
  next: NextAction
}

const phaseLabel = (p: PhaseKey) => PHASES.find((x) => x.key === p)?.label ?? p
interface RoleRow {
  id: string; ref: string; title: string; company: string; salary_band: string; status: string
  mine: boolean; days_open: number; candidate_count: number
  stage: number; stage_state: StageState; needs: string; needs_action: boolean
  phase?: "shortlist" | "interviews" | "handover"
  top_score: number | null; top_delta: number | null; top_original: number | null; top_name: string
  last_activity: { entity_ref: string; entity_type: string; action: string; created_at: string } | null
}
interface CandidateStub { id: string; ref: string; full_name: string; role_id: string; role_title: string }
interface ClientAction { id: string; candidate_ref: string; candidate_name: string; action: string; message: string; created_at: string; role_id: string | null; role_title: string }
interface RightsRequest { id: string; candidate_ref: string; kind: string; requested_at: string }
interface Activity { id: number; role_id: string | null; entity_type: string; entity_ref: string; action: string; created_at: string }
interface NextCall { id: string; ref: string; full_name: string; role_id: string; role_title: string; current: number; potential: number; uplift: number; gaps: string[] }
interface HeatRow { recipient_id: string; contact_name: string; company: string; role_title: string; sent_at: string; last_opened_at: string | null }
interface Suggestion { candidate_id: string; candidate_ref: string; full_name: string; from_role_id: string; from_role_title: string; to_role_id: string; to_role_title: string; covered: number; total: number }
interface NoticeDetail { candidate_id: string; ref: string; full_name: string; role_id: string; role_title: string; scheduled_for: string }
interface PaperworkItem { candidate_id: string; ref: string; full_name: string; role_title: string; start_date: string | null }

interface Dashboard {
  agency: { name: string; retention_days: number; notice_delay_days: number } | null
  caller_role: string
  caller_email: string
  also_hiring_manager?: boolean
  briefs?: {
    waiting: Array<{ id: string; role_title: string; company: string; created_at: string; has_jd: boolean }>
    elsewhere: Array<{ agency_id: string; agency_name: string; count: number }>
  }
  needs_you: { client_actions: ClientAction[]; rights_requests: RightsRequest[] }
  health: {
    brief_to_shortlist: { days: number | null; breach: string }
    shortlist_to_reply: { days: number | null; breach: string }
    positive_response: { pct: number | null; n: number }
  }
  notices_detail: NoticeDetail[]
  paperwork?: PaperworkItem[]
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

const STAGES = ["Intake", "Parse", "Add", "Calls", "Compare", "Send"]

const RIGHTS_WORDS: Record<string, string> = {
  erasure: "have their data deleted",
  access: "see the data you hold",
  objection: "stop being processed",
  rectification: "correct their data",
}

type Sev = "now" | "soon" | "calm"
interface AttnCard {
  key: string
  sev: Sev
  when: string
  title: string
  body: string
  metaLeft: string
  cta: string
  onClick: () => void
}

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

/** Two point sparkline: score at parse -> score now. Honest — that is the
 *  entire history the product stores. */
function Spark({ from, to }: { from: number; to: number }) {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const span = Math.max(hi - lo, 1)
  const y = (v: number) => 13 - ((v - lo) / span) * 10
  const up = to >= from
  const color = up ? "var(--ag-coral)" : "var(--ag-ink-4)"
  return (
    <svg width="44" height="16" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <path d={`M2 ${y(from)} L42 ${y(to)}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="42" cy={y(to)} r="2.4" fill={color} />
    </svg>
  )
}

export default function AgencyHomePage() {
  const router = useRouter()
  const [state, setState] = useState<"loading" | "unauthed" | "no_agency" | "ready">("loading")
  const [data, setData] = useState<Dashboard | null>(null)
  const [creating, setCreating] = useState(false)
  const [today, setToday] = useState<TodayRow[] | null>(null)
  const [todayNow, setTodayNow] = useState<string>(() => new Date().toISOString())
  useEffect(() => {
    if (state !== "ready") return
    let live = true
    fetch("/api/agency/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !Array.isArray(d?.roles)) return
        setToday(d.roles as TodayRow[])
        if (typeof d.now === "string") setTodayNow(d.now)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [state, data])
  const [q, setQ] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
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
  useEffect(load, [load])

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

  // With a step the intent is the workflow at that step, so the link says so
  // (workflowHref); without one it is the role's front door, which lands
  // wherever the work now lives.
  const openRole = useCallback(
    (roleId: string, step?: string) =>
      router.push(step ? workflowHref(roleId, step) : `/agencies/roles/${roleId}`),
    [router]
  )


  // Keyboard: "/" focuses search, "n" starts a role. Never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && state === "ready") {
        e.preventDefault()
        createRole()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])


  const roleById = useMemo(() => new Map((data?.roles ?? []).map((r) => [r.id, r])), [data])

  // ---- Needs you now: at most three cards, worst first -------------------




  // The dashboard is live roles now, so the search narrows those and the
  // headline counts what actually needs the recruiter — no second source.
  const shownRoles = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return today ?? []
    return (today ?? []).filter((r) =>
      `${r.role.title} ${r.role.company} ${r.role.ref} ${r.role.ownerName ?? ""}`.toLowerCase().includes(needle)
    )
  }, [today, q])
  const acts = (today ?? []).filter((r) => r.next.mode === "act").length
  const hour = new Date().getHours()
  const tail = hour >= 17 ? "before you log off" : hour >= 12 ? "this afternoon" : "this morning"
  const headline =
    today === null
      ? "Working out where your roles stand…"
      : acts === 0
        ? "Nothing is waiting on you."
        : acts === 1
          ? `One role needs you ${tail}.`
          : `${acts} roles need you ${tail}.`
  const subline =
    today === null
      ? "One line per role, and what it needs next."
      : acts > 0
        ? "Worst first. Everything else is running."
        : "No decisions outstanding, nothing blocked. A rare sight."
  const dateLine = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
  const initials = (data?.caller_email || "?").slice(0, 2).toUpperCase()

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

        <AgencySwitcher />
        {/*
          One nav. The dashboard's own sections nest under Roles rather than
          forming a second list beside it — the first pass had both, with
          "Roles" and "Clients" appearing in each and meaning different things.
        */}
        <AgencyNav current="roles" />

        {data && (
          <div className="ag-active-role">
            <div className="ag-rail-label" style={{ padding: 0 }}>Signed in</div>
            <div style={{ fontWeight: 600, fontSize: 13, overflowWrap: "anywhere" }}>{data.caller_email}</div>
            <div className="ag-meta">{data.agency?.name ?? "Your agency"} · {data.caller_role}</div>
          </div>
        )}

        <SignOut email={data?.caller_email} />
        <div className="ag-sidebar-foot">
          <div className="ag-meta" style={{ marginBottom: 6 }}>Decision support</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            All shortlists are subject to recruiter judgment. Nothing is rejected automatically.
          </div>
        </div>
      </aside>

      <main className="ag-main agd-main">
        <div className="agd-topbar">
          <span className="agd-crumb">Today</span>
          <span className="agd-spacer" />
          <div className="agd-search">
            <input
              ref={searchRef}
              className="agd-search-input"
              placeholder="Search roles"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search roles"
            />
            <span className="agd-kbd">/</span>
          </div>
          <button className="agd-tbtn primary" onClick={createRole} disabled={creating || state !== "ready"}>
            {creating ? <span className="ag-spin" /> : "+ New role"} <span className="agd-kbd inverse">N</span>
          </button>
          {/* Only for someone who genuinely holds both hats. A recruiter who
              is not a client contact anywhere must not be offered a client
              view they have no business in. See getHatsHeld. */}
          {data?.also_hiring_manager && (
            <Link className="agd-tbtn" href="/hiring" title="You are also a hiring manager on an agency's client side">
              Client view →
            </Link>
          )}
          <div className="agd-avatar" title={data?.caller_email ?? ""}>{initials}</div>
        </div>

        <div className="agd-page">
          {state === "loading" && (
            <div className="ag-card"><div className="ag-card-body" style={{ textAlign: "center", padding: 48 }}><span className="ag-spin" /></div></div>
          )}

          {state === "unauthed" && (
            <div className="ag-card">
              <div className="ag-card-body" style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Sign in to see your agency.</div>
                <p style={{ fontSize: 12.5, color: "var(--ag-ink-3)", margin: "6px 0 16px" }}>
                  Your email address and a magic link — no password.
                </p>
                <a className="ag-btn ag-btn-primary" href="/agencies/sign-in" style={{ textDecoration: "none" }}>Sign in</a>
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
            <>
              <section className="agd-hero">
                <p className="agd-date">{dateLine}</p>
                <h1 className="agd-h1">{headline}</h1>
                <p className="agd-sub">{subline}</p>
              </section>

              {/*
                LIVE ROLES, AND NOTHING ELSE (10 Sep 2026, Ose).
                The dashboard carried seven bands — Today, Also needs you,
                briefs, the queue, live roles, clients, desk health — plus a
                nav whose sections expanded into all of them. For MVP it is
                one thing: the roles that are live, each saying what it needs
                next. The ladder's value survives in the row; the bands do
                not. Briefs still surface through the nav's own count, and
                the reports lived on numbers nobody had asked for yet.
              */}
              <section className="agd-band" aria-labelledby="agd-roles-h" id="agd-roles">
                <div className="agd-eyebrow-row">
                  <h2 className="agd-eyebrow" id="agd-roles-h">Live roles</h2>
                  <span className="agd-rule" />
                  <span className="agd-aside">what each one needs next</span>
                </div>
                {today === null ? (
                  <div className="ag-quiet" aria-live="polite">Working out where each role stands…</div>
                ) : shownRoles.length === 0 ? (
                  <div className="ag-quiet">
                    {q.trim() ? "No live role matches that." : "No live roles yet. Start one with + New role."}
                  </div>
                ) : (
                  <div className="agd-today">
                    <div className="agd-today-group">
                      {shownRoles.map((r) => (
                        <Link
                          key={r.role.id}
                          className={`agd-today-row ${r.next.mode}`}
                          href={r.next.cta?.href ?? `/agencies/roles/${r.role.id}`}
                        >
                          <span className="agd-today-role">
                            <span className="agd-today-role-title">{r.role.title}</span>
                            <span className="agd-today-role-meta">
                              {r.role.company ? `${r.role.company} · ` : ""}
                              {r.role.ref}
                              {r.role.ownerName ? ` · ${r.role.ownerName}` : ""}
                            </span>
                          </span>
                          <span className="agd-today-state">
                            <span className="agd-today-chip">
                              {phaseLabel(r.phase)} · {r.subState.chip}
                            </span>
                            <span className="agd-today-next">{r.next.title}</span>
                          </span>
                          <span className="agd-today-since">
                            {r.next.waitingOn.label}
                            {r.next.since ? ` · ${ageLabel(r.next.since, todayNow)}` : ""}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </section>


              <p className="agd-foot">
                <b>NOTE</b> Tailr never rejects anyone automatically. Client declines are signals, not state changes, and every override is audited.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  )
}
