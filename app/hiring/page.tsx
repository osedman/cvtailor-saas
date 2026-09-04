"use client"

/**
 * The hiring manager's dashboard — Figma "Tailr — Hiring Manager Concept",
 * 01 · Hiring manager → HM · Dashboard.
 *
 * Four bands in falling urgency, the same grammar as the recruiter dashboard
 * so the two sides of the wall read as one product: hero, NEEDS YOU NOW,
 * YOUR ROLES, YOUR AVAILABILITY, then the attribution footer.
 *
 * ---------------------------------------------------------------------------
 * THIS SCREEN IS EMPTY TODAY, AND THAT IS THE DESIGN.
 *
 * The interview loop is data-only (docs/AGENCIES_SCHEMA.md §5.5): the tables
 * exist, nothing writes them yet, and getHiringDashboard therefore returns
 * empty arrays for every real user. Every card, row and chip below is derived
 * from that live payload — there is no sample data anywhere in this file and
 * none may be added. What a real hiring manager sees is the honest empty
 * state: a hero that says nothing is waiting on them, and one calm sentence
 * per band naming what will appear there. Controls whose backend does not
 * exist are rendered DISABLED with a title that says so, per the precedent set
 * by "Fill from transcript" on the recruiter side.
 * ---------------------------------------------------------------------------
 *
 * Reads go through /api/hiring/dashboard, never Supabase: hiring managers hold
 * zero RLS grants (§5.4), so a browser-side query would return nothing by
 * design. Client component, like the recruiter dashboard, so that every date
 * and time on screen is formatted in the reader's own locale and timezone
 * rather than the server's.
 */

import { useEffect, useMemo, useState } from "react"
import { SignOut } from "@/components/agency/sign-out"
import { DECISION_LABEL, EmptyBand, HiringNav, fmtWhen } from "@/components/agency/hm-shared"
import Link from "next/link"
import type {
  HiringBrief,
  HiringDashboard,
  HiringLink,
  HiringRound,
  HiringSlot,
  RoundDecision,
} from "@/lib/agency/types"
import { ageLabel, type NextAction } from "@/lib/agency/next-action"

type Screen = "loading" | "unauthed" | "not_linked" | "error" | "ready"

/** Urgency ladder, borrowed from the recruiter dashboard so the colours mean
 * the same thing on both sides: coral breaks today, amber is this week, sage
 * is waiting on somebody else. */
type Sev = "now" | "soon" | "calm"

interface AttnCard {
  key: string
  sev: Sev
  when: string
  title: string
  body: string
  meta: string
}

/** `none` draws the neutral bar and is not a data-s value in agencies.css. */
type StepState = "done" | "here" | "waiting" | "blocked" | "none"

interface RoleRow {
  key: string
  title: string
  sub: string
  note: string
  noteTone: "blocked" | "waiting" | "calm"
  steps: { label: string; state: StepState }[]
}

const STEP_LABELS = ["Brief", "Shortlist", "R1", "R2", "Decide"]


/** "in 3 hours" / "in 40 minutes" — only ever used inside 24 hours. */
function fmtCountdown(at: number, now: number): string {
  const mins = Math.max(0, Math.round((at - now) / 60000))
  if (mins < 60) return `In ${mins} minute${mins === 1 ? "" : "s"}`
  const hours = Math.round(mins / 60)
  return `In ${hours} hour${hours === 1 ? "" : "s"}`
}

function initialsOf(link: HiringLink | undefined, email: string): string {
  const name = (link?.fullName ?? "").trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? ""
    const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
    if (first) return `${first}${last}`.toUpperCase()
  }
  return (email || "?").slice(0, 2).toUpperCase()
}

/** "Meridian Search · Acme Ltd", plus a count when the person wears the hat
 * for more than one agency. Multi-link is legitimate (§5.4) and the crumb has
 * to admit it rather than silently showing the first. */
function crumbFor(links: HiringLink[]): string {
  const first = links[0]
  if (!first) return "Hiring"
  const head = first.company ? `${first.agencyName} · ${first.company}` : first.agencyName
  return links.length > 1 ? `${head} + ${links.length - 1} more` : head
}

/**
 * The NEEDS YOU NOW band, derived entirely from the live payload.
 *
 * Only three things can genuinely need a hiring manager: a decision they owe
 * on a round that already happened, an interview about to start, and a brief
 * sitting with the recruiter. Nothing here is invented, and with today's empty
 * payload it returns [].
 */
function buildAttention(d: HiringDashboard, now: number): AttnCard[] {
  const cards: AttnCard[] = []

  for (const round of d.rounds) {
    if (round.status === "completed" && !round.latest_decision) {
      cards.push({
        key: `decide:${round.id}`,
        sev: "now",
        when: "Decision owed",
        title: `${round.role_title} · round ${round.round_number}`,
        body: `You have met ${round.candidate_ref}. Nobody moves until your recruiter has your read.`,
        meta: round.candidate_ref,
      })
      continue
    }
    if (round.status !== "scheduled" || !round.scheduled_at) continue
    const at = new Date(round.scheduled_at).getTime()
    if (Number.isNaN(at) || at < now) continue
    const hours = (at - now) / 3_600_000
    if (hours > 24 * 7) continue
    cards.push({
      key: `round:${round.id}`,
      sev: hours <= 24 ? "now" : "soon",
      when: hours <= 24 ? fmtCountdown(at, now) : fmtWhen(round.scheduled_at),
      title: `${round.role_title} · round ${round.round_number}`,
      body: `${round.duration_minutes} minutes with ${round.candidate_ref}.`,
      meta: round.meeting_url ? "Joining link sent" : "No joining link yet",
    })
  }

  for (const brief of d.briefs) {
    if (brief.status !== "submitted") continue
    cards.push({
      key: `brief:${brief.id}`,
      sev: "calm",
      when: "With your recruiter",
      title: brief.role_title || "Untitled brief",
      body: "Your brief is with the agency. Nothing is needed from you until they come back on it.",
      meta: brief.team || brief.location || "Awaiting a reply",
    })
  }

  const rank: Record<Sev, number> = { now: 0, soon: 1, calm: 2 }
  return cards.sort((a, b) => rank[a.sev] - rank[b.sev]).slice(0, 3)
}

/**
 * The step rail: BRIEF → SHORTLIST → R1 → R2 → DECIDE.
 *
 * SHORTLIST is deliberately coarse. A client sees none of the recruiter's
 * shortlisting work — no candidates, no scores, no evidence (the disclosure
 * rules in lib/agency/client-auth.ts) — so the only honest signal available
 * is whether an interview came out of it.
 */
function buildSteps(brief: HiringBrief | null, rounds: HiringRound[]): RoleRow["steps"] {
  const first = rounds.find((r) => r.round_number === 1) ?? null
  const later = rounds.filter((r) => r.round_number >= 2)
  const decided = rounds.some((r) => r.latest_decision !== null)
  const owed = rounds.some((r) => r.status === "completed" && !r.latest_decision)

  const briefState: StepState = !brief ? "none" : brief.status === "declined" ? "blocked" : "done"
  const shortlist: StepState =
    rounds.length > 0 ? "done" : brief?.status === "accepted" ? "waiting" : "none"

  const roundState = (rs: HiringRound[]): StepState => {
    if (rs.some((r) => r.status === "completed")) return "done"
    if (rs.some((r) => r.status === "scheduled")) return "here"
    return "none"
  }

  const states: StepState[] = [
    briefState,
    shortlist,
    first ? roundState([first]) : "none",
    later.length ? roundState(later) : "none",
    decided ? "done" : owed ? "here" : "none",
  ]

  return STEP_LABELS.map((label, i) => ({ label, state: states[i] }))
}

function noteFor(
  brief: HiringBrief | null,
  rounds: HiringRound[],
  now: number
): { note: string; noteTone: RoleRow["noteTone"] } {
  if (brief?.status === "declined") {
    return { note: "Your recruiter declined this brief.", noteTone: "blocked" }
  }
  const owed = rounds.find((r) => r.status === "completed" && !r.latest_decision)
  if (owed) {
    return { note: `A decision is owed on round ${owed.round_number}.`, noteTone: "blocked" }
  }
  const next = rounds
    .filter((r) => r.status === "scheduled" && r.scheduled_at)
    .map((r) => ({ r, at: new Date(r.scheduled_at as string).getTime() }))
    .filter((x) => !Number.isNaN(x.at) && x.at >= now)
    .sort((a, b) => a.at - b.at)[0]
  if (next) {
    return {
      note: `Round ${next.r.round_number} on ${fmtWhen(next.r.scheduled_at as string)}.`,
      noteTone: "waiting",
    }
  }
  if (brief?.status === "submitted") {
    return { note: "With your recruiter.", noteTone: "calm" }
  }
  return { note: "", noteTone: "calm" }
}

/** One row per role the client can see: every brief they wrote, plus any role
 * an interview of theirs hangs off (the recruiter can open a role without a
 * client brief). */
function buildRoles(d: HiringDashboard, now: number): RoleRow[] {
  const rows: RoleRow[] = []
  const claimed = new Set<string>()

  for (const brief of d.briefs) {
    const rounds = brief.role_id ? d.rounds.filter((r) => r.role_id === brief.role_id) : []
    if (brief.role_id) claimed.add(brief.role_id)
    rows.push({
      key: brief.role_id ?? `brief:${brief.id}`,
      title: brief.role_title || "Untitled brief",
      sub: [brief.team, brief.location].filter(Boolean).join(" · ") || "No team or location given",
      steps: buildSteps(brief, rounds),
      ...noteFor(brief, rounds, now),
    })
  }

  for (const round of d.rounds) {
    if (claimed.has(round.role_id)) continue
    claimed.add(round.role_id)
    const rounds = d.rounds.filter((r) => r.role_id === round.role_id)
    rows.push({
      key: round.role_id,
      title: round.role_title || "Untitled role",
      sub: "Opened by your recruiter",
      steps: buildSteps(null, rounds),
      ...noteFor(null, rounds, now),
    })
  }

  return rows
}


/** One row of what needs the client, from /api/hiring/today — the same ladder
 * as their role header, so the two never disagree. */
interface ClientTodayRow {
  role: { id: string; ref: string; title: string; company: string; recruiterName: string | null }
  subState: { key: string; chip: string }
  next: NextAction
}

export default function HiringDashboardPage() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [today, setToday] = useState<ClientTodayRow[] | null>(null)
  const [todayNow, setTodayNow] = useState<string>(() => new Date().toISOString())
  const [data, setData] = useState<HiringDashboard | null>(null)
  const [email, setEmail] = useState("")
  // Bumped after a write so the dashboard re-reads rather than guessing at the
  // new state locally: slots gain and lose their booked flag server-side.
  const [refresh, setRefresh] = useState(0)
  // True only when this person ALSO works at an agency. A hiring manager who
  // is only ever a client must never be shown a door into the recruiter
  // product — it is not theirs, and offering it would imply it might be.
  const [alsoRecruiter, setAlsoRecruiter] = useState(false)

  const reload = () => setRefresh((n) => n + 1)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [meRes, dashRes] = await Promise.all([
          fetch("/api/hiring/me"),
          fetch("/api/hiring/dashboard"),
        ])
        if (!live) return
        if (dashRes.status === 401) return setScreen("unauthed")
        if (dashRes.status === 403) return setScreen("not_linked")
        if (!dashRes.ok) return setScreen("error")

        const body = (await dashRes.json()) as {
          dashboard?: HiringDashboard
          alsoRecruiter?: boolean
        }
        if (!body.dashboard) return setScreen("error")
        if (live) setAlsoRecruiter(Boolean(body.alsoRecruiter))
        if (meRes.ok) {
          const me = (await meRes.json()) as { email?: string }
          if (live) setEmail(me.email ?? "")
        }
        if (!live) return
        setData(body.dashboard)
        setScreen("ready")
      } catch {
        if (live) setScreen("error")
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [refresh])

  // Fixed at first paint of the ready screen so a card cannot re-sort itself
  // under the reader's cursor while they are looking at it.
  const now = useMemo(() => Date.now(), [])
  const cards = useMemo(() => (data ? buildAttention(data, now) : []), [data, now])
  const roles = useMemo(() => (data ? buildRoles(data, now) : []), [data, now])
  /**
   * Rounds the client can still do something about. Cancelled ones are
   * history and stay out of the way.
   *
   * RANKED, not chronological — the same move the recruiter side made in
   * 655ad76. A flat list gives a decision that is holding up five people the
   * same weight as one that happened and is finished. Order: what is owed,
   * then what is coming, then what is done.
   */
  useEffect(() => {
    if (screen !== "ready") return
    let live = true
    fetch("/api/hiring/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !Array.isArray(d?.roles)) return
        setToday(d.roles as ClientTodayRow[])
        if (typeof d.now === "string") setTodayNow(d.now)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [screen, data])

  const actionable = useMemo(() => {
    const rank = (r: HiringRound): number => {
      if (r.latest_decision) return 3
      if (r.status === "completed") return r.has_debrief ? 0 : 1
      return 2
    }
    return (data?.rounds ?? [])
      .filter((r) => r.status !== "cancelled")
      .slice()
      .sort((a, b) => {
        const byRank = rank(a) - rank(b)
        if (byRank !== 0) return byRank
        const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0
        const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0
        return at - bt
      })
  }, [data])
  const links = data?.links ?? []
  const slots = data?.slots ?? []

  const dateLine = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    []
  )

  const agencyName = links[0]?.agencyName ?? "your agency"
  const company = links[0]?.company ?? ""

  const acts = (today ?? []).filter((r) => r.next.mode === "act")
  const headline =
    today === null
      ? "Working out what needs you…"
      : acts.length === 0
        ? "Nothing needs you today."
        : acts.length === 1
          ? `One thing needs you: ${acts[0].next.title.toLowerCase()}.`
          : `${acts.length} things need you.`

  const statusMessage =
    screen === "loading"
      ? "Loading your workspace."
      : screen === "ready"
        ? `Workspace loaded. ${headline}`
        : screen === "unauthed"
          ? "Sign in to open your workspace."
          : screen === "not_linked"
            ? "This account has no client access yet."
            : "We could not load your workspace."

  return (
    <main className="ag-main agd-main hm-main">
      <div className="agd-topbar">
        <div className="ag-brand-mark" aria-hidden="true">
          T
        </div>
        <span className="agd-crumb">{screen === "ready" ? crumbFor(links) : "Hiring"}</span>
        <span className="agd-spacer" />
        {/* The hat and the face only appear once the server has confirmed both.
            A "HIRING MANAGER" chip over a "?" avatar on the signed-out screen
            would be the product asserting something it has not established. */}
        {screen === "ready" && (
          <>
            <span className="ag-pill hm-role-chip">Hiring manager</span>
            <div className="agd-avatar" aria-hidden="true">
              {initialsOf(links[0], email)}
            </div>
            <span className="sr-only">Signed in as {email || "your account"}</span>
            {/* A hiring manager is often on a shared machine too, and this
                surface had no way out either. Their door is the consumer
                login, not the agency one — they are a client, not staff. */}
            <SignOut door="consumer" />
          </>
        )}
      </div>

      {/*
        WHOSE SIDE OF THE WALL THIS IS.

        The recruiter dashboard and this one are both dark and share the `agd-`
        chrome, on the reasoning that the two sides should read as one product.
        In practice a person holding both hats could not tell them apart: they
        landed on /agencies (membership is checked first), believed they were
        here, clicked a role and got the recruiter workflow — with no link to
        /hiring anywhere to correct the impression.

        So the band states it plainly, and carries the way back for anyone who
        genuinely holds both hats. It renders on the ready screen only: over a
        signed-out or unlinked screen it would be asserting a relationship the
        server has not confirmed.
      */}
      {screen === "ready" && (
        <div className="hm-side-band" role="note">
          <span className="hm-side-dot" aria-hidden="true" />
          <span className="hm-side-text">
            <b>You are on the client side.</b> This is what {links[0]?.agencyName ?? "your agency"}{" "}
            shows you — your own briefs, interviews and decisions. Their working on candidates is
            not here.
          </span>
          {alsoRecruiter && (
            <Link className="agd-tbtn hm-side-switch" href="/agencies">
              Back to your agency →
            </Link>
          )}
        </div>
      )}

      {/* One small live region rather than aria-live on the whole page: a
          screen reader should hear that the workspace arrived and what state
          it is in, not have the entire dashboard read out at it. */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {screen === "ready" && <HiringNav />}

      <div className="agd-page" aria-busy={screen === "loading"}>
        {screen === "loading" && (
          <div className="ag-card">
            <div className="ag-card-body" style={{ textAlign: "center", padding: 48 }}>
              <span className="ag-spin" />
              <p className="ag-note" style={{ marginTop: 12 }}>
                Loading your workspace.
              </p>
            </div>
          </div>
        )}

        {screen === "unauthed" && (
          <div className="ag-card">
            <div className="ag-card-body" style={{ padding: 40 }}>
              <p className="ag-card-title" style={{ margin: 0 }}>
                Sign in to open your workspace.
              </p>
              <p className="ag-note" style={{ margin: "6px 0 16px", maxWidth: "52ch" }}>
                Your email address and a link we send you — no password.
              </p>
              <a
                className="ag-btn ag-btn-primary"
                href="/agencies/sign-in?next=%2Fhiring"
                style={{ textDecoration: "none" }}
              >
                Sign in
              </a>
            </div>
          </div>
        )}

        {screen === "not_linked" && (
          <div className="ag-card">
            <div className="ag-card-body" style={{ padding: 40 }}>
              <p className="ag-card-title" style={{ margin: 0 }}>
                This account has no client access yet.
              </p>
              <p className="ag-note" style={{ marginTop: 6, maxWidth: "58ch" }}>
                Hiring-manager access is given by invitation only — your recruiter sends a link
                to the address they hold for you, and accepting it opens this workspace. Ask them
                for one, or check your inbox for an invitation that has not been opened yet.
              </p>
            </div>
          </div>
        )}

        {screen === "error" && (
          <div className="ag-card">
            <div className="ag-card-body" style={{ padding: 40 }}>
              <p className="ag-card-title" style={{ margin: 0 }}>
                We could not load your workspace.
              </p>
              <p className="ag-note" style={{ marginTop: 6 }}>
                Reload the page. If it keeps failing, tell your recruiter — nothing you have done
                is lost.
              </p>
            </div>
          </div>
        )}

        {screen === "ready" && data && (
          <>
            <section className="agd-hero">
              <p className="agd-date">
                {dateLine} · {agencyName}
              </p>
              <h1 className="agd-h1">{headline}</h1>
              <p className="agd-sub">
                {cards.length === 0 ? (
                  <>
                    You are connected to <b>{agencyName}</b>
                    {company ? (
                      <>
                        {" "}
                        as hiring manager for <b>{company}</b>
                      </>
                    ) : null}
                    . When they send a shortlist, book an interview or need a decision from you,
                    it lands here first — and you will get an email as well.
                  </>
                ) : (
                  <>
                    Sorted by what breaks first. Everything below is from <b>{agencyName}</b>; your
                    recruiter sees the same rows from their side.
                  </>
                )}
              </p>
            </section>

            <section className="agd-band" aria-labelledby="hm-attn">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-attn">
                  Needs you now
                </h2>
                <span className="agd-rule" />
                {/* An empty band is not "sorted by" anything. */}
                {acts.length > 0 && <span className="agd-aside">what only you can do, first</span>}
              </div>
              {today === null ? (
                <div className="ag-quiet" aria-live="polite">Working out what needs you…</div>
              ) : today.length === 0 ? (
                <EmptyBand
                  title="Nothing needs you today."
                  body="Shortlists to decide on, rounds to write up and decisions your recruiter is waiting on all appear here first."
                />
              ) : (
                <div className="agd-today">
                  <div className="agd-today-group">
                    {today.map((r) => (
                      <Link
                        key={r.role.id}
                        className={`agd-today-row ${r.next.mode}`}
                        href={r.next.cta?.href ?? `/hiring/roles/${r.role.id}`}
                      >
                        <span className="agd-today-role">
                          <span className="agd-today-role-title">{r.role.title}</span>
                          <span className="agd-today-role-meta">
                            {r.role.ref}
                            {r.role.recruiterName ? ` · ${r.role.recruiterName}` : ""}
                          </span>
                        </span>
                        <span className="agd-today-state">
                          <span className="agd-today-chip">
                            {r.next.mode === "act" ? "Needs you" : r.next.mode === "done" ? "Done" : "Waiting"} · {r.subState.chip}
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

            <section className="agd-band" aria-labelledby="hm-roles">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-roles">
                  Your roles
                </h2>
                <span className="agd-rule" />
                <Link className="agd-tbtn primary" href="/hiring/briefs/new">
                  Post a brief
                </Link>
              </div>
              {roles.length > 0 ? (
                <div className="agd-roles">
                  {roles.map((role) => (
                    /* A row with a role behind it opens that role's screen. A
                       brief the recruiter has not accepted yet has no role to
                       open — it stays a row, because a door to nowhere is
                       worse than no door. */
                    role.key.startsWith("brief:") ? (
                    <article key={role.key} className="agd-role hm-role">
                      <div className="agd-role-id">
                        <div className="ag-grow">
                          <span className="agd-role-title">{role.title}</span>
                          <span className="agd-role-sub">{role.sub}</span>
                          {role.note && (
                            <span className="agd-role-last" data-tone={role.noteTone}>
                              {role.note}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ag-stage hm-steps">
                        {role.steps.map((step) => (
                          <div
                            key={step.label}
                            className="ag-stage-seg"
                            data-s={step.state === "none" ? undefined : step.state}
                          >
                            <span className="ag-stage-bar" />
                            <span className="ag-stage-label">{step.label}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                    ) : (
                    <Link key={role.key} href={`/hiring/roles/${role.key}`} className="agd-role hm-role hm-role-door">
                      <div className="agd-role-id">
                        <div className="ag-grow">
                          <span className="agd-role-title">{role.title}</span>
                          <span className="agd-role-sub">{role.sub}</span>
                          {role.note && (
                            <span className="agd-role-last" data-tone={role.noteTone}>
                              {role.note}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ag-stage hm-steps">
                        {role.steps.map((step) => (
                          <div
                            key={step.label}
                            className="ag-stage-seg"
                            data-s={step.state === "none" ? undefined : step.state}
                          >
                            <span className="ag-stage-bar" />
                            <span className="ag-stage-label">{step.label}</span>
                          </div>
                        ))}
                      </div>
                    </Link>
                    )
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="No roles yet."
                  body="Every role you brief your recruiter on gets a row here, with the rail showing how far it has got: brief, shortlist, first round, second round, decision. Shortlists your recruiter sends will appear here too. Post a brief to start one."
                />
              )}
            </section>

            <section className="agd-band" aria-labelledby="hm-rounds">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-rounds">
                  Your interviews
                </h2>
                <span className="agd-rule" />
                <Link className="agd-tbtn primary" href="/hiring/interviews">
                  Open interviews →
                </Link>
              </div>
              {/* A summary, deliberately: the write-ups, decisions and your
                  diary live on the Interviews screen now. Performing all of it
                  on the dashboard is how this page became a corridor with the
                  furniture of four rooms in it. */}
              {actionable.length > 0 ? (
                <div className="ag-stack" style={{ gap: 8 }}>
                  {actionable.slice(0, 4).map((r) => (
                    <Link key={r.id} href="/hiring/interviews" className="agd-card hm-static hm-round-line">
                      <span className="ag-grow" style={{ minWidth: 0 }}>
                        <span className="agd-eyebrow">
                          {r.role_title} · round {r.round_number} · {r.candidate_ref}
                        </span>
                        <span className="hm-round-when">
                          {r.scheduled_at ? fmtWhen(r.scheduled_at) : "No time set"}
                        </span>
                      </span>
                      {r.latest_decision ? (
                        <span className="ag-pill">{DECISION_LABEL[r.latest_decision]}</span>
                      ) : r.status === "completed" ? (
                        <span className="ag-pill warn">{r.has_debrief ? "Needs your decision" : "Needs your write-up"}</span>
                      ) : (
                        <span className="ag-pill">Scheduled</span>
                      )}
                    </Link>
                  ))}
                  {(actionable.length > 4 || slots.length > 0) && (
                    <p className="agd-aside">
                      {actionable.length > 4 ? `${actionable.length - 4} more on the interviews screen. ` : ""}
                      Your availability ({slots.length} window{slots.length === 1 ? "" : "s"} offered) is managed there too.
                    </p>
                  )}
                </div>
              ) : (
                <EmptyBand
                  title="No interviews yet."
                  body="Rounds your recruiter books appear on the Interviews screen, with the write-up and your decision on the same card — and that is where you offer the times you are free. Nothing moves on a candidate until you have had your say."
                />
              )}
            </section>

            <p className="agd-foot">
              <b>NOTE</b>
              <span style={{ maxWidth: "88ch" }}>
                Candidates are never rejected automatically, here or anywhere in Tailr. Anything
                you do on this page is attributed to you by name and written to your
                recruiter&apos;s audit log.
              </span>
            </p>
          </>
        )}
      </div>
    </main>
  )
}

