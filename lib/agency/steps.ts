/**
 * The role workflow rail, exactly as the design handoff numbers it.
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

/** "06" for the rail badge and the "Step 06 · Candidate detail" eyebrow. */
export function stepNumber(key: StepKey): string {
  return String(WORKFLOW_STEPS.findIndex((s) => s.key === key) + 1).padStart(2, "0")
}

export function stepLabel(key: StepKey): string {
  return WORKFLOW_STEPS.find((s) => s.key === key)?.label ?? ""
}
