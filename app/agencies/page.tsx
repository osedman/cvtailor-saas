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
import { SignOut } from "@/components/agency/sign-out"

type StageState = "here" | "blocked" | "waiting" | "done"
interface RoleRow {
  id: string; ref: string; title: string; company: string; salary_band: string; status: string
  mine: boolean; days_open: number; candidate_count: number
  stage: number; stage_state: StageState; needs: string; needs_action: boolean
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
const COUNT_WORDS = ["Nothing", "One thing", "Two things", "Three things", "Four things", "Five things"]

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
  const [actioning, setActioning] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<"all" | "mine" | "urgent" | "closed">("all")
  const [queueView, setQueueView] = useState<"todo" | "done">("todo")
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

  const openRole = useCallback(
    (roleId: string, step?: string) =>
      router.push(step ? `/agencies/roles/${roleId}?step=${step}` : `/agencies/roles/${roleId}`),
    [router]
  )

  async function actionRights(r: RightsRequest) {
    const strong = r.kind === "erasure" || r.kind === "objection"
    if (strong && !window.confirm(`Completing this ${r.kind} request erases ${r.candidate_ref}'s CV and their assessment. The audit record of the decision survives. This cannot be undone.`)) return
    setActioning(r.id)
    await fetch("/api/agency/rights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: r.id, outcome: "completed" }),
    })
    setActioning(null)
    load()
  }

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

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

  const roleById = useMemo(() => new Map((data?.roles ?? []).map((r) => [r.id, r])), [data])

  // ---- Needs you now: at most three cards, worst first -------------------
  const cards = useMemo<AttnCard[]>(() => {
    if (!data) return []
    const out: AttnCard[] = []

    for (const r of data.needs_you.rights_requests) {
      out.push({
        key: `rights:${r.id}`,
        sev: "now",
        when: "Statutory clock",
        title: r.kind === "erasure" ? "Action a deletion request" : r.kind === "access" ? "Action an access request" : r.kind === "objection" ? "Action an objection" : "Action a correction request",
        body: `A candidate has asked to ${RIGHTS_WORDS[r.kind] ?? r.kind}. Completing it is audited; nothing happens silently.`,
        metaLeft: `${r.candidate_ref} · asked ${ago(r.requested_at)}`,
        cta: "Action it →",
        onClick: () => actionRights(r),
      })
    }

    for (const a of data.needs_you.client_actions) {
      if (a.action !== "decline") continue
      out.push({
        key: `decline:${a.id}`,
        sev: "now",
        when: "Client signal",
        title: `Your client passed on ${a.candidate_name}`,
        body: a.message ? `“${a.message}” — a decline is a signal, not a rejection. Nothing has changed on the candidate.` : "A decline is a signal, not a rejection. Worth a call to hear why before the next send.",
        metaLeft: `${a.candidate_ref}${a.role_title ? ` · ${a.role_title}` : ""}`,
        cta: "Open the submission →",
        onClick: () => a.role_id && openRole(a.role_id, "submission"),
      })
    }

    const broken = data.roles.find((r) => r.status !== "closed" && r.needs.includes("would not read"))
    if (broken) {
      out.push({
        key: `parse:${broken.id}`,
        sev: "now",
        when: "Blocked",
        title: `${broken.needs} on ${broken.title}`,
        body: "Failed CVs are invisible to scoring until they are re uploaded or pasted as text.",
        metaLeft: `${broken.ref} · ${broken.company || broken.title}`,
        cta: "Fix the uploads →",
        onClick: () => openRole(broken.id, "candidates"),
      })
    }

    for (const a of data.needs_you.client_actions) {
      if (a.action !== "question") continue
      out.push({
        key: `question:${a.id}`,
        sev: "soon",
        when: "Client asked",
        title: `A question about ${a.candidate_name}`,
        body: a.message ? `“${a.message}”` : "Your client asked a question through the portal.",
        metaLeft: `${a.candidate_ref}${a.role_title ? ` · ${a.role_title}` : ""} · ${ago(a.created_at)}`,
        cta: "Open the submission →",
        onClick: () => a.role_id && openRole(a.role_id, "submission"),
      })
    }

    if (data.next_calls[0]) {
      const c = data.next_calls[0]
      out.push({
        key: `call:${c.id}`,
        sev: "soon",
        when: "Best next call",
        title: `Call ${c.full_name} next`,
        body: `Confirming ${c.gaps.join(", ") || "the open gaps"} on a screening call moves them ${c.current} → ${c.potential}.`,
        metaLeft: `${c.ref} · ${c.role_title}`,
        cta: "Open the call sheet →",
        onClick: () => openRole(c.role_id, "screening"),
      })
    }

    if (data.client_heat.opened_silent[0]) {
      const h = data.client_heat.opened_silent[0]
      out.push({
        key: `silent:${h.recipient_id}`,
        sev: "soon",
        when: "Opened, no reply",
        title: `${h.contact_name} went quiet`,
        body: `Opened ${h.role_title || "your shortlist"}${h.last_opened_at ? ` ${ago(h.last_opened_at)}` : ""} and has not acted. Worth a nudge.`,
        metaLeft: h.company || "Client contact",
        cta: "See the shortlist →",
        onClick: () => scrollTo("agd-clients"),
      })
    }

    if (data.notices_detail[0]) {
      const n = data.notices_detail[0]
      const d = daysUntil(n.scheduled_for)
      out.push({
        key: `notice:${n.candidate_id}`,
        sev: "calm",
        when: d === 0 ? "Sends today" : `Sends in ${d} day${d === 1 ? "" : "s"}`,
        title: `Add a line to ${n.full_name}'s notice`,
        body: "The privacy notice sends itself either way. A personal line from you makes it a human email instead of a legal one.",
        metaLeft: `${n.ref} · ${n.role_title}`,
        cta: "Open the candidate →",
        onClick: () => router.push(`/agencies/roles/${n.role_id}/candidates/${n.candidate_id}`),
      })
    }

    if (data.pipeline.awaiting_screening.length > 0) {
      const list = data.pipeline.awaiting_screening
      out.push({
        key: "screening",
        sev: "calm",
        when: "Waiting on you",
        title: `${list.length} candidate${list.length === 1 ? "" : "s"} await screening calls`,
        body: `${list.slice(0, 3).map((c) => c.full_name).join(", ")}${list.length > 3 ? ` and ${list.length - 3} more` : ""}. Reviewed candidates score with more confidence.`,
        metaLeft: list[0].role_title,
        cta: "Start screening →",
        onClick: () => openRole(list[0].role_id, "screening"),
      })
    }

    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const topCards = cards.slice(0, 3)

  // ---- Queue: still to do -------------------------------------------------
  interface QueueRow { key: string; tag: string; tagClass: string; title: string; sub: string; right: string; hot?: boolean; onClick?: () => void }
  const todoRows = useMemo<QueueRow[]>(() => {
    if (!data) return []
    const rows: QueueRow[] = []
    for (const c of data.next_calls) {
      rows.push({
        key: `call:${c.id}`, tag: "Call", tagClass: "call",
        title: `${c.full_name} — screening call${c.gaps.length ? `, ask about ${c.gaps.join(", ")}` : ""}`,
        sub: `${c.ref} · ${c.role_title}`,
        right: `${c.current} → ${c.potential}`,
        onClick: () => openRole(c.role_id, "screening"),
      })
    }
    for (const c of data.pipeline.awaiting_decision) {
      rows.push({
        key: `decide:${c.id}`, tag: "Decide", tagClass: "review",
        title: `${c.full_name} is screened and has no decision`,
        sub: `${c.ref} · ${c.role_title}`,
        right: "your call",
        onClick: () => openRole(c.role_id, "compare"),
      })
    }
    for (const h of data.client_heat.opened_silent) {
      rows.push({
        key: `chase:${h.recipient_id}`, tag: "Chase", tagClass: "wait",
        title: `${h.contact_name}${h.company ? ` at ${h.company}` : ""} opened ${h.role_title || "the shortlist"} and went quiet`,
        sub: h.last_opened_at ? `opened ${ago(h.last_opened_at)}` : "opened",
        right: "nudge", hot: true,
      })
    }
    for (const h of data.client_heat.never_opened) {
      rows.push({
        key: `unopened:${h.recipient_id}`, tag: "Chase", tagClass: "wait",
        title: `${h.contact_name}${h.company ? ` at ${h.company}` : ""} has not opened ${h.role_title || "the shortlist"}`,
        sub: `sent ${ago(h.sent_at)}`,
        right: "resend?",
      })
    }
    for (const n of data.notices_detail) {
      const d = daysUntil(n.scheduled_for)
      rows.push({
        key: `notice:${n.candidate_id}`, tag: "Send", tagClass: "send",
        title: `${n.full_name}'s privacy notice — add a personal line`,
        sub: `${n.ref} · ${n.role_title}`,
        right: d === 0 ? "today" : `in ${d}d`,
        onClick: () => router.push(`/agencies/roles/${n.role_id}/candidates/${n.candidate_id}`),
      })
    }
    for (const s of data.worth_a_look) {
      rows.push({
        key: `look:${s.candidate_id}:${s.to_role_id}`, tag: "Look", tagClass: "look",
        title: `${s.full_name} already evidences ${s.covered} of ${s.total} core requirements for ${s.to_role_title}`,
        sub: `${s.candidate_ref} · on ${s.from_role_title} · nothing happens without you`,
        right: `${s.covered}/${s.total}`,
        onClick: () => router.push(`/agencies/roles/${s.from_role_id}/candidates/${s.candidate_id}`),
      })
    }
    return rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const doneRows = useMemo(() => {
    if (!data) return []
    return data.activity.slice(0, 8).map((a) => {
      const role = a.role_id ? roleById.get(a.role_id) : undefined
      return {
        key: `act:${a.id}`,
        title: `${a.entity_ref || a.entity_type} ${a.action.replace(/_/g, " ")}`,
        sub: role ? `${role.ref} · ${role.title}` : a.entity_type,
        right: ago(a.created_at),
        onClick: role ? () => openRole(role.id) : undefined,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, roleById])

  // ---- Roles: filter + search --------------------------------------------
  const visibleRoles = useMemo(() => {
    let list = data?.roles ?? []
    list = roleFilter === "closed" ? list.filter((r) => r.status === "closed")
      : roleFilter === "mine" ? list.filter((r) => r.status !== "closed" && r.mine)
      : roleFilter === "urgent" ? list.filter((r) => r.status !== "closed" && r.needs_action)
      : list.filter((r) => r.status !== "closed")
    const needle = q.trim().toLowerCase()
    if (needle) list = list.filter((r) => `${r.title} ${r.company} ${r.ref}`.toLowerCase().includes(needle))
    return list
  }, [data, roleFilter, q])

  const liveRoles = (data?.roles ?? []).filter((r) => r.status !== "closed")
  const filledRecently = (data?.roles ?? []).filter((r) => r.status === "closed").length
  const inFlight = liveRoles.reduce((s, r) => s + r.candidate_count, 0)
  const heatRows = [...(data?.client_heat.opened_silent ?? []), ...(data?.client_heat.never_opened ?? [])]

  const hour = new Date().getHours()
  const tail = hour >= 17 ? "before you log off" : hour >= 12 ? "this afternoon" : "this morning"
  const nCards = cards.length
  const headline =
    nCards > 0
      ? `${COUNT_WORDS[Math.min(nCards, 5)] ?? `${nCards} things`} need${nCards === 1 ? "s" : ""} you ${tail}.`
      : "Nothing is waiting on you."
  const subline = data?.focus
    ? <>Everything else is running. <b>{data.focus.company || data.focus.title}</b> is the one that slips if you do nothing today.</>
    : nCards > 0
      ? "Worst first. Everything below the cards can wait."
      : "No client signals, no requests, no blocked roles. A rare sight."

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
        <AgencyNav
          current="roles"
          onSection={(id) =>
            id === "top"
              ? window.scrollTo({ top: 0, behavior: "smooth" })
              : scrollTo(id)
          }
          sections={[
            { id: "top", label: "Today" },
            { id: "agd-roles", label: "Roles", count: liveRoles.length },
            { id: "agd-queue", label: "Candidates", count: inFlight },
            { id: "agd-clients", label: "Clients" },
            { id: "agd-health", label: "Reports" },
          ]}
        />

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

              {topCards.length > 0 && (
                <section className="agd-band">
                  <div className="agd-eyebrow-row">
                    <h2 className="agd-eyebrow">Needs you now</h2>
                    <span className="agd-rule" />
                    <span className="agd-aside">sorted by what breaks first</span>
                  </div>
                  <div className="agd-attn">
                    {topCards.map((c) => (
                      <button key={c.key} className={`agd-card ${c.sev}`} onClick={c.onClick} disabled={actioning !== null && c.key.startsWith("rights:")}>
                        <span className="agd-when">{c.when}</span>
                        <h3 className="agd-card-title">{c.title}</h3>
                        <p className="agd-card-body">{c.body}</p>
                        <span className="agd-card-meta">
                          {c.metaLeft}
                          <span className="agd-card-go">{actioning !== null && c.key.startsWith("rights:") ? "Working…" : c.cta}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/*
                BRIEFS FROM YOUR CLIENTS — always its own band, never folded
                into the three attention cards. A submitted brief is the start
                of the whole workflow, and it spent a week invisible because
                the dashboard never mentioned briefs and the inbox only shows
                the cookie's active agency. The elsewhere line exists for the
                same reason: work waiting in another of your agencies must
                say so, count-and-name only, with the switch one click away.
              */}
              {data && ((data.briefs?.waiting.length ?? 0) > 0 || (data.briefs?.elsewhere.length ?? 0) > 0) && (
                <section className="agd-band" id="agd-briefs">
                  <div className="agd-eyebrow-row">
                    <h2 className="agd-eyebrow">Briefs from your clients</h2>
                    <span className="agd-rule" />
                    <span className="agd-aside">accepting one starts the role in intake</span>
                  </div>
                  {(data.briefs?.waiting ?? []).length > 0 && (
                    <div className="agd-attn" style={{ gridTemplateColumns: "1fr" }}>
                      {(data.briefs?.waiting ?? []).map((b) => (
                        <button
                          key={b.id}
                          className="agd-card soon"
                          onClick={() => router.push("/agencies/briefs")}
                        >
                          <span className="agd-when">{ago(b.created_at)}</span>
                          <h3 className="agd-card-title">{b.role_title}</h3>
                          <p className="agd-card-body">
                            {b.company ? `From ${b.company}. ` : "From your client. "}
                            {b.has_jd
                              ? "JD attached — accepting carries it straight into intake."
                              : "No JD — accepting opens intake to paste or upload one."}
                          </p>
                          <span className="agd-card-meta">
                            Waiting on you
                            <span className="agd-card-go">Review &amp; accept →</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {(data.briefs?.elsewhere ?? []).map((e) => (
                    <p key={e.agency_id} className="agd-aside" style={{ marginTop: 10 }}>
                      {e.agency_name} has {e.count} brief{e.count === 1 ? "" : "s"} waiting.{" "}
                      <button
                        className="agd-tbtn"
                        onClick={async () => {
                          await fetch("/api/agency/session", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ agencyId: e.agency_id }),
                          })
                          load()
                        }}
                      >
                        Switch to {e.agency_name} →
                      </button>
                    </p>
                  ))}
                </section>
              )}

              <section className="agd-band" id="agd-queue">
                <div className="agd-eyebrow-row">
                  <h2 className="agd-eyebrow">Queue</h2>
                  <span className="agd-rule" />
                </div>
                <div className="agd-queue">
                  <div className="agd-queue-head">
                    <div className="agd-seg" role="group" aria-label="Queue view">
                      <button aria-pressed={queueView === "todo"} onClick={() => setQueueView("todo")}>Still to do</button>
                      <button aria-pressed={queueView === "done"} onClick={() => setQueueView("done")}>Just happened</button>
                    </div>
                    <span className="agd-spacer" />
                    <span className="agd-aside">{queueView === "todo" ? `${todoRows.length} open` : "from the audit log"}</span>
                  </div>
                  {queueView === "todo" && todoRows.length === 0 && (
                    <div className="ag-quiet">The queue is empty. Every candidate is either moving or waiting on someone else.</div>
                  )}
                  {queueView === "todo" && todoRows.map((r) => (
                    <button key={r.key} className="agd-qrow" onClick={r.onClick} disabled={!r.onClick}>
                      <span className={`agd-tag ${r.tagClass}`}>{r.tag}</span>
                      <span className="agd-qmain">
                        <span className="agd-qtitle">{r.title}</span>
                        <span className="agd-qsub">{r.sub}</span>
                      </span>
                      <span className={`agd-qdue${r.hot ? " hot" : ""}`}>{r.right}</span>
                    </button>
                  ))}
                  {queueView === "done" && doneRows.length === 0 && (
                    <div className="ag-quiet">No activity yet.</div>
                  )}
                  {queueView === "done" && doneRows.map((r) => (
                    <button key={r.key} className="agd-qrow" onClick={r.onClick} disabled={!r.onClick}>
                      <span className="agd-tag done">Done</span>
                      <span className="agd-qmain">
                        <span className="agd-qtitle">{r.title}</span>
                        <span className="agd-qsub">{r.sub}</span>
                      </span>
                      <span className="agd-qdue">{r.right}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="agd-band" id="agd-roles">
                <div className="agd-eyebrow-row">
                  <h2 className="agd-eyebrow">Live roles</h2>
                  <span className="agd-rule" />
                  <span className="agd-aside">
                    {liveRoles.length} live{filledRecently > 0 ? ` · ${filledRecently} closed` : ""}
                  </span>
                </div>
                <div className="ag-filters" role="group" aria-label="Filter roles" style={{ marginBottom: 12 }}>
                  {([["all", "All"], ["mine", "Mine"], ["urgent", "Urgent"], ["closed", "Closed"]] as const).map(([key, label]) => (
                    <button key={key} className="ag-filter" aria-pressed={roleFilter === key} onClick={() => setRoleFilter(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="agd-roles">
                  {visibleRoles.length === 0 && (
                    <div className="ag-card"><div className="ag-quiet">
                      {(data.roles.length === 0 && "No roles yet. Create one and paste the client brief.") ||
                        (q.trim() && "No role matches that search.") ||
                        (roleFilter === "urgent" && "No role is blocked. Nothing here needs you right now.") ||
                        (roleFilter === "mine" && "None of the live roles were created by you.") ||
                        (roleFilter === "closed" && "No closed roles yet.") ||
                        "No live roles."}
                    </div></div>
                  )}
                  {visibleRoles.map((role) => {
                    const mark = (role.company || role.title).trim().charAt(0).toUpperCase() || "?"
                    const lastLine = role.needs
                      || (role.last_activity ? `${role.last_activity.entity_ref || role.last_activity.entity_type} ${role.last_activity.action.replace(/_/g, " ")} ${ago(role.last_activity.created_at)}` : "No activity yet")
                    return (
                      <button
                        key={role.id}
                        className="agd-role"
                        data-flag={role.stage_state === "blocked" ? "blocked" : undefined}
                        onClick={() => openRole(role.id)}
                      >
                        <span className="agd-role-id">
                          <span className="agd-mark">{mark}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="agd-role-title">{role.title}</span>
                            <span className="agd-role-sub">
                              {role.ref} · {role.company || "No company yet"}{role.salary_band ? ` · ${role.salary_band}` : ""} · day {role.days_open}{role.mine ? "" : " · not yours"}
                            </span>
                            <span
                              className="agd-role-last"
                              data-tone={role.stage_state === "blocked" ? "blocked" : role.stage_state === "waiting" ? "waiting" : undefined}
                            >
                              {lastLine}
                            </span>
                          </span>
                        </span>
                        <span className="ag-stage" aria-label={`Step ${role.stage} of 6: ${STAGES[role.stage - 1]}`}>
                          {STAGES.map((name, i) => {
                            const n = i + 1
                            const s = role.stage_state === "done" ? "done" : n < role.stage ? "done" : n === role.stage ? role.stage_state : "todo"
                            return (
                              <span className="ag-stage-seg" key={name} data-s={s} title={`${n}. ${name}`}>
                                <span className="ag-stage-bar" />
                                <span className="ag-stage-label">{name}</span>
                              </span>
                            )
                          })}
                        </span>
                        <span className="agd-role-score">
                          {role.top_score === null ? (
                            <span className="agd-noscore">no score yet</span>
                          ) : (
                            <>
                              <span className={`agd-bignum${role.status === "closed" ? " pale" : ""}`}>{role.top_score}</span>
                              <span className="agd-delta-col">
                                {role.top_delta !== null && role.top_delta !== 0 && (
                                  <span className={`ag-delta${role.top_delta < 0 ? " agd-down" : ""}`}>
                                    {role.top_delta > 0 ? "+" : ""}{role.top_delta}
                                  </span>
                                )}
                                <span className="agd-since">since parse</span>
                              </span>
                              {role.top_original !== null && <Spark from={role.top_original} to={role.top_score} />}
                            </>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="agd-band" id="agd-clients">
                <div className="agd-eyebrow-row">
                  <h2 className="agd-eyebrow">Clients</h2>
                  <span className="agd-rule" />
                  <span className="agd-aside">from your shortlist links</span>
                </div>
                <div className="agd-queue">
                  {heatRows.length === 0 && (
                    <div className="ag-quiet">No live shortlist links right now. Send a submission and client opens show up here.</div>
                  )}
                  {(data.client_heat.opened_silent ?? []).map((row) => (
                    <div className="agd-qrow static" key={row.recipient_id}>
                      <span className="agd-tag call">Opened</span>
                      <span className="agd-qmain">
                        <span className="agd-qtitle"><b>{row.contact_name}</b>{row.company ? ` at ${row.company}` : ""} opened {row.role_title || "your shortlist"} and has not acted. Worth a call.</span>
                        <span className="agd-qsub">{row.last_opened_at ? `last opened ${ago(row.last_opened_at)}` : ""}</span>
                      </span>
                      <span className="agd-qdue hot">silent</span>
                    </div>
                  ))}
                  {(data.client_heat.never_opened ?? []).map((row) => (
                    <div className="agd-qrow static" key={row.recipient_id}>
                      <span className="agd-tag wait">Unopened</span>
                      <span className="agd-qmain">
                        <span className="agd-qtitle"><b>{row.contact_name}</b>{row.company ? ` at ${row.company}` : ""} has not opened {row.role_title || "the shortlist"} yet.</span>
                        <span className="agd-qsub">sent {ago(row.sent_at)}</span>
                      </span>
                      <span className="agd-qdue">waiting</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="agd-band" id="agd-health">
                <div className="agd-eyebrow-row">
                  <h2 className="agd-eyebrow">Desk health</h2>
                  <span className="agd-rule" />
                  <span className="agd-aside">rolling 90 days</span>
                </div>
                <div className="agd-health">
                  <div className="agd-stat">
                    <p className="agd-stat-k">Brief to first shortlist</p>
                    <p className="agd-stat-v">{data.health.brief_to_shortlist.days ?? "—"}<em>{data.health.brief_to_shortlist.days !== null ? " days" : ""}</em></p>
                    <p className="agd-stat-n">
                      {data.health.brief_to_shortlist.days === null ? "No shortlist sent in the window yet." : "Average across roles that shipped a shortlist."}
                      {data.health.brief_to_shortlist.breach && <> <b>{data.health.brief_to_shortlist.breach}.</b></>}
                    </p>
                  </div>
                  <div className="agd-stat">
                    <p className="agd-stat-k">Shortlist to client reply</p>
                    <p className="agd-stat-v">{data.health.shortlist_to_reply.days ?? "—"}<em>{data.health.shortlist_to_reply.days !== null ? " days" : ""}</em></p>
                    <p className="agd-stat-n">
                      {data.health.shortlist_to_reply.days === null ? "No client has replied in the window yet." : "First action after a shortlist lands."}
                      {data.health.shortlist_to_reply.breach && <> <b>{data.health.shortlist_to_reply.breach}.</b></>}
                    </p>
                  </div>
                  <div className="agd-stat">
                    <p className="agd-stat-k">Positive client responses</p>
                    <p className="agd-stat-v">{data.health.positive_response.pct ?? "—"}<em>{data.health.positive_response.pct !== null ? "%" : ""}</em></p>
                    <p className="agd-stat-n">
                      {data.health.positive_response.pct === null
                        ? "No client responses in the window yet."
                        : `Of ${data.health.positive_response.n} client action${data.health.positive_response.n === 1 ? "" : "s"}, the share that moved a candidate forward.`}
                    </p>
                  </div>
                </div>
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
