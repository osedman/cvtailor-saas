"use client"

/**
 * The hiring manager's Interviews screen — the selection process, on their
 * side of the wall.
 *
 * Split out of the dashboard on 23 Aug 2026: write-ups, decisions and the
 * diary were all being performed inside one long page, which made the
 * interview phase feel like furniture rather than a place. This screen owns
 * three things and nothing else:
 *
 *   1. What you owe — rounds that happened and need your write-up or decision.
 *   2. What is coming — booked rounds, in order.
 *   3. Your diary — the windows you have offered, and offering more.
 *
 * Grouped by role, with each candidate's rounds as lanes (R1 → R2 → outcome),
 * so the transition between rounds is visible instead of implied. Same data,
 * same rules as everywhere else on this side: /api/hiring/* only, refs never
 * names, decisions are signals about rounds and remove nobody.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { SignOut } from "@/components/agency/sign-out"
import {
  EmptyBand,
  RoundActions,
  RoundProgress,
  SlotChip,
} from "@/components/agency/hm-shared"
import type { HiringDashboard, HiringRound } from "@/lib/agency/types"
import type { NextAction } from "@/lib/agency/next-action"

type Screen = "loading" | "unauthed" | "not_linked" | "error" | "ready"

/**
 * One next action per role, from /api/hiring/today — the SAME ladder the
 * dashboard and the role header read.
 *
 * WHY THIS SCREEN NEEDED IT (18 Sep 2026, Ose walked the loop). Every band
 * below fills only once somebody has BOOKED. Before the first booking this
 * page had nothing on it, correctly, and no way to say so — four empty bands
 * and a sentence telling you to go back to the role you came from. Meanwhile
 * a role was waiting on this very person to choose who to interview, and the
 * dashboard knew.
 *
 * So the screen gains what it was always missing: the across-roles question.
 * The dashboard answers "what is the one thing now" for a single role; a
 * role's own cohort screen answers "where is this cohort". Nobody answered
 * "what do I owe, anywhere" — which is the only reason to open a nav item
 * called Interviews when you hold six live roles.
 *
 * Nothing is derived here. The route already sorts acts before waits.
 */
interface TodayRow {
  role: { id: string; ref: string; title: string; company: string; recruiterName: string | null }
  subState: { key: string; chip: string }
  next: NextAction
}

/**
 * Has this round started / ended, by the clock.
 *
 * The same two facts cohortStatus and loopState use, so this screen cannot
 * drift from the role header and the recruiter's board. A round with no time
 * on it is an invitation, not an interview — it has neither started nor
 * ended. A missing duration means the end is unknowable, and an unknowable
 * end counts as ended rather than stranding somebody mid-interview for ever.
 */
function hasStarted(r: { scheduled_at: string | null }, nowMs: number): boolean {
  if (!r.scheduled_at) return false
  const t = Date.parse(r.scheduled_at)
  return Number.isFinite(t) && t <= nowMs
}

function hasEnded(r: { scheduled_at: string | null; duration_minutes?: number }, nowMs: number): boolean {
  if (!hasStarted(r, nowMs)) return false
  const t = Date.parse(r.scheduled_at as string)
  const mins = Number(r.duration_minutes)
  if (!Number.isFinite(mins) || mins <= 0) return true
  return nowMs >= t + mins * 60_000
}

export default function HiringInterviewsPage() {
  const [screen, setScreen] = useState<Screen>("loading")
  const [data, setData] = useState<HiringDashboard | null>(null)
  const [today, setToday] = useState<TodayRow[] | null>(null)
  const [refresh, setRefresh] = useState(0)
  const reload = () => setRefresh((n) => n + 1)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch("/api/hiring/dashboard")
        if (!live) return
        if (res.status === 401) return setScreen("unauthed")
        if (res.status === 403) return setScreen("not_linked")
        if (!res.ok) return setScreen("error")
        const body = (await res.json()) as { dashboard?: HiringDashboard }
        if (!body.dashboard) return setScreen("error")
        setData(body.dashboard)
        setScreen("ready")

        /* The ladder is fetched SECOND and never gates the screen. If it
           fails, the three reporting bands below are still correct and still
           render; the across-roles band simply does not appear. A failed load
           must not read as an empty one, and it must not take the page with
           it either. */
        try {
          const t = await fetch("/api/hiring/today")
          if (!live || !t.ok) return
          const tb = (await t.json()) as { roles?: TodayRow[] }
          setToday(Array.isArray(tb.roles) ? tb.roles : [])
        } catch {
          /* leave it null — the band stays away */
        }
      } catch {
        if (live) setScreen("error")
      }
    })()
    return () => {
      live = false
    }
  }, [refresh])

  const rounds = useMemo(() => (data?.rounds ?? []).filter((r) => r.status !== "cancelled"), [data])

  /**
   * A ticking clock, because this screen's states expire on their own.
   *
   * "Happening now" is true for forty-five minutes and then it is not, and a
   * write-up falls due at a moment nobody clicks. Without this, a hiring
   * manager sitting on the page as an interview ends would go on being told
   * nothing is owed until they thought to reload.
   *
   * Thirty seconds is chosen against what it drives: the coarsest thing here
   * is a minute-level label, so anything finer is work for no visible gain.
   */
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  /** Rounds grouped by role, candidates grouped inside — the loop as a shape,
   * not a flat list. */
  const byRole = useMemo(() => {
    const roles = new Map<string, { title: string; byCandidate: Map<string, HiringRound[]> }>()
    for (const r of rounds) {
      const role = roles.get(r.role_id) ?? { title: r.role_title || "Untitled role", byCandidate: new Map() }
      const list = role.byCandidate.get(r.candidate_ref) ?? []
      list.push(r)
      role.byCandidate.set(r.candidate_ref, list)
      roles.set(r.role_id, role)
    }
    return roles
  }, [rounds])

  /**
   * What this hiring manager actually owes.
   *
   * This used to be `status === "completed"`, which only becomes true when the
   * RECRUITER presses "Mark done" on their own screen. So an interview that
   * finished an hour ago sat under "Coming up" saying nothing was owed, and
   * the person who was in the room could not record what happened until
   * somebody who was not in it clicked a button. Found 20 Sep 2026 with a
   * round that had ended 82 minutes earlier.
   *
   * A round is owed when it has ENDED and has no write-up — the clock, not a
   * click. Once written up it is owed as a DECISION instead, which is the
   * second half of the same job.
   *
   * The clock decides what the screen offers; it never decides what the
   * record says. Completing the round is still a human act — see
   * recordDebrief, where the write-up itself does it.
   */
  const owed = useMemo(
    () =>
      rounds.filter((r) => {
        if (r.status === "cancelled") return false
        if (r.latest_decision) return false
        if (r.status === "completed") return true
        return hasEnded(r, nowMs)
      }),
    [rounds, nowMs]
  )
  // A round with no time on it is an INVITATION, not an interview: the
  // candidate has been asked and has not picked yet. Counting those as
  // "coming up" rendered them as "No time set · Scheduled" and told the
  // client they had interviews they did not have (found 11 Sep 2026).
  const upcoming = useMemo(
    () =>
      rounds
        // Coming up means NOT YET STARTED. A round that has begun or ended is
        // not something ahead of you, and counting it as one is how this
        // screen came to announce "3 interviews coming up" over one that had
        // finished and one that was in progress.
        .filter((r) => r.status === "scheduled" && r.scheduled_at && !hasStarted(r, nowMs))
        .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")),
    [rounds, nowMs]
  )
  /** Started, not yet ended — the same rule the ladders use. */
  const inProgress = useMemo(
    () => rounds.filter((r) => r.status === "scheduled" && hasStarted(r, nowMs) && !hasEnded(r, nowMs)),
    [rounds, nowMs]
  )
  const stillChoosing = useMemo(
    () => rounds.filter((r) => r.status === "scheduled" && !r.scheduled_at).length,
    [rounds]
  )
  const decided = useMemo(() => rounds.filter((r) => r.latest_decision), [rounds])

  /* Split, not filtered: a role where nothing is yours is still worth a line,
     because "nothing for you" is the answer to the question this screen is
     being asked. Showing only the acts would leave a person who owes nothing
     staring at an empty band again — the exact fault this fixes. */
  const yours = useMemo(() => (today ?? []).filter((r) => r.next.mode === "act"), [today])
  const theirs = useMemo(() => (today ?? []).filter((r) => r.next.mode !== "act"), [today])

  const links = data?.links ?? []
  const slots = data?.slots ?? []

  return (
    <main className="ag-main agd-main hm-main">
      <div className="agd-topbar">
        <div className="ag-brand-mark" aria-hidden="true">
          T
        </div>
        <span className="agd-crumb">
          <Link href="/hiring" style={{ color: "inherit", textDecoration: "none" }}>
            Hiring
          </Link>{" "}
          / Interviews
        </span>
        <span className="agd-spacer" />
        {screen === "ready" && (
          <>
            <span className="ag-pill hm-role-chip">Hiring manager</span>
            <SignOut door="consumer" />
          </>
        )}
      </div>

      <div className="agd-page" aria-busy={screen === "loading"}>
        {screen === "loading" && (
          <div className="ag-card">
            <div className="ag-card-body" style={{ textAlign: "center", padding: 48 }}>
              <span className="ag-spin" />
            </div>
          </div>
        )}
        {screen === "unauthed" && (
          <EmptyBand
            title="Sign in to see your interviews."
            body="Your email address and a link we send you — no password. Sign in from the dashboard."
          />
        )}
        {screen === "not_linked" && (
          <EmptyBand
            title="This account has no client access yet."
            body="Hiring-manager access is given by invitation only — ask your recruiter for one."
          />
        )}
        {screen === "error" && (
          <EmptyBand
            title="We could not load your interviews."
            body="Reload the page. If it keeps failing, tell your recruiter — nothing you have done is lost."
          />
        )}

        {screen === "ready" && data && (
          <>
            <section className="agd-hero">
              <h1 className="agd-h1">
                {/* A round in the room outranks everything, because it is
                    the only line here that stops being true on its own. */}
                {inProgress.length > 0
                  ? inProgress.length === 1
                    ? `${inProgress[0].candidate_ref}'s round ${inProgress[0].round_number} is happening now.`
                    : `${inProgress.length} interviews are happening now.`
                  : owed.length > 0
                  ? `${owed.length} round${owed.length === 1 ? "" : "s"} need${owed.length === 1 ? "s" : ""} your say.`
                  : upcoming.length > 0
                    ? `${upcoming.length} interview${upcoming.length === 1 ? "" : "s"} coming up.`
                    : stillChoosing > 0
                      ? `${stillChoosing} candidate${stillChoosing === 1 ? " is" : "s are"} choosing a time.`
                      : /* Nothing owed is not the same as nothing happening.
                           Before the first booking every band below is empty
                           by construction, and the honest headline is what
                           IS waiting — which sits earlier in the loop, on
                           another screen. Saying "nothing is waiting on you"
                           over a role that was waiting on you is how this
                           screen read as broken. */
                        yours.length > 0
                        ? `Nothing owed yet. ${yours.length === 1 ? "One role is" : `${yours.length} roles are`} waiting on you.`
                        : "Nothing is waiting on you."}
              </h1>
              <p className="agd-sub">
                Meet the person, write up what happened, then advance or not. The write-up comes
                first — your decision should rest on a record, not a memory. Declining never
                removes anyone; it is your signal on the round.
              </p>
            </section>

            {/* ── 0. Waiting on you, across every role ─────────────────────
                 Added 18 Sep 2026. Reads /api/hiring/today, which already
                 answers this per role and already sorts acts first — no
                 second ladder, no new endpoint, no derived state. The rows
                 carry exactly one control each, and only where there is
                 genuinely something to press. */}
            {today !== null && today.length > 0 && (
              <section className="agd-band hm-across" aria-labelledby="hm-across">
                <div className="agd-eyebrow-row">
                  <h2 className="agd-eyebrow" id="hm-across">
                    Waiting on you · across every role
                  </h2>
                  <span className="agd-rule" />
                  <span className="agd-aside">
                    {yours.length === 0
                      ? "nothing outstanding"
                      : `${yours.length} of ${today.length}`}
                  </span>
                </div>
                <div className="ag-stack" style={{ gap: 10 }}>
                  {[...yours, ...theirs].map((r) => (
                    <article key={r.role.id} className="agd-card hm-static hm-across-row">
                      <span className="hm-across-who">
                        <span className="agd-eyebrow">{r.role.title}</span>
                        <span className="ag-meta">
                          {r.role.ref}
                          {r.role.company ? ` · ${r.role.company}` : ""}
                        </span>
                      </span>
                      <span className="hm-across-what" data-mode={r.next.mode}>
                        {r.next.title}
                      </span>
                      {/* NO BUTTON WHEN IT IS NOT YOURS. A wait carries the
                          party it is waiting on and no control — the same
                          rule the recruiter's loop table keeps, and the
                          reason there is no "Nudge" anywhere in this
                          product. */}
                      {r.next.mode === "act" && r.next.cta ? (
                        <Link className="agd-tbtn primary" href={r.next.cta.href}>
                          {r.next.cta.label} →
                        </Link>
                      ) : (
                        <span className="ag-meta hm-across-wait">
                          {r.next.mode === "done" ? "nothing outstanding" : r.next.waitingOn.label}
                        </span>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* ── 1. What you owe ─────────────────────────────────────────── */}
            <section className="agd-band" aria-labelledby="hm-owed">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-owed">
                  Needs your write-up or decision
                </h2>
                <span className="agd-rule" />
              </div>
              {/* PIECE 4 (20 Sep 2026): information, not a wall.
                  A round that has ended but which nobody has marked done is
                  offered for write-up anyway — the write-up completes it. The
                  line exists so the hiring manager knows the recruiter has
                  not confirmed it took place, without that being a condition
                  of doing their own part. If it did not happen, they simply
                  do not write it up and tell their recruiter. */}
              {owed.some((r) => r.status === "scheduled") && (
                <p className="hm-unconfirmed">
                  Your recruiter has not confirmed {owed.filter((r) => r.status === "scheduled").length === 1 ? "this one" : "these"} took
                  place yet. Write it up if it did — that confirms it.
                </p>
              )}
              {owed.length > 0 ? (
                <div className="ag-stack" style={{ gap: 12 }}>
                  {owed.map((r) => (
                    <RoundActions key={r.id} round={r} onDone={reload} />
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="Nothing owed."
                  body="When a round happens, its card opens here for your write-up and decision. Nothing moves on a candidate until you have had your say."
                />
              )}
            </section>

            {/* ── 2. The loop, role by role ───────────────────────────────── */}
            <section className="agd-band" aria-labelledby="hm-loop">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-loop">
                  The loop, role by role
                </h2>
                <span className="agd-rule" />
                <span className="agd-aside">round 1 → round 2 → outcome</span>
              </div>
              {byRole.size > 0 ? (
                <div className="ag-stack" style={{ gap: 12 }}>
                  {[...byRole.entries()].map(([roleId, role]) => (
                    <article key={roleId} className="agd-card hm-static" style={{ display: "block" }}>
                      <p className="agd-eyebrow" style={{ marginBottom: 10 }}>
                        <Link href={`/hiring/roles/${roleId}`} style={{ color: "inherit" }}>
                          {role.title} →
                        </Link>
                      </p>
                      <div className="ag-stack" style={{ gap: 8 }}>
                        {[...role.byCandidate.entries()].map(([ref, list]) => (
                          <div key={ref} className="hm-loop-row">
                            <span className="ag-meta" style={{ minWidth: 64 }}>{ref}</span>
                            <RoundProgress rounds={list} planned={list[0]?.planned_rounds ?? 2} />
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="No rounds yet."
                  body="Once the candidates book a candidate into one of your windows, the loop appears here — each candidate's rounds in order, with where it got to."
                />
              )}
            </section>

            {/* ── 3. Coming up, then your diary ───────────────────────────── */}
            <section className="agd-band" aria-labelledby="hm-upcoming">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-upcoming">
                  Coming up
                </h2>
                <span className="agd-rule" />
              </div>
              {upcoming.length > 0 ? (
                <div className="ag-stack" style={{ gap: 12 }}>
                  {upcoming.map((r) => (
                    <RoundActions key={r.id} round={r} onDone={reload} />
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title={stillChoosing > 0 ? "Nobody has picked a time yet." : "Nothing booked."}
                  body={
                    stillChoosing > 0
                      ? `${stillChoosing} candidate${stillChoosing === 1 ? " has" : "s have"} been invited and ${stillChoosing === 1 ? "is" : "are"} choosing from your windows. Interviews appear here the moment they do.`
                      : "Open a role and use Set up interviews — candidates pick their own time from the windows you offer, and the interviews appear here."
                  }
                />
              )}
            </section>

            <section className="agd-band" aria-labelledby="hm-avail">
              <div className="agd-eyebrow-row">
                <h2 className="agd-eyebrow" id="hm-avail">
                  Your interview windows
                </h2>
                <span className="agd-rule" />
                <span className="agd-aside">offered from a role, so the rules apply</span>
              </div>
              {/*
                OFFERING MOVED TO THE ROLE (11 Sep 2026). Times were typed in
                here by hand and attached to no role, which meant they obeyed
                none of the interview rules — no duration, no notice period,
                no daily cap — and a candidate could be offered a window the
                role would never have proposed. Windows now come from the
                role's own set-up screen, where they are proposed against the
                calendar and checked for capacity. This section still shows
                what is out there, and still lets a window be withdrawn.
              */}
              <p className="agd-aside" style={{ marginBottom: 10 }}>
                To offer more times, open the role and use <b>Set up interviews</b> — the times are
                proposed around your calendar and sized to the people you are seeing.
              </p>
              {slots.length > 0 ? (
                <div className="hm-slots">
                  {slots.map((slot) => (
                    <SlotChip key={slot.id} slot={slot} onWithdraw={reload} />
                  ))}
                </div>
              ) : (
                <EmptyBand
                  title="No times offered."
                  body="Windows you say you are free in appear here as chips, and drop out once the candidates book one. Nothing is ever booked into your calendar without you offering the time first."
                />
              )}
            </section>

            {decided.length > 0 && (
              <p className="agd-foot">
                <b>DECIDED</b>
                <span style={{ maxWidth: "88ch" }}>
                  {decided.length} round{decided.length === 1 ? "" : "s"} carry your decision — each
                  one is on its role&apos;s screen, in words, with the date. Deciding again replaces
                  yours; nothing here removes anyone from the process.
                </span>
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
