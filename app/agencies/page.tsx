"use client"

/**
 * Agency home, rebuilt to the approved dashboard design
 * (mockups/agency-dashboard-v2.html). Three bands in falling urgency:
 *
 *   Needs you now   at most three cards, each one thing with a severity rail
 *   Queue           one panel, two tenses: Still to do / Just happened
 *   Live roles      every role with its six step rail, top score and delta
 *
 * then Clients (portal heat). Every card and row links into the step of the
 * workflow it talks about.
 *
 * Desk health — three timing numbers — was deleted on 10 Sep (e007e61, from
 * Ose's walk of staging) along with the Reports nav item. The route went on
 * computing it for five days and shipping it to a client that had stopped
 * reading it; both halves were struck on 15 Sep. The judgment features (best next calls, client
 * heat, worth a look) are folded into the cards and queue, not dropped.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { PHASES, workflowHref, type PhaseKey } from "@/lib/agency/phases"
import { ageLabel, type NextAction } from "@/lib/agency/next-action"
import { WORKFLOW_STEPS } from "@/lib/agency/steps"
import { SignOut } from "@/components/agency/sign-out"

type StageState = "here" | "blocked" | "waiting" | "done"

/** One row of Today: a role and its next action, from /api/agency/today. */
interface TodayRow {
  role: { id: string; ref: string; title: string; company: string; ownerId: string | null; ownerName: string | null }
  phase: PhaseKey
  subState: { key: string; chip: string }
  next: NextAction
}

const PHASE_ORDER = ["shortlist", "interviews", "handover"] as const

/**
 * The step bar on a role row. Frame 38 (approved 5 Oct 2026, Ose): thin
 * segments and ONE caption in the workflow's own words ("Step 4 of 6 ·
 * Screening calls"), replacing six capitalised labels that outweighed the
 * role title and still carried the retired step names.
 *
 * Two modes, as before: inside the shortlist flow it is the six steps; past
 * it, the three phases, so a role in interviews never points backwards at
 * work that is finished.
 */
function StatusRail({ row }: { row: RoleRow }) {
  if (row.phase && row.phase !== "shortlist") {
    const at = PHASE_ORDER.indexOf(row.phase)
    return (
      <span className="agt-rail">
        <span className="agt-rail-bars" aria-hidden="true">
          {PHASE_ORDER.map((key, i) => (
            <span key={key} className="agt-rail-seg" data-s={i < at ? "done" : i === at ? "here" : undefined} />
          ))}
        </span>
        <span className="agt-rail-caption">{phaseLabel(row.phase)}</span>
      </span>
    )
  }
  const n = Math.min(Math.max(row.stage, 1), WORKFLOW_STEPS.length)
  return (
    <span className="agt-rail">
      <span className="agt-rail-bars" aria-hidden="true">
        {WORKFLOW_STEPS.map((step, i) => {
          const st = row.stage_state === "done" || i + 1 < n ? "done" : i + 1 === n ? row.stage_state : undefined
          return <span key={step.key} className="agt-rail-seg" data-s={st} />
        })}
      </span>
      <span className="agt-rail-caption">
        Step {n} of {WORKFLOW_STEPS.length} · {WORKFLOW_STEPS[n - 1].label}
      </span>
    </span>
  )
}

/** "BRIEF V2 TO SIGN" → "Brief v2 to sign". The ladder's chips are written
 *  in capitals for the role header; on Today they read as a status pill. */
function sentenceCase(chip: string) {
  const lower = chip.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** How long a row has been in its state: hours inside the first day, where
 *  ageLabel would say "today" for both five minutes and twenty hours. */
function sinceLabel(since: string, now: string) {
  const hours = Math.floor((Date.parse(now) - Date.parse(since)) / 3_600_000)
  if (!Number.isFinite(hours) || hours < 0) return ""
  if (hours < 1) return "Just now"
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`
  return ageLabel(since, now)
}

const phaseLabel = (p: PhaseKey) => PHASES.find((x) => x.key === p)?.label ?? p
interface RoleRow {
  id: string; ref: string; title: string; company: string; salary_band: string; status: string
  mine: boolean; days_open: number; candidate_count: number
  /** When the pack actually reached the employer. Null until it does. */
  closed_at?: string | null
  handed_over_at?: string | null
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
  // One list (frame 38): roles that need the recruiter first, then the
  // longest-standing first. A row with no "since" sorts after those with one.
  const shownRoles = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const rows = !needle
      ? today ?? []
      : (today ?? []).filter((r) =>
          `${r.role.title} ${r.role.company} ${r.role.ref} ${r.role.ownerName ?? ""}`.toLowerCase().includes(needle)
        )
    const rank = (r: TodayRow) => (r.next.mode === "act" ? 0 : 1)
    return rows.slice().sort((a, b) => rank(a) - rank(b) || (a.next.since ?? "~").localeCompare(b.next.since ?? "~"))
  }, [today, q])
  // The rail's stage and phase come from the dashboard payload the page
  // already fetches — merged by id, so no second request for a visual.
  const statusById = useMemo(() => new Map((data?.roles ?? []).map((r) => [r.id, r])), [data])

  /**
   * THE ARCHIVE (16 September 2026).
   *
   * A role leaves the live table when it is finished, and it is finished in
   * one of two ways: the recruiter closed it, or its handover pack actually
   * reached the employer. The second is the one that was missing — ROL-2408
   * and ROL-2410 were delivered on 24 August and were still in the live queue
   * three weeks later, which is what Ose was looking at.
   *
   * Delivered is NOT closed, and the archive says so rather than tidying the
   * difference away: closing starts the retention clock on every candidate
   * attached to the role, so it stays a deliberate act and the row offers it.
   */
  const archived = useMemo(() => {
    const rows = (data?.roles ?? []).filter((r) => r.status === "closed" || r.handed_over_at)
    const when = (r: RoleRow) => r.closed_at ?? r.handed_over_at ?? ""
    return rows.slice().sort((a, b) => when(b).localeCompare(when(a)))
  }, [data])
  const [showArchive, setShowArchive] = useState(false)
  const needsClosing = archived.filter((r) => r.status !== "closed").length
  const acts = (today ?? []).filter((r) => r.next.mode === "act").length
  const live = today?.length ?? 0
  const headline =
    today === null
      ? "Working out where your roles stand…"
      : acts === 0
        ? "Nothing needs your attention right now."
        : acts === 1
          ? "1 role needs your attention"
          : `${acts} roles need your attention`
  const subline =
    today === null
      ? "One line per role, and what it needs next."
      : live === 0
        ? "No live roles yet."
        : "Roles that need you come first, then oldest first."
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
        <AgencyNav current="today" />

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

      <main className="ag-main agd-main agt">
        <div className="agd-topbar">
          <span className="agd-crumb">Today</span>
          <span className="agd-spacer" />
          <div className="agd-search agt-search">
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
          <button className="agd-tbtn accent" onClick={createRole} disabled={creating || state !== "ready"} title="New role (N)">
            {creating ? <span className="ag-spin" /> : "New role"}
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

              {/* Two counts the page already holds (frame 38). */}
              {today !== null && live > 0 && (
                <div className="agt-stats">
                  <div className="agt-stat" data-hot={acts > 0 || undefined}>
                    <span className="agt-stat-n">{acts}</span>
                    <span className="agt-stat-l">Needs you</span>
                  </div>
                  <div className="agt-stat">
                    <span className="agt-stat-n">{live}</span>
                    <span className="agt-stat-l">Live roles</span>
                  </div>
                </div>
              )}

              {/*
                LIVE ROLES, ONE LIST (frame 38, approved 5 Oct 2026, Ose).
                Every live role, the ones that need the recruiter first. There
                is no second group for roles "waiting on" anyone: a role that is
                not yours to move right now is still a live role, and it sits
                in the same list with a quiet "View".
              */}
              <section className="agd-band" aria-labelledby="agd-roles-h" id="agd-roles">
                <h2 className="agt-head" id="agd-roles-h">
                  Live roles {today !== null && <span className="agt-head-n">{shownRoles.length}</span>}
                </h2>
                {today === null ? (
                  <div className="ag-quiet" aria-live="polite">Working out where each role stands…</div>
                ) : shownRoles.length === 0 ? (
                  <div className="ag-quiet">
                    {q.trim() ? "No live role matches that." : "No live roles yet. Start one with New role."}
                  </div>
                ) : (
                  <div className="agt-list">
                    {shownRoles.map((r) => {
                      const act = r.next.mode === "act"
                      const status = statusById.get(r.role.id)
                      const age = r.next.since ? sinceLabel(r.next.since, todayNow) : ""
                      return (
                        <Link
                          key={r.role.id}
                          className="agt-row"
                          data-mode={r.next.mode}
                          href={r.next.cta?.href ?? `/agencies/roles/${r.role.id}`}
                        >
                          <span className="agt-who">
                            <span className="agt-title">{r.role.title}</span>
                            <span className="agt-meta">
                              {[r.role.company, r.role.ref, r.role.ownerName ?? "Unassigned"].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="agt-what">
                            <span className="agt-pill" data-act={act || undefined}>{sentenceCase(r.subState.chip)}</span>
                            <span className="agt-next">{r.next.title}</span>
                          </span>
                          <span className="agt-end">
                            {age && <span className="agt-age">{age}</span>}
                            {/* A span, not a button: the whole row is the link. */}
                            <span className="agt-btn" data-primary={act || undefined}>
                              {act ? r.next.cta?.label ?? "Open" : "View"}
                            </span>
                          </span>
                          {status && (
                            <span className="agt-rail-row">
                              <StatusRail row={status} />
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* ── Archive ──────────────────────────────────────────────
                * Finished roles, out of the live table but never out of the
                * record: the evidence, the audit trail and the pack all stay
                * readable. Erasure is the retention clock's job, not this
                * band's.
                *
                * Collapsed by default because it only grows, and a desk
                * should not scroll past its own history to reach its work. */}
              {archived.length > 0 && (
                <section className="agd-band" aria-labelledby="agd-archive-h">
                  <div className="agt-archive-head">
                    <h2 className="agt-head" id="agd-archive-h">Archive</h2>
                    {needsClosing > 0 && (
                      <span className="agt-owed">{needsClosing} handed over, not yet closed</span>
                    )}
                    <span className="ag-grow" />
                    <button
                      className="ag-archive-toggle"
                      aria-expanded={showArchive}
                      onClick={() => setShowArchive((v) => !v)}
                    >
                      {showArchive ? "Hide" : `Show ${archived.length}`}
                    </button>
                  </div>
                  {showArchive && (
                    <div className="ag-archive">
                      {archived.map((r) => {
                        const closed = r.status === "closed"
                        return (
                          <Link key={r.id} href={`/agencies/roles/${r.id}`} className="ag-archive-row" data-open={!closed}>
                            <span className="ag-archive-ref">{r.ref}</span>
                            <span className="ag-archive-title">{r.title}</span>
                            <span className="ag-archive-company">{r.company}</span>
                            <span className="ag-grow" />
                            {/* The two endings are not the same thing, and the
                                difference is a job somebody still owes. */}
                            {closed ? (
                              <span className="ag-archive-state">
                                Closed{r.closed_at ? ` · ${new Date(r.closed_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                              </span>
                            ) : (
                              <span className="ag-archive-state" data-owed="true">
                                Handed over{r.handed_over_at ? ` · ${new Date(r.handed_over_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""} · close it to start retention
                              </span>
                            )}
                          </Link>
                        )
                      })}
                      <p className="agt-archive-note">
                        Nothing here is deleted. Closing a role starts the retention clock on its
                        candidates; erasure happens when that clock runs out, not when a role leaves
                        this table.
                      </p>
                    </div>
                  )}
                </section>
              )}

              <p className="agd-foot">
                Tailr never rejects anyone automatically. Client declines are signals, not decisions, and every override is audited.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  )
}
