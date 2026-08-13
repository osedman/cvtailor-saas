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
import type {
  HiringBrief,
  HiringDashboard,
  HiringLink,
  HiringRound,
  HiringSlot,
} from "@/lib/agency/types"

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

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

function fmtWhen(iso: string): string {
  return `${fmtDate(iso)} · ${fmtTime(iso)}`
}

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

/** The bordered, left-aligned empty state. Says what will appear here and,
 * where it matters, who puts it there — never "no data". */
function EmptyBand({ title, body }: { title: string; body: string }) {
  return (
    <div className="ag-card">
      <div className="ag-card-body">
        <p className="ag-card-title" style={{ margin: 0 }}>
          {title}
        </p>
        <p className="ag-note" style={{ marginTop: 6, maxWidth: "62ch" }}>
          {body}
        </p>
      </div>
    </div>
  )
}

function SlotChip({ slot }: { slot: HiringSlot }) {
  return (
    <span className="ag-chip hm-static">
      {fmtDate(slot.starts_at)}
      <span className="id">
        {fmtTime(slot.starts_at)}–{fmtTime(slot.ends_at)}
      </span>
      {slot.booked && <span className="ag-pill">Booked</span>}
    </span>
  )
}

export default function HiringDashboardPage() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [data, setData] = useState<HiringDashboard | null>(null)
  const [email, setEmail] = useState("")

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

        const body = (await dashRes.json()) as { dashboard?: HiringDashboard }
        if (!body.dashboard) return setScreen("error")
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
  }, [])

  // Fixed at first paint of the ready screen so a card cannot re-sort itself
  // under the reader's cursor while they are looking at it.
  const now = useMemo(() => Date.now(), [])
  const cards = useMemo(() => (data ? buildAttention(data, now) : []), [data, now])
  const roles = useMemo(() => (data ? buildRoles(data, now) : []), [data, now])
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

  const headline =
    cards.length === 0
      ? "Nothing is waiting on you."
      : cards.length === 1
        ? "One thing needs you."
        : `${cards.length} things need you.`

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
          </>
        )}
      </div>

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
                Same login as the rest of Tailr: your email address and a link we send you.
              </p>
              <a
                className="ag-btn ag-btn-primary"
                href="/login?next=%2Fhiring"
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
                {cards.length > 0 && <span className="agd-aside">sorted by what breaks first</span>}
              </div>
              {cards.length > 0 ? (
                <div className="agd-attn">
                  {cards.map((c) => (
                    <article key={c.key} className={`agd-card ${c.sev}`}>
                      <span className="agd-when">{c.when}</span>
                      <h3 className="agd-card-title">{c.title}</h3>
                      <p className="agd-card-body">{c.body}</p>
                      <div className="agd-card-meta">
                        <span>{c.meta}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="Nothing needs you today."
                  body="Interviews about to start, decisions your recruiter is waiting on, and briefs that have come back to you all appear here first — the most urgent on the left."
                />
              )}
            </section>

            <section className="agd-band" aria-labelledby="hm-roles">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-roles">
                  Your roles
                </h2>
                <span className="agd-rule" />
                <button
                  className="agd-tbtn"
                  disabled
                  title="Briefs cannot be written here yet. When the brief form ships, this opens it and your recruiter gets the role the moment you submit. Until then, send the brief to your recruiter the way you do today."
                >
                  Post a brief
                </button>
              </div>
              {roles.length > 0 ? (
                <div className="agd-roles">
                  {roles.map((role) => (
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
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="No roles yet."
                  body="Every role you brief your recruiter on gets a row here, with the rail showing how far it has got: brief, shortlist, first round, second round, decision. Shortlists your recruiter sends will appear here too. Writing a brief on this page is not built yet — send it to your recruiter the way you do today and the row will appear."
                />
              )}
            </section>

            <section className="agd-band" aria-labelledby="hm-avail">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-avail">
                  Your availability
                </h2>
                <span className="agd-rule" />
                <button
                  className="agd-tbtn"
                  disabled
                  title="Offering times is not built yet. When it ships, times you add here become bookable by your recruiter without another email. Until then, send them your availability as usual."
                >
                  Offer times
                </button>
              </div>
              {slots.length > 0 ? (
                <div className="hm-slots">
                  {slots.map((slot) => (
                    <SlotChip key={slot.id} slot={slot} />
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="No times offered."
                  body="Windows you say you are free in will appear here as chips, and drop out again once your recruiter books one against a candidate. Nothing is ever booked into your calendar without you offering the time first. Offering times on this page is not built yet — send your recruiter your availability as usual."
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
