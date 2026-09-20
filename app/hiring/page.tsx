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
import { EmptyBand, fmtWhen } from "@/components/agency/hm-shared"
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


/**
 * The four rungs of "how far has this role got", from the client's side.
 *
 * DERIVED, NEVER STORED, and only from facts this payload already carries.
 * A rung that guessed would be worse than no rung: a hiring manager reading
 * "candidates interviewed" when nobody has been would stop chasing.
 *
 * The ladder is deliberately coarser than the recruiter's seven steps,
 * because a client sees none of the shortlisting work — no candidates, no
 * scores, no evidence (the disclosure rules in lib/agency/client-auth.ts).
 * The only honest signals available are: the role exists, somebody was put
 * in front of them, a round actually happened, and the loop ended.
 */
function glanceFor(
  row: ClientTodayRow,
  rounds: HiringRound[]
): Array<{ label: string; done: boolean }> {
  const mine = rounds.filter((r) => r.role_id === row.role.id && r.status !== "cancelled")
  const key = row.subState.key

  // A role only reaches this workspace once the recruiter has opened it, so
  // the brief is behind us the moment there is anything to show at all.
  const briefDone = true
  // They have seen a shortlist once they have acted on one — a round exists
  // only because somebody was chosen from it.
  const shortlistDone = mine.length > 0
  const interviewed = mine.some((r) => r.status === "completed")
  const ended = ["take-to-close-out", "pack-generated", "handed-over", "closed", "loop-ended"].includes(key)

  return [
    { label: "Brief agreed & clarified", done: briefDone },
    { label: "Shortlist reviewed", done: shortlistDone },
    { label: "Candidates interviewed", done: interviewed },
    { label: "Hire selected", done: ended },
  ]
}

/** One row of what needs the client, from /api/hiring/today — the same ladder
 * as their role header, so the two never disagree. */
interface ClientTodayRow {
  role: { id: string; ref: string; title: string; company: string; recruiterName: string | null }
  subState: { key: string; chip: string }
  next: NextAction
}

/** "Mon 21 Sep, 09:00", or a plain dash when a round has no time yet. */
function whenLabel(iso: string | null): string {
  if (!iso) return "No time set"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "No time set"
  return d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

/**
 * How live a wait is. Lower sorts first.
 *
 * Only states that mean something is genuinely in motion earn a place above
 * the rest: a round in the room now, then one that has happened and is owed a
 * write-up, then one booked, then a candidate still choosing a time.
 * Everything else keeps its old behaviour and sorts by age.
 *
 * This ranks the WAITS only. Anything the hiring manager can act on has
 * already won before it runs — `acts[0]` is consulted first, and that rule
 * does not change: an action is a job, a wait is information.
 */
function liveRank(key: string): number {
  switch (key) {
    case "happening-now": return 0
    case "write-up-due": return 1
    case "decision-due": return 2
    case "booked": return 3
    case "invited": return 4
    case "round-to-book":
    case "windows-to-offer": return 5
    default: return 9
  }
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

  const firstName = (links[0]?.fullName ?? "").trim().split(/\s+/)[0] ?? ""
  const roleCount = today?.length ?? 0

  /**
   * How live a wait is. Lower sorts first.
   *
   * Only the states that mean something is genuinely in motion earn a place
   * above the rest: a round in the room now, then one that has happened and
   * is owed a write-up, then one booked, then a candidate still choosing a
   * time. Everything else keeps its old behaviour and sorts by age.
   *
   * It ranks the WAITS. Anything the hiring manager can act on has already
   * won before this runs — `acts[0]` is consulted first and that rule does
   * not change.
   */
  const acts = (today ?? []).filter((r) => r.next.mode === "act")
  /**
   * The one thing, and everything else.
   *
   * Something the hiring manager can DO always outranks something they are
   * waiting on — a wait is information, an action is a job. When nothing is
   * theirs, `first` is the wait worth naming (the oldest one, since that is
   * the one they are most likely wondering about) rather than nothing at all.
   */
  const first =
    acts[0] ??
    (today ?? [])
      .filter((r) => r.next.mode !== "done")
      .slice()
      .sort((a, b) => {
        // LIVENESS BEFORE AGE (20 Sep 2026).
        //
        // This was `oldest wait first`, and it put the wrong role at the top
        // of the screen: a role nobody had touched for a fortnight ("your
        // recruiter is building the shortlist") outranked a role with three
        // interviews booked for the next morning, and because the glance
        // ladder below renders only `first`, the live role's phase was never
        // shown at all. The hiring manager's own words: "my tasks isn't
        // reflecting the right phase of where the role is at."
        //
        // Age is still the tiebreak; it is simply no longer the first test.
        const byLive = liveRank(a.next.key) - liveRank(b.next.key)
        if (byLive !== 0) return byLive
        return (a.next.since ?? "").localeCompare(b.next.since ?? "")
      })[0] ??
    null
  /**
   * The headline role's own rounds, so the card can name people and rounds
   * rather than only the role. Live first, then soonest.
   *
   * `live` is computed here from the same two facts the ladders use — it has
   * started and has not ended — so this cannot drift from what the rest of
   * the product says about the same round.
   */
  const firstRounds = useMemo(() => {
    if (!first) return []
    const nowMs = Date.parse(todayNow)
    return (data?.rounds ?? [])
      .filter((r) => r.role_id === first.role.id && r.status === "scheduled" && r.scheduled_at)
      .map((r) => {
        const startsMs = Date.parse(r.scheduled_at as string)
        const endsMs = startsMs + (r.duration_minutes || 0) * 60_000
        return { ...r, live: startsMs <= nowMs && nowMs < endsMs }
      })
      .sort((a, b) => {
        if (a.live !== b.live) return a.live ? -1 : 1
        return Date.parse(a.scheduled_at as string) - Date.parse(b.scheduled_at as string)
      })
      .slice(0, 4)
  }, [first, data, todayNow])

  const rest = acts.filter((r) => r !== first)
  /**
   * Every other role that is still live, actionable or not.
   *
   * `rest` is the hiring manager's own to-do list and keeps its copy. This is
   * the quieter half: roles where somebody else holds the next move. They
   * used to disappear from this screen entirely whenever nothing on them was
   * actionable, which is how a role could be invisible here while sitting in
   * the middle of its interview loop.
   */
  const others = (today ?? []).filter(
    (r) => r !== first && r.next.mode !== "done" && !acts.includes(r)
  )

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
            {/* A greeting, not a status bar. The hiring manager is not a
                user of this product — they are a busy person with a role open
                and a recruiter doing the work — so the screen opens by
                addressing them, and the one card below answers the only
                question they came with. */}
            <section className="hm-greet">
              <p className="hm-greet-eyebrow">
                Hiring manager{company ? ` · ${company}` : ""}
              </p>
              <h1 className="hm-greet-h1">{firstName ? `Hello, ${firstName}.` : "Hello."}</h1>
              <p className="hm-greet-sub">
                {roleCount === 0 ? (
                  <>
                    You are connected to <b>{agencyName}</b>. When they send a shortlist, book an
                    interview or need a decision from you, it lands here first — and you will get
                    an email as well.
                  </>
                ) : (
                  <>
                    {roleCount === 1 ? "One role is" : `${roleCount} roles are`} active with{" "}
                    <b>{agencyName}</b>. Here is what needs you — and only you.
                  </>
                )}
              </p>
            </section>

            {/* THE ONE THING.
             *
             * The whole screen exists to answer "is anything mine?", so it is
             * answered once, in words, at the top. When the answer is no the
             * card says who holds it and since when and offers NOTHING to
             * press — a control that cannot help is worse than no control,
             * and the old row was still a link, so a hiring manager clicked
             * through to find there was nothing there.
             *
             * `today === null` is the load, and it must never be allowed to
             * render as the calm state: "nothing needs you" over a failed
             * read is the same lie as 200 {enabled:false}. */}
            <section className="hm-one" aria-labelledby="hm-one-h" aria-live="polite">
              {today === null ? (
                <div className="hm-one-card" data-mode="load">
                  <p className="hm-one-eyebrow">Working it out</p>
                  <h2 className="hm-one-title" id="hm-one-h">Checking what needs you…</h2>
                </div>
              ) : first ? (
                <div className="hm-one-card" data-mode={first.next.mode}>
                  <p className="hm-one-eyebrow">
                    {first.next.mode === "act"
                      ? "Needs your decision"
                      : first.next.mode === "done"
                        ? "Nothing outstanding"
                        : `Waiting on ${first.next.waitingOn.label.toLowerCase()}`}
                  </p>
                  {/*
                    THE WAIT IS TITLED AFTER THE PERSON (19 Sep 2026, frame 15).
                    When the next act is somebody else's, `next.title` names
                    THEIR task — which read as an instruction to the hiring
                    manager. Naming who holds it answers the question they
                    actually came with, and the task drops to the detail line.
                  */}
                  <h2 className="hm-one-title" id="hm-one-h">
                    {first.next.mode === "wait" && first.role.recruiterName
                      ? `Waiting on ${first.role.recruiterName}`
                      : first.next.title}
                  </h2>
                  {first.next.mode === "wait" && first.role.recruiterName && (
                    <p className="hm-one-detail">{first.next.title}.</p>
                  )}
                  {first.next.detail && <p className="hm-one-detail">{first.next.detail}</p>}
                  <p className="hm-one-meta">
                    Role · {first.role.title} · {first.role.ref}
                    {first.next.since ? ` · ${first.next.waitingOn.label.toLowerCase()} since ${ageLabel(first.next.since, todayNow)}` : ""}
                  </p>
                  {/*
                    WHO, AND WHICH ROUND (20 Sep 2026, frame 20).
                    "If an interview is happening the hiring manager should be
                    able to clearly see in the interview for who and what
                    round." The headline names the role; these name the people
                    and the rounds inside it. Rows only, no controls — a wait
                    carries no button, and one of these being in progress does
                    not make it something to press.
                  */}
                  {firstRounds.length > 0 && (
                    <ul className="hm-one-rounds">
                      {firstRounds.map((r) => (
                        <li key={r.id} className="hm-one-round" data-live={r.live || undefined}>
                          <span className="hm-one-round-who">
                            {r.candidate_ref} · Round {r.round_number}
                          </span>
                          <span className="hm-one-round-when">
                            {r.live ? "Happening now" : whenLabel(r.scheduled_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* The button exists only when the doing is yours. */}
                  {first.next.mode === "act" && first.next.cta && (
                    <Link className="hm-one-cta" href={first.next.cta.href}>
                      {first.next.cta.label} →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="hm-one-card" data-mode="wait">
                  <p className="hm-one-eyebrow">Nothing needs you</p>
                  <h2 className="hm-one-title" id="hm-one-h">You are all caught up.</h2>
                  <p className="hm-one-detail">
                    Shortlists to decide on, rounds to write up and decisions your recruiter is
                    waiting on all appear here first, and you will get an email as well.
                  </p>
                </div>
              )}

              {/* Anything else that is also yours, kept quiet beneath the one
                  thing rather than competing with it. */}
              {rest.length > 0 && (
                <div className="hm-one-rest">
                  <p className="hm-one-rest-label">
                    {rest.length === 1 ? "One other thing needs you" : `${rest.length} other things need you`}
                  </p>
                  {rest.map((r) => (
                    <Link
                      key={r.role.id}
                      className="hm-one-rest-row"
                      href={r.next.cta?.href ?? `/hiring/roles/${r.role.id}`}
                    >
                      <span className="hm-one-rest-title">{r.next.title}</span>
                      <span className="hm-one-rest-meta">
                        {r.role.title} · {r.role.ref}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {others.length > 0 && (
                <div className="hm-one-rest" data-quiet="true">
                  <p className="hm-one-rest-label">
                    {others.length === 1 ? "One other role is open" : `${others.length} other roles are open`}
                  </p>
                  {others.map((r) => (
                    <Link key={r.role.id} className="hm-one-rest-row" href={`/hiring/roles/${r.role.id}`}>
                      <span className="hm-one-rest-title">{r.next.title}</span>
                      <span className="hm-one-rest-meta">
                        {r.role.title} · {r.role.ref}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/*
              THIS ROLE AT A GLANCE (19 Sep 2026, frame 15).
              Four rungs, every one derived from facts this payload already
              carries — no new state, and nothing here is a stage the product
              does not otherwise know about. It answers "how far along is
              this" without the hiring manager opening the role, and says
              plainly that what they can see is bounded by disclosure, which
              is the §5.4 rule told to the person it protects.
            */}
            {first && (
              <section className="agd-band" aria-labelledby="hm-glance">
                <div className="agd-eyebrow-row">
                  <h2 className="agd-eyebrow" id="hm-glance">This role at a glance</h2>
                  <span className="agd-rule" />
                  <Link className="agd-tbtn" href={`/hiring/roles/${first.role.id}`}>
                    Open {first.role.ref} →
                  </Link>
                </div>
                <div className="ag-card">
                  <div className="ag-card-body">
                    <ul className="hm-glance">
                      {glanceFor(first, data?.rounds ?? []).map((step) => (
                        <li key={step.label} className="hm-glance-row" data-done={step.done || undefined}>
                          <span className="hm-glance-dot" aria-hidden="true" />
                          <span className="hm-glance-label">{step.label}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="ag-note" style={{ marginTop: 14 }}>
                      Current phase: <b>{first.subState.chip.toLowerCase()}</b>. You only ever see
                      what has been disclosed to you.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/*
              THE ROLES LIST MOVED TO ITS OWN PLACE (19 Sep 2026, frame 15).
              Tasks answers "what needs me now"; My roles answers "what am I
              on". Rendering both here is what made this screen a corridor
              with the furniture of four rooms in it, and it is the same
              duplication the interviews list had. One signpost, no second
              list.
            */}
            <section className="agd-band" aria-labelledby="hm-roles">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-roles">Your roles</h2>
                <span className="agd-rule" />
                <Link className="agd-tbtn primary" href="/hiring/roles">
                  Open my roles →
                </Link>
              </div>
              {roles.length > 0 ? (
                <p className="agd-aside">
                  {roles.length === 1 ? "One role is" : `${roles.length} roles are`} open with{" "}
                  {agencyName}, each with where it has got to.
                </p>
              ) : (
                <EmptyBand
                  title="No roles yet."
                  body="Every role your recruiter opens for you gets a row in My roles, with the rail showing how far it has got."
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
              {/*
                A SIGNPOST, NOT A SECOND LIST (18 Sep 2026, Ose: "remove any
                duplication").

                This band used to render up to four round rows — the same
                rounds, with the same pills, that /hiring/interviews renders
                in full. Two screens listing one dataset means two places to
                keep right and two places to read before you trust either.
                The Interviews screen owns the rounds; the dashboard owns the
                one thing that needs you now. So this says how much is over
                there and opens the door, and nothing else.
              */}
              {actionable.length > 0 ? (
                <p className="agd-aside">
                  {actionable.length === 1 ? "One round is" : `${actionable.length} rounds are`} live on the
                  Interviews screen, with the write-up and your decision on the same card
                  {slots.length > 0
                    ? `, and the ${slots.length} window${slots.length === 1 ? "" : "s"} you have offered`
                    : ""}
                  .
                </p>
              ) : (
                <EmptyBand
                  title="No interviews yet."
                  body="Rounds appear on the Interviews screen, with the write-up and your decision on the same card — and that screen also lists every role waiting on you, across all of them. Nothing moves on a candidate until you have had your say."
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

