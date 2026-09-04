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
