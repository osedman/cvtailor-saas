/**
 * The shortlist workflow rail, exactly as the design handoff numbers it.
 *
 * Seven steps, not six. Candidate detail is step 06 in the drawing and lives
 * on its own route here (it is per-candidate and deep linkable), which is why
 * it went missing from the rail for a while — the rail was built from the
 * steps the workflow page happened to render rather than from the workflow
 * itself. Both pages import this list so they can never disagree again.
 */

export type StepKey =
  | "intake"
  | "parse"
  | "candidates"
  | "screening"
  | "compare"
  | "detail"
  | "submission"

export const WORKFLOW_STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "intake", label: "Role intake" },
  { key: "parse", label: "Parse review" },
  { key: "candidates", label: "Add candidates" },
  { key: "screening", label: "Screening calls" },
  { key: "compare", label: "Compare" },
  { key: "detail", label: "Candidate detail" },
  { key: "submission", label: "Client submission" },
]

/**
 * The six steps the workflow page renders as panes. Candidate detail is the
 * seventh and has its own route, so Back / Next skip it. Derived from the
 * one list rather than declared beside it — the page kept its own filtered
 * copy for a while, which is how a second step list starts.
 */
export type PaneStepKey = Exclude<StepKey, "detail">
export const PANE_STEPS = WORKFLOW_STEPS.filter((s) => s.key !== "detail") as Array<{
  key: PaneStepKey
  label: string
}>

/** "06" for the rail badge and the "Step 06 · Candidate detail" eyebrow. */
export function stepNumber(key: StepKey): string {
  return String(WORKFLOW_STEPS.findIndex((s) => s.key === key) + 1).padStart(2, "0")
}

/** "Candidate detail" for the eyebrow and the crumb. */
export function stepLabel(key: StepKey): string {
  return WORKFLOW_STEPS.find((s) => s.key === key)?.label ?? ""
}

/**
 * The steps on which sourcing is still an open question.
 *
 * Publishing a role for Tailr matching is a decision about WHERE CANDIDATES
 * COME FROM. Once the recruiter is on a screening call writing down what
 * someone said, sourcing is behind them, and a card asking them to think
 * about the funnel is noise on a screen for judging a person (Ose,
 * 14 Sep 2026).
 *
 * WHY THREE AND NOT ONE. The card used to render on step 01 alone — the only
 * state in which it can say nothing but "Not yet", because publishing needs
 * requirements to scan against. It was invisible in every state where it
 * could actually be used and the report was "there is no button". It was
 * then moved to EVERY step, which overcorrected. Intake keeps it so the
 * capability is discoverable; parse and candidates are where it is
 * actionable.
 *
 * Lives here rather than in the page so the rule has one home, beside the
 * step list it is derived from.
 */
export const SOURCING_STEPS: readonly PaneStepKey[] = ["intake", "parse", "candidates"] as const

/** Whether the sourcing card belongs on this step at all. */
export function isSourcingStep(step: PaneStepKey): boolean {
  return SOURCING_STEPS.includes(step)
}
