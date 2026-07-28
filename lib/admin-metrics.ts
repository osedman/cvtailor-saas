/**
 * Admin metrics — the funnel the roadmap is argued from.
 *
 * The dashboard used to show four volume counters (total users, active users,
 * tailors, tracked jobs). Volume tells you the app is being used; it does not
 * tell you whether it WORKS. These functions answer the question that actually
 * decides what to build next: of the people who sign up, how many reach the
 * moment the product exists for — a finished, tailored CV — and how many come
 * back after it?
 *
 * Everything here is pure so it can be unit tested; the page only renders it.
 *
 * ── A caveat that must survive into the UI ──
 * `tailorRuns` from /api/admin/stats covers the LAST 30 DAYS only, while
 * `profiles.tailors_used` is an all-time counter. So:
 *   - activation (all-time) is computed from `tailors_used`
 *   - return behaviour (which needs timestamps) is 30-day-scoped
 * Mixing the two silently would overstate churn for an older cohort. Callers
 * must label the windows, and `windowNote` exists to make that hard to forget.
 */

export interface MetricsProfile { id: string; tailors_used: number }
export interface MetricsRun { user_id: string; created_at: string }
export interface MetricsTracked { user_id: string }
export interface MetricsUser { id: string; created_at: string }

export interface FunnelStage {
  key: 'signed_up' | 'activated' | 'returned' | 'tracking'
  label: string
  /** What this stage means, in plain English, for the tooltip. */
  meaning: string
  count: number
  /** Share of the stage above it, 0–100, rounded. Null for the first stage. */
  conversionFromPrev: number | null
  /** Share of all signups, 0–100, rounded. */
  shareOfTotal: number
  /** True when the number is limited to the 30-day run window. */
  windowed: boolean
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100))

/** Distinct calendar days a user ran a tailor, within whatever runs are given. */
export function distinctRunDaysByUser(runs: MetricsRun[]): Map<string, number> {
  const seen = new Map<string, Set<string>>()
  for (const r of runs) {
    if (!r?.user_id || !r?.created_at) continue
    const day = r.created_at.slice(0, 10)
    const set = seen.get(r.user_id) ?? new Set<string>()
    set.add(day)
    seen.set(r.user_id, set)
  }
  return new Map([...seen].map(([user, days]) => [user, days.size]))
}

/**
 * The four-stage funnel. Each stage is a strict subset of the one above it,
 * so conversions are always ≤ 100% and the chart can never lie by widening.
 */
export function buildFunnel(input: {
  users: MetricsUser[]
  profiles: MetricsProfile[]
  runs: MetricsRun[]
  tracked: MetricsTracked[]
}): FunnelStage[] {
  const { users, profiles, runs, tracked } = input

  const signedUp = users.length

  const activatedIds = new Set(
    profiles.filter((p) => (p.tailors_used ?? 0) >= 1).map((p) => p.id)
  )
  const activated = activatedIds.size

  // "Came back" = tailored on 2+ separate days. One long session is not a
  // habit; a second day is the first evidence of one.
  const runDays = distinctRunDaysByUser(runs)
  const returned = [...runDays].filter(
    ([userId, days]) => days >= 2 && activatedIds.has(userId)
  ).length

  // Tracking a job = the user treated Tailr as part of a real application,
  // not a one-off experiment. Subset of activated, by construction below.
  const trackingIds = new Set(
    tracked.map((t) => t.user_id).filter((id) => activatedIds.has(id))
  )
  const tracking = trackingIds.size

  return [
    {
      key: 'signed_up',
      label: 'Signed up',
      meaning: 'Accounts created, all time.',
      count: signedUp,
      conversionFromPrev: null,
      shareOfTotal: 100,
      windowed: false,
    },
    {
      key: 'activated',
      label: 'Activated',
      meaning: 'Finished at least one tailored CV. The promise, delivered once.',
      count: activated,
      conversionFromPrev: pct(activated, signedUp),
      shareOfTotal: pct(activated, signedUp),
      windowed: false,
    },
    {
      key: 'returned',
      label: 'Came back',
      meaning: 'Tailored on 2+ separate days — the first sign of a habit.',
      count: returned,
      conversionFromPrev: pct(returned, activated),
      shareOfTotal: pct(returned, signedUp),
      windowed: true,
    },
    {
      key: 'tracking',
      label: 'Tracking a job',
      meaning: 'Saved a real application. Tailr became part of their search.',
      count: tracking,
      conversionFromPrev: pct(tracking, activated),
      shareOfTotal: pct(tracking, signedUp),
      windowed: false,
    },
  ]
}

/**
 * THE north star: activation rate. Of everyone who signs up, what share ever
 * reaches a finished tailored CV? It is the honest headline because it cannot
 * be inflated by traffic — more signups with the same product move it not at
 * all — and every roadmap argument ("polish the editor" vs "fix onboarding")
 * resolves to whether it moves this number.
 */
export function activationRate(
  users: MetricsUser[],
  profiles: MetricsProfile[]
): { rate: number; activated: number; total: number } {
  const total = users.length
  const activated = profiles.filter((p) => (p.tailors_used ?? 0) >= 1).length
  return { rate: pct(activated, total), activated, total }
}

/**
 * Weekly active tailorers — people who produced something in the last 7 days.
 * Pairs with activation: activation says the product works once, this says it
 * keeps being worth opening. Deliberately counts RUNS, not logins; a login
 * with no output is not value delivered.
 */
export function weeklyActiveTailorers(runs: MetricsRun[], now = new Date()): number {
  const cutoff = now.getTime() - 7 * 86400000
  const ids = new Set<string>()
  for (const r of runs) {
    if (!r?.created_at || !r?.user_id) continue
    if (new Date(r.created_at).getTime() >= cutoff) ids.add(r.user_id)
  }
  return ids.size
}

/**
 * Of users who signed up in the last `days` days, what share tailored within
 * their first 7 days? Slower-moving than raw activation but far more
 * actionable — it isolates the onboarding experience from historical cohorts
 * who joined under a different version of the product.
 */
export function recentCohortActivation(
  users: MetricsUser[],
  runs: MetricsRun[],
  days = 30,
  now = new Date()
): { rate: number; activated: number; total: number } {
  const cutoff = now.getTime() - days * 86400000
  const cohort = users.filter((u) => new Date(u.created_at).getTime() >= cutoff)

  const firstRun = new Map<string, number>()
  for (const r of runs) {
    if (!r?.user_id || !r?.created_at) continue
    const t = new Date(r.created_at).getTime()
    const prev = firstRun.get(r.user_id)
    if (prev === undefined || t < prev) firstRun.set(r.user_id, t)
  }

  const activated = cohort.filter((u) => {
    const first = firstRun.get(u.id)
    if (first === undefined) return false
    return first - new Date(u.created_at).getTime() <= 7 * 86400000
  }).length

  return { rate: pct(activated, cohort.length), activated, total: cohort.length }
}

/** Human-readable note about which numbers are 30-day-scoped. */
export const windowNote =
  'Run-level metrics cover the last 30 days; activation is all-time.'
