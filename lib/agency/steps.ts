/**
 * The shortlist workflow rail.
 *
 * SIX steps (Ose, 1 Oct 2026). Candidate detail used to be step 06; it is no
 * longer a step but a pop-up you open on a person from any step (frame 07's
 * intercepting-route modal, which keeps its own URL and a full-page fallback
 * for links). It is per-candidate, so it never belonged in a linear rail.
 * Both the workflow page and the candidate route import this list so they can
 * never disagree.
 */

export type StepKey =
  | "intake"
  | "parse"
  | "candidates"
  | "screening"
  | "compare"
  | "submission"

export const WORKFLOW_STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "intake", label: "Role intake" },
  { key: "parse", label: "Check requirements" },
  { key: "candidates", label: "Add candidates" },
  { key: "screening", label: "Screening calls" },
  { key: "compare", label: "Compare" },
  { key: "submission", label: "Client submission" },
]

/**
 * The steps the workflow page renders as panes — every step, now that
 * candidate detail is a pop-up rather than a route in the rail. Kept as its
 * own name so callers that mean "a pane" still say so.
 */
export type PaneStepKey = StepKey
export const PANE_STEPS = WORKFLOW_STEPS

/** "05" for the rail badge and the "Step 05 · Compare" eyebrow. */
export function stepNumber(key: StepKey): string {
  return String(WORKFLOW_STEPS.findIndex((s) => s.key === key) + 1).padStart(2, "0")
}

/** "Compare" for the eyebrow and the crumb. */
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
