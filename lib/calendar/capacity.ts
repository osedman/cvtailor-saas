/**
 * Can this cohort actually be seated?
 *
 * Pure, and it runs in the browser beside proposeWindows, because the
 * question is asked while the hiring manager is still choosing — before
 * anything is offered, and long before anyone is invited. Ose's line:
 * "do not allow Tailr to invite 12 candidates when only seven slots exist
 * without a clear warning."
 *
 * A verdict is never a block. The product's standing rule is that judgement
 * belongs to people: this returns what is true, plainly enough that
 * proceeding is a choice rather than an accident.
 */

import type { Interval } from "./windows"

export interface CapacityRules {
  durationMinutes: number
  minNoticeHours: number
  maxPerDay: number
}

export type CapacityLevel = "ok" | "tight" | "short"

export interface DayLoad {
  /** Local date, as rendered. */
  day: string
  slots: number
  /** Slots that exceed maxPerDay on that day and so cannot all be used. */
  overCap: number
}

export interface Capacity {
  level: CapacityLevel
  candidates: number
  /** Windows that survive every rule: long enough, far enough ahead, within the daily cap. */
  usable: number
  /** Offered windows that no candidate can be seated in, and why. */
  rejected: { tooSoon: number; tooShort: number; overDailyCap: number }
  /** usable − candidates. Negative means someone cannot be seated. */
  spare: number
  perDay: DayLoad[]
  /** One sentence, the thing to actually show. */
  headline: string
}

/** A comfortable cohort has a window each plus a little room to choose. */
export function recommendedSlots(candidates: number): number {
  return Math.max(candidates, Math.ceil(candidates * 1.25))
}

/**
 * Measure offered windows against the rules and the cohort.
 *
 * `now` is injected so the same inputs always give the same answer, which
 * is what makes this testable at a fixed date.
 */
export function assessCapacity(
  windows: Interval[],
  candidates: number,
  rules: CapacityRules,
  now: Date = new Date()
): Capacity {
  const duration = Math.max(1, rules.durationMinutes) * 60_000
  const noticeCutoff = now.getTime() + Math.max(0, rules.minNoticeHours) * 3_600_000
  const maxPerDay = Math.max(1, rules.maxPerDay)

  let tooSoon = 0
  let tooShort = 0
  const survivors: Array<{ start: number; day: string }> = []
  for (const w of windows) {
    const start = Date.parse(w.start)
    const end = Date.parse(w.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (end - start < duration) {
      tooShort += 1
      continue
    }
    if (start < noticeCutoff) {
      tooSoon += 1
      continue
    }
    survivors.push({ start, day: new Date(start).toDateString() })
  }

  // The daily cap is the manager's own limit on interviews in a day, so
  // windows beyond it on any date are real windows that still cannot be used.
  const byDay = new Map<string, number>()
  for (const s of survivors) byDay.set(s.day, (byDay.get(s.day) ?? 0) + 1)
  const perDay: DayLoad[] = [...byDay.entries()]
    .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]))
    .map(([day, slots]) => ({ day, slots, overCap: Math.max(0, slots - maxPerDay) }))
  const overDailyCap = perDay.reduce((n, d) => n + d.overCap, 0)
  const usable = survivors.length - overDailyCap
  const spare = usable - candidates

  const level: CapacityLevel = spare < 0 ? "short" : usable < recommendedSlots(candidates) ? "tight" : "ok"

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
  const headline =
    candidates === 0
      ? "Choose who you want to interview and we will size the times to them."
      : level === "short"
        ? `${plural(candidates, "candidate")} to seat and only ${plural(usable, "usable slot")}. ${plural(Math.abs(spare), "person")} could not be offered a time.`
        : level === "tight"
          ? `${plural(usable, "usable slot")} for ${plural(candidates, "candidate")}. It fits, but with no room to choose — a few more would be safer.`
          : `${plural(usable, "usable slot")} for ${plural(candidates, "candidate")}, ${plural(spare, "spare")}.`

  return {
    level,
    candidates,
    usable,
    rejected: { tooSoon, tooShort, overDailyCap },
    spare,
    perDay,
    headline,
  }
}
