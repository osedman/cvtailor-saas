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
  | "complete"
  | "feedback_due"
  | "no_suitable_time"
  | "cancelled"

export interface CohortRoundFacts {
  status: "scheduled" | "completed" | "cancelled"
  candidateResponse: "pending" | "confirmed" | "declined" | null
  scheduledAt: string | null
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
  return Date.parse(r.scheduledAt) < now.getTime() ? "feedback_due" : "booked"
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
  complete: "Interview complete",
  feedback_due: "Write-up due",
  no_suitable_time: "No suitable time",
  cancelled: "Cancelled",
}

/** Which of the three tones a status carries. Never a judgement of a person. */
export const STATUS_TONE: Record<CohortStatus, "open" | "good" | "attention"> = {
  awaiting: "open",
  booked: "good",
  complete: "good",
  feedback_due: "attention",
  no_suitable_time: "attention",
  cancelled: "open",
}

/** The order a board reads best in: what needs someone, then what is settled. */
const ORDER: CohortStatus[] = ["feedback_due", "no_suitable_time", "awaiting", "booked", "complete", "cancelled"]

export function statusRank(s: CohortStatus): number {
  const i = ORDER.indexOf(s)
  return i === -1 ? ORDER.length : i
}

/** One line summarising the whole cohort. */
export function cohortSummary(statuses: CohortStatus[]): string {
  if (statuses.length === 0) return "Nobody has been invited yet."
  const n = (s: CohortStatus) => statuses.filter((x) => x === s).length
  const booked = n("booked") + n("complete") + n("feedback_due")
  const awaiting = n("awaiting")
  const stuck = n("no_suitable_time")
  const parts = [
    booked > 0 && `${booked} booked`,
    awaiting > 0 && `${awaiting} still to book`,
    stuck > 0 && `${stuck} found no suitable time`,
  ].filter(Boolean) as string[]
  return parts.length ? `${parts.join(" · ")}.` : "Nothing outstanding."
}
