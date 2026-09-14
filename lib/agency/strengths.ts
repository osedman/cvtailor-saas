/**
 * The four strengths, their order, and what each is worth.
 *
 * ONE DEFINITION, THREE CALLERS. The scoring engine weights by these; the
 * screening pane offers them as choices and now prints the weight on each
 * choice; the compare matrix orders by them. Until 14 Sep 2026 the numbers
 * existed twice — once in scoring.ts and once hardcoded into a legend in the
 * screening pane's JSX — so the UI could have told a recruiter a requirement
 * was worth 0.7 while the score used something else, and nothing would have
 * caught it.
 *
 * NO SERVER IMPORTS IN THIS FILE. scoring.ts imports `crypto`, so a client
 * component importing the constant from there drags a Node builtin into the
 * browser bundle. Same rule, and the same reason, as phases.ts,
 * settings-limits.ts and round-delta.ts: a runtime constant shared with the
 * client lives in a module that reaches nothing.
 */

import type { Strength } from "./types"

/**
 * Strongest first. This is the order the picker renders and the order the
 * matrix sorts by — not alphabetical, and not the enum's declaration order
 * by accident.
 */
export const STRENGTHS: readonly Strength[] = ["strong", "transferable", "partial", "missing"] as const

/** What one requirement at each strength contributes, before weighting. */
export const STRENGTH_VALUE: Record<Strength, number> = {
  strong: 1.0,
  transferable: 0.7,
  partial: 0.4,
  missing: 0.0,
}

/** The weight as the screening pane prints it, beside the option's name. */
export function strengthWeightLabel(s: Strength): string {
  return STRENGTH_VALUE[s].toFixed(1)
}
