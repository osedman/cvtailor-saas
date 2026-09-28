/**
 * Where each person in the interview cohort stands.
 *
 * Pure and server-import-free, because both boards render it — the client's
 * and the recruiter's — and they must never disagree about what "awaiting"
 * means. Same rule, and same reason, as phases.ts and interview-rules.ts.
 *
 * DERIVED FROM THE ROUND, NEVER STORED. There is no status column to write
 * and nothing to drift: a round with no slot is awaiting a choice, a round
 * with one is booked, a decline is "no suitable time", and a round that has
 * happened is complete until its write-up exists.
 *
 * Ose's spec lists Selected → Invitation sent → Booked → Confirmed →
 * Interview complete → Feedback due. Two of those do not exist here, and
 * saying so is better than faking them:
 *
 * - "Selected" is a decision on the shortlist, before any round exists, so
 *   it belongs to the shortlist board rather than this one.
 * - "Booked" and "Confirmed" are the same event in a self-booking model: the
 *   candidate choosing the time IS the confirmation. Showing both would be
 *   two names for one fact.
 */

export type CohortStatus =
  | "awaiting"
  | "booked"
  /**
   * Started, and not yet ended. New on 20 Sep 2026.
   *
   * Until now a round was booked or it was past, with nothing in between, so
   * at 09:01 the board still said "Booked · 09:00" and the one question a
   * hiring manager actually has — who is in the room right now, and which
   * round is it — had no answer anywhere in the product.
   *
   * This is the only state that needs the round's END as well as its start.
   * Everything else keys off the start alone.
   */
  | "happening_now"
  | "complete"
  | "feedback_due"
  | "no_suitable_time"
  | "cancelled"

export interface CohortRoundFacts {
  status: "scheduled" | "completed" | "cancelled"
  candidateResponse: "pending" | "confirmed" | "declined" | null
  scheduledAt: string | null
  /**
   * scheduled_at + duration. Null when unknown, and then a started round goes
   * straight to feedback_due exactly as it did before — an absent end time
   * must never strand a round in "happening now" for ever.
   */
  endsAt?: string | null
  hasDebrief: boolean
  /** When the invitation went out — what "no response" is measured from. */
  createdAt: string
}

/** How long an unanswered invitation waits before it is worth a nudge. */
export const CHASE_AFTER_HOURS = 72

export function cohortStatus(r: CohortRoundFacts, now: Date = new Date()): CohortStatus {
  if (r.candidateResponse === "declined") return "no_suitable_time"
  if (r.status === "cancelled") return "cancelled"
  if (r.status === "completed") return r.hasDebrief ? "complete" : "feedback_due"
  if (!r.scheduledAt) return "awaiting"
  // A booked round whose time has passed reads as complete even before
  // anyone marks it so, because pretending it is still upcoming is worse.
  if (Date.parse(r.scheduledAt) >= now.getTime()) return "booked"
  const ends = r.endsAt ? Date.parse(r.endsAt) : NaN
  return Number.isFinite(ends) && now.getTime() < ends ? "happening_now" : "feedback_due"
}

/** True when an unanswered invitation has waited long enough to chase. */
export function needsChasing(r: CohortRoundFacts, now: Date = new Date()): boolean {
  if (cohortStatus(r, now) !== "awaiting") return false
  const sent = Date.parse(r.createdAt)
  return Number.isFinite(sent) && now.getTime() - sent >= CHASE_AFTER_HOURS * 3_600_000
}

export const STATUS_LABEL: Record<CohortStatus, string> = {
  awaiting: "Awaiting booking",
  booked: "Booked",
  happening_now: "Happening now",
  complete: "Interview complete",
  feedback_due: "Write-up due",
  no_suitable_time: "No suitable time",
  cancelled: "Cancelled",
}

/** Which of the three tones a status carries. Never a judgement of a person. */
export const STATUS_TONE: Record<CohortStatus, "open" | "good" | "attention"> = {
  awaiting: "open",
  booked: "good",
  happening_now: "attention",
  complete: "good",
  feedback_due: "attention",
  no_suitable_time: "attention",
  cancelled: "open",
}

/** The order a board reads best in: what needs someone, then what is settled. */
// A round in progress outranks everything: it is the only one that is true
// for the next forty-five minutes and false afterwards.
const ORDER: CohortStatus[] = ["happening_now", "feedback_due", "no_suitable_time", "awaiting", "booked", "complete", "cancelled"]

export function statusRank(s: CohortStatus): number {
  const i = ORDER.indexOf(s)
  return i === -1 ? ORDER.length : i
}

/** One line summarising the whole cohort. */
export function cohortSummary(statuses: CohortStatus[]): string {
  if (statuses.length === 0) return "Nobody has been invited yet."
  const n = (s: CohortStatus) => statuses.filter((x) => x === s).length
  const live = n("happening_now")
  const booked = n("booked") + n("complete") + n("feedback_due") + live
  const awaiting = n("awaiting")
  const stuck = n("no_suitable_time")
  const parts = [
    live > 0 && `${live} happening now`,
    booked > 0 && `${booked} booked`,
    awaiting > 0 && `${awaiting} still to book`,
    stuck > 0 && `${stuck} found no suitable time`,
  ].filter(Boolean) as string[]
  return parts.length ? `${parts.join(" · ")}.` : "Nothing outstanding."
}

/* ── THE LOOP RAIL (15 September 2026) ──────────────────────────────────────
 *
 * Ose, walking staging: "I'm sending out the interview invites and I don't
 * know where I am in the process." The setup is numbered 1 and 2; the moment
 * you press invite the numbering stops and the screen becomes a list of names
 * with no shape.
 *
 * WHY THIS IS NOT A STEPPER. The obvious answer — "Step 2 of 4" — is wrong
 * here, and wrong in a way that would look right. A cohort is not at a stage:
 * four people can sit on four different rungs at once, and a single marker
 * would have to pick one of them and lie about the rest. So the rail carries
 * a DISTRIBUTION, and the question "which part is mine?" is answered
 * separately, by nextAction, because it is a different question.
 *
 * CUMULATIVE, because that is already this file's convention: cohortSummary
 * counts booked as booked + feedback_due + complete — "has reached this
 * point", not "is sitting exactly here". A rail that counted only the current
 * status would show BOOKED falling to zero as people progress, which reads as
 * things going backwards.
 *
 * FIVE RUNGS, NOT SIX. The frame proposed CHOSEN and INVITED as separate
 * rungs. In this product choosing IS inviting — the action bar says "Invite N
 * to interview" — so rendering both would be two names for one fact, the
 * exact trap this file's own docstring calls out for Booked/Confirmed. The
 * sixth and seventh states are not progress at all: "no suitable time" and
 * "cancelled" are exits, and a progress rail with CANCELLED sitting on the
 * end of it is the opposite of intuitive. They are counted separately.
 */

export type LoopRungKey = "invited" | "booked" | "met" | "written_up" | "decided"

export interface LoopRung {
  key: LoopRungKey
  label: string
  /** How many people have reached this point. */
  n: number
  /** Said in words, because a row of numbers means nothing read aloud. */
  said: string
}

export interface LoopMemberFacts {
  status: CohortStatus
  decided: boolean
}

export interface LoopProgress {
  rungs: LoopRung[]
  /** Everyone counted — the denominator every rung is out of. */
  total: number
  /** Not progress: the ways out of the loop, counted only when they happen. */
  noSuitableTime: number
  cancelled: number
  /** One sentence for a screen reader, which cannot read a row of numbers. */
  summary: string
}

const RUNG_LABELS: Record<LoopRungKey, string> = {
  invited: "Invited",
  booked: "Booked",
  met: "Met",
  written_up: "Written up",
  decided: "Decided",
}

/**
 * Where the cohort stands, as counts along the loop.
 *
 * Exits are excluded from the progress rungs on purpose: somebody who could
 * find no suitable time did not get less far, they left, and folding them
 * into "invited" would quietly inflate every number after it.
 */
export function loopProgress(members: LoopMemberFacts[]): LoopProgress {
  const live = members.filter((m) => m.status !== "cancelled" && m.status !== "no_suitable_time")
  const has = (...s: CohortStatus[]) => live.filter((m) => s.includes(m.status)).length

  const counts: Record<LoopRungKey, number> = {
    invited: live.length,
    booked: has("booked", "feedback_due", "complete"),
    met: has("feedback_due", "complete"),
    written_up: has("complete"),
    decided: live.filter((m) => m.decided).length,
  }

  const rungs = (Object.keys(RUNG_LABELS) as LoopRungKey[]).map((key) => ({
    key,
    label: RUNG_LABELS[key],
    n: counts[key],
    said: `${counts[key]} of ${live.length} ${RUNG_LABELS[key].toLowerCase()}`,
  }))

  const noSuitableTime = members.filter((m) => m.status === "no_suitable_time").length
  const cancelled = members.filter((m) => m.status === "cancelled").length

  const summary =
    members.length === 0
      ? "Nobody has been invited yet."
      : [
          rungs.map((r) => r.said).join(", "),
          noSuitableTime > 0 && `${noSuitableTime} found no suitable time`,
          cancelled > 0 && `${cancelled} cancelled`,
        ]
          .filter(Boolean)
          .join(". ") + "."

  return { rungs, total: live.length, noSuitableTime, cancelled, summary }
}
