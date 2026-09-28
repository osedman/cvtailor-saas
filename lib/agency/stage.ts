/**
 * Where a candidate stands on a role, as the RECRUITER reads it.
 *
 * Decided 21 Sep 2026 (Figma frame 21, "The loop reaches the recruiter"): a
 * round decision never writes back to recruiter_reviews. That table is the
 * recruiter's own judgement, and a client's decline copied into it would be a
 * machine writing 'reject' — which nothing in this product does, ever. So the
 * recruiter's call and the client's decisions are two layers, shown side by
 * side, and this is the second layer.
 *
 * NOT A SECOND LADDER. The per-candidate loop is `loopState` in
 * next-action.ts; this maps its answer to the recruiter's words and adds the
 * two facts it does not see — a recorded placement, and the client saying
 * they have finished deciding. Two derivations of "where is this person"
 * would disagree the first time either changed.
 *
 * A SIGNAL, NEVER A REMOVAL. Nothing here filters, sorts, hides or greys a
 * candidate. "Not advanced" is information with its round attached.
 *
 * Pure and free of server imports, so a screen can import the types.
 */

import { loopState, type RoundFacts, type RoundDecision } from "./next-action"

export type StageKind =
  | "placed"
  | "taken-forward"
  | "advanced"
  | "not-advanced"
  | "on-hold"
  | "awaiting-client"
  | "booked"
  | "to-book"
  | "not-interviewed"

/** One dot in the round trail. `open` is a round with no decision yet. */
export interface TrailStep {
  round: number
  outcome: RoundDecision | "open" | "cancelled"
}

export interface Stage {
  kind: StageKind
  /** The round the label is about, when it is about one. */
  round: number | null
  label: string
  trail: TrailStep[]
  /** When the client decided the round the label is about, if they have. */
  decidedAt: string | null
}

export interface StageInput {
  /** recruiter_reviews.decision === 'shortlist'. */
  shortlisted: boolean
  /** THIS candidate's rounds on THIS role, each carrying its latest decision. */
  rounds: RoundFacts[]
  plannedRounds: number
  decisionsCompleteAt: string | null
  placement: { status: string } | null
}

const PLACEMENT_LABEL: Record<string, string> = {
  offered: "Offer made",
  accepted: "Offer accepted",
  started: "Started",
  declined: "Offer declined",
  fell_through: "Fell through",
}

/**
 * One dot per round number. A round cancelled and rebooked under the same
 * number shows the live booking; a round only ever cancelled shows as
 * cancelled, so CAN-21's cancelled round 2 is visible rather than silently
 * dropped.
 */
export function roundTrail(rounds: RoundFacts[]): TrailStep[] {
  const byNumber = new Map<number, RoundFacts>()
  for (const r of rounds) {
    const seen = byNumber.get(r.roundNumber)
    if (!seen || (seen.status === "cancelled" && r.status !== "cancelled")) byNumber.set(r.roundNumber, r)
  }
  return [...byNumber.values()]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((r) => ({
      round: r.roundNumber,
      outcome: r.status === "cancelled" ? "cancelled" : r.decision ?? "open",
    }))
}

export function stageOf(input: StageInput, now: Date = new Date()): Stage | null {
  const stage = ladder(input, now)
  if (!stage) return null
  const at = input.rounds.find((r) => r.status !== "cancelled" && r.roundNumber === stage.round)
  return { ...stage, decidedAt: at?.decidedAt ?? null }
}

function ladder(input: StageInput, now: Date): Omit<Stage, "decidedAt"> | null {
  const trail = roundTrail(input.rounds)

  // A FACT OUTRANKS AN INFERENCE: who got the job is the placement.
  if (input.placement) {
    return { kind: "placed", round: null, label: PLACEMENT_LABEL[input.placement.status] ?? "Placement recorded", trail }
  }

  const state = loopState(input.rounds, input.plannedRounds, now)
  if (!state) {
    // The loop never reached someone the recruiter did not put forward.
    return input.shortlisted ? { kind: "not-interviewed", round: null, label: "Not interviewed yet", trail } : null
  }

  const live = input.rounds.filter((r) => r.status !== "cancelled")
  const lastDecided = [...live].filter((r) => r.decision).sort((a, b) => b.roundNumber - a.roundNumber)[0]

  switch (state.kind) {
    case "declined": {
      const at = [...live].filter((r) => r.decision === "decline").sort((a, b) => b.roundNumber - a.roundNumber)[0]
      const n = at?.roundNumber ?? null
      return { kind: "not-advanced", round: n, label: n ? `Not advanced at round ${n}` : "Not advanced", trail }
    }
    case "close-out":
      return { kind: "taken-forward", round: state.round.roundNumber, label: `Taken forward at round ${state.round.roundNumber}`, trail }
    case "to-book": {
      if (lastDecided?.decision === "advance") {
        const n = lastDecided.roundNumber
        // The client said they are finished: an advance is then the final
        // word, whatever the plan said.
        if (input.decisionsCompleteAt) return { kind: "taken-forward", round: n, label: `Taken forward at round ${n}`, trail }
        return { kind: "advanced", round: n, label: `Advanced at round ${n} · next round not booked`, trail }
      }
      return { kind: "to-book", round: state.nextRound, label: `Round ${state.nextRound} to rebook`, trail }
    }
    case "on-hold":
      return { kind: "on-hold", round: state.round.roundNumber, label: `On hold at round ${state.round.roundNumber}`, trail }
    case "decision-due":
      return { kind: "awaiting-client", round: state.round.roundNumber, label: `Round ${state.round.roundNumber} · awaiting the client’s decision`, trail }
    case "write-up-due":
      return { kind: "awaiting-client", round: state.round.roundNumber, label: `Round ${state.round.roundNumber} · awaiting the write-up`, trail }
    case "invited":
      return { kind: "booked", round: state.round.roundNumber, label: `Round ${state.round.roundNumber} · invite sent`, trail }
    case "booked":
      return { kind: "booked", round: state.round.roundNumber, label: `Round ${state.round.roundNumber} booked`, trail }
    case "happening-now":
      return { kind: "booked", round: state.round.roundNumber, label: `Round ${state.round.roundNumber} · happening now`, trail }
  }
}

/**
 * The candidate close-out pre-selects: exactly one taken forward, or nobody.
 *
 * Two taken forward is a two-hire role and none is a client still deciding;
 * in both the recruiter picks with nothing pre-selected. This is a
 * suggestion on a screen. It records nothing and closes nothing.
 */
export function suggestedHire(stages: Array<{ id: string; stage: Stage | null }>): string | null {
  const forward = stages.filter((s) => s.stage?.kind === "taken-forward")
  return forward.length === 1 ? forward[0].id : null
}
