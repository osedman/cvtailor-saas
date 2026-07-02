import type { RequirementMapping } from "@/lib/anthropic"

/**
 * Phase 1 of the career-memory idea: mine the user's own tailor_history for
 * skills/requirements that keep coming up as weak across DIFFERENT job
 * targets. No new AI calls, no new page — just a signal banner surfaced
 * once there's enough history to say something meaningful.
 */

export interface CareerSignal {
  keyword: string
  /** number of distinct tailor runs where this keyword was weak evidence */
  count: number
}

const MIN_HISTORY_FOR_SIGNAL = 3
const MIN_RECURRENCE = 2

/**
 * `results` is one requirementsCoverage array per past tailor run (most
 * recent first is fine, order doesn't matter here).
 */
export function computeCareerSignal(results: RequirementMapping[][]): CareerSignal[] {
  if (results.length < MIN_HISTORY_FOR_SIGNAL) return []

  const counts = new Map<string, number>()
  for (const requirements of results) {
    // Dedupe within a single run so one job posting repeating a keyword
    // across multiple requirement lines doesn't inflate its count.
    const seenThisRun = new Set<string>()
    for (const r of requirements) {
      if (r.strength !== "partial" && r.strength !== "none") continue
      for (const kw of r.keywords ?? []) {
        const key = kw.trim().toLowerCase()
        if (!key || seenThisRun.has(key)) continue
        seenThisRun.add(key)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= MIN_RECURRENCE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([keyword, count]) => ({ keyword, count }))
}
