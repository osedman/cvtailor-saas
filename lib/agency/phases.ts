/**
 * The three phases a role passes through.
 *
 * A phase is DERIVED from facts that already exist, never stored. No
 * submission yet is the shortlist workflow; a submission exists and the
 * interview loop is running; a handover pack exists and Tailr's part is
 * ending. That means there is no phase column to write, nothing to drift out
 * of sync with reality, and no migration — the boundary was always implicit
 * in the data, the product just never said it out loud.
 *
 * The seven steps in lib/agency/steps.ts are unchanged and remain the single
 * source of truth for the shortlist workflow. A phase is a coarser thing that
 * sits ABOVE them: phase one contains all seven, and interviews / close-out
 * stay adjuncts rather than becoming an eighth and ninth step.
 *
 * NO SERVER IMPORTS IN THIS FILE. Client components render the rail, and a
 * runtime constant imported from a module that reaches agencyAdmin drags
 * next/headers and the service-role key into the browser bundle and fails the
 * build. Same rule, and same reason, as settings-limits.ts and round-delta.ts.
 */

export type PhaseKey = "shortlist" | "interviews" | "handover"

/** What the product can observe about a role, with no interpretation. */
export interface PhaseFacts {
  /** A client submission has been generated for this role. */
  hasSubmission: boolean
  /** A handover pack has been generated for the chosen candidate. */
  hasHandoverPack: boolean
}

export const PHASES: ReadonlyArray<{
  key: PhaseKey
  /** The rail chip. Short, because it sits on a crowded header. */
  label: string
  /** What closes this phase — the sentence the recruiter needs when the rail
   *  is the only thing telling them where they are. */
  endsWhen: string
}> = [
  {
    key: "shortlist",
    label: "Shortlist",
    endsWhen: "Ends when the submission reaches the client.",
  },
  {
    key: "interviews",
    label: "Interviews",
    endsWhen: "Ends when the client selects the hire.",
  },
  {
    key: "handover",
    label: "Handover",
    endsWhen: "Ends when the pack is delivered and the role is closed.",
  },
]

/**
 * Which phase a role is in.
 *
 * Deliberately ordered most-advanced first: a role with a handover pack is in
 * handover even though it also has a submission, because the furthest fact
 * reached is the one that describes where the work actually is.
 */
export function derivePhase(facts: PhaseFacts): PhaseKey {
  if (facts.hasHandoverPack) return "handover"
  if (facts.hasSubmission) return "interviews"
  return "shortlist"
}

export type PhaseState = "done" | "now" | "todo"

/** How one chip renders given where the role currently is. */
export function phaseState(key: PhaseKey, current: PhaseKey): PhaseState {
  const a = PHASES.findIndex((p) => p.key === key)
  const b = PHASES.findIndex((p) => p.key === current)
  if (a < b) return "done"
  if (a === b) return "now"
  return "todo"
}

/**
 * Where a chip goes when clicked.
 *
 * The shortlist chip returns to the workflow, interviews and handover to
 * their adjunct routes. Nothing here gates navigation: a recruiter may open
 * close-out before a submission exists, because deciding what is reachable is
 * a judgement about their work and those belong to people. The rail describes
 * where the role is; it does not police where you may look.
 */
export function phaseHref(key: PhaseKey, roleId: string): string {
  const base = `/agencies/roles/${roleId}`
  if (key === "interviews") return `${base}/interviews`
  if (key === "handover") return `${base}/close-out`
  return base
}

/**
 * Where opening a role should LAND, given its phase.
 *
 * The shortlist flow is finished the moment the submission goes — landing a
 * recruiter back on "Add candidates" for a role that is mid-interviews is how
 * the two flows blurred into one. The workflow stays one click away
 * (?flow=shortlist), it just stops being the front door once its work is done.
 */
export function roleLandingPath(phase: PhaseKey | null, roleId: string): string {
  const base = `/agencies/roles/${roleId}`
  if (phase === "interviews") return `${base}/interviews`
  if (phase === "handover") return `${base}/close-out`
  return base
}
