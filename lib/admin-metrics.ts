/**
 * Admin product-health metrics.
 *
 * Pure functions: the API loads rows, this module turns them into the
 * aggregates the dashboard renders. No PII leaves this layer — masked ids
 * only. Every stage in a funnel is a strict subset of the one above it.
 */

export interface MetricsProfile { id: string; tailors_used: number }
export interface MetricsRun {
  user_id: string
  created_at: string
  match_score?: number | null
  feedback?: { rating?: string } | null
  edited_at?: string | null
  cover_letter?: string | null
}
export interface MetricsTracked {
  user_id: string
  status?: string
  created_at?: string
  updated_at?: string
}
export interface MetricsUser { id: string; created_at: string }

export interface FunnelStage {
  key: string
  label: string
  meaning: string
  count: number
  conversionFromPrev: number | null
  shareOfTotal: number
  windowed: boolean
}

export interface CohortWeek {
  weekStart: string
  label: string
  signedUp: number
  tailoredIn7d: number
  returned: number
  tracking: number
  tailoredRate: number
  previousTailoredRate: number | null
  delta: number | null
}

export interface StuckBucket {
  key: string
  label: string
  meaning: string
  count: number
  /** Masked ids only — never emails. */
  users: string[]
}

export interface QualityMetrics {
  medianScore: number | null
  scoreBuckets: { low: number; medium: number; strong: number }
  feedbackUp: number
  feedbackDown: number
  feedbackRate: number | null
  editRate: number
  coverLetterRate: number
  runs: number
  activatedUsers: number
  runsPerActivated: number | null
}

export interface FeatureAdoption {
  careerPathUsers: number
  northStarLocked: number
  skillsCompleted: number
  careerArcProfiles: number
  careerArcShared: number
  evidenceUsers: number
  firstCvStarted: number
  firstCvCompleted: number
  eligibleUsers: number
}

export interface ProductHealth {
  headlines: {
    sevenDayActivation: { rate: number; activated: number; total: number }
    timeToFirstTailorHours: number | null
    weeklyActiveTailorers: number
    thirtyDayReturnRate: { rate: number; returned: number; activated: number }
  }
  cohorts: CohortWeek[]
  outcomeFunnel: FunnelStage[]
  quality: QualityMetrics
  features: FeatureAdoption
  stuck: StuckBucket[]
  confidence: {
    windowDays: number
    notes: string[]
    profilesVsAuth: { profiles: number; authUsers: number }
  }
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100))
const DAY = 86_400_000

/** Mask a UUID for admin drill-down: "User ··A7F2". Never reverse-able to email. */
export function maskUserId(id: string): string {
  const clean = (id ?? '').replace(/-/g, '').toUpperCase()
  const tail = clean.slice(-4) || '????'
  return `User ··${tail}`
}

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

export function firstRunByUser(runs: MetricsRun[]): Map<string, number> {
  const first = new Map<string, number>()
  for (const r of runs) {
    if (!r?.user_id || !r?.created_at) continue
    const t = new Date(r.created_at).getTime()
    const prev = first.get(r.user_id)
    if (prev === undefined || t < prev) first.set(r.user_id, t)
  }
  return first
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

/** Start of ISO week (Monday UTC) for a date. */
export function weekStartUtc(iso: string): string {
  const d = new Date(iso)
  const day = d.getUTCDay() // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

export function activationRate(
  users: MetricsUser[],
  profiles: MetricsProfile[],
): { rate: number; activated: number; total: number } {
  const total = users.length
  const activated = profiles.filter((p) => (p.tailors_used ?? 0) >= 1).length
  return { rate: pct(activated, total), activated, total }
}

export function weeklyActiveTailorers(runs: MetricsRun[], now = new Date()): number {
  const cutoff = now.getTime() - 7 * DAY
  const ids = new Set<string>()
  for (const r of runs) {
    if (!r?.created_at || !r?.user_id) continue
    if (new Date(r.created_at).getTime() >= cutoff) ids.add(r.user_id)
  }
  return ids.size
}

export function recentCohortActivation(
  users: MetricsUser[],
  runs: MetricsRun[],
  days = 30,
  now = new Date(),
): { rate: number; activated: number; total: number } {
  const cutoff = now.getTime() - days * DAY
  const cohort = users.filter((u) => new Date(u.created_at).getTime() >= cutoff)
  const first = firstRunByUser(runs)
  const activated = cohort.filter((u) => {
    const t = first.get(u.id)
    if (t === undefined) return false
    return t - new Date(u.created_at).getTime() <= 7 * DAY
  }).length
  return { rate: pct(activated, cohort.length), activated, total: cohort.length }
}

/**
 * Legacy four-stage funnel kept for existing tests. Prefer `outcomeFunnel`
 * for the product-health dashboard.
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
    profiles.filter((p) => (p.tailors_used ?? 0) >= 1).map((p) => p.id),
  )
  const activated = activatedIds.size
  const runDays = distinctRunDaysByUser(runs)
  const returned = [...runDays].filter(
    ([userId, days]) => days >= 2 && activatedIds.has(userId),
  ).length
  const trackingIds = new Set(
    tracked.map((t) => t.user_id).filter((id) => activatedIds.has(id)),
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

const STATUS_RANK: Record<string, number> = {
  saved: 1,
  applied: 2,
  interview: 3,
  offer: 4,
}

/** Highest tracker status reached by each user. */
export function highestTrackerStatus(
  tracked: MetricsTracked[],
): Map<string, string> {
  const best = new Map<string, string>()
  for (const t of tracked) {
    if (!t?.user_id || !t.status) continue
    const prev = best.get(t.user_id)
    if (!prev || (STATUS_RANK[t.status] ?? 0) > (STATUS_RANK[prev] ?? 0)) {
      best.set(t.user_id, t.status)
    }
  }
  return best
}

/**
 * True outcome funnel. Every stage is a subset of the previous one among
 * activated users (except signup → first tailor).
 */
export function buildOutcomeFunnel(input: {
  users: MetricsUser[]
  profiles: MetricsProfile[]
  runs: MetricsRun[]
  tracked: MetricsTracked[]
}): FunnelStage[] {
  const { users, profiles, runs, tracked } = input
  const signedUp = users.length
  const activatedIds = new Set(
    profiles.filter((p) => (p.tailors_used ?? 0) >= 1).map((p) => p.id),
  )
  const activated = activatedIds.size
  const runDays = distinctRunDaysByUser(runs)
  const returnedIds = new Set(
    [...runDays]
      .filter(([id, days]) => days >= 2 && activatedIds.has(id))
      .map(([id]) => id),
  )
  // Strict subsets: each stage ⊆ previous. Tracking only counts among returners.
  const best = highestTrackerStatus(tracked)
  const trackingIds = new Set(
    [...best.keys()].filter((id) => returnedIds.has(id)),
  )
  const appliedIds = new Set(
    [...best.entries()]
      .filter(([id, s]) => trackingIds.has(id) && (STATUS_RANK[s] ?? 0) >= 2)
      .map(([id]) => id),
  )
  const interviewIds = new Set(
    [...best.entries()]
      .filter(([id, s]) => appliedIds.has(id) && (STATUS_RANK[s] ?? 0) >= 3)
      .map(([id]) => id),
  )
  const offerIds = new Set(
    [...best.entries()]
      .filter(([id, s]) => interviewIds.has(id) && (STATUS_RANK[s] ?? 0) >= 4)
      .map(([id]) => id),
  )

  const stages: Array<Omit<FunnelStage, 'conversionFromPrev' | 'shareOfTotal'>> = [
    {
      key: 'signed_up',
      label: 'Signed up',
      meaning: 'Accounts created.',
      count: signedUp,
      windowed: false,
    },
    {
      key: 'first_tailor',
      label: 'First tailor',
      meaning: 'Finished at least one tailored CV.',
      count: activated,
      windowed: false,
    },
    {
      key: 'returned',
      label: 'Returned',
      meaning: 'Tailored on 2+ separate days.',
      count: returnedIds.size,
      windowed: false,
    },
    {
      key: 'tracking',
      label: 'Tracking',
      meaning: 'Saved at least one application in the tracker.',
      count: trackingIds.size,
      windowed: false,
    },
    {
      key: 'applied',
      label: 'Applied',
      meaning: 'Moved a job to Applied or further.',
      count: appliedIds.size,
      windowed: false,
    },
    {
      key: 'interview',
      label: 'Interview',
      meaning: 'Reached Interview or Offer on any job.',
      count: interviewIds.size,
      windowed: false,
    },
    {
      key: 'offer',
      label: 'Offer',
      meaning: 'Marked at least one job as Offer.',
      count: offerIds.size,
      windowed: false,
    },
  ]

  return stages.map((s, i) => {
    const prev = i === 0 ? null : stages[i - 1].count
    return {
      ...s,
      conversionFromPrev: prev === null ? null : pct(s.count, prev),
      shareOfTotal: pct(s.count, signedUp),
    }
  })
}

export function buildQualityMetrics(
  runs: MetricsRun[],
  activatedUsers: number,
): QualityMetrics {
  const scores = runs
    .map((r) => r.match_score)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  const buckets = { low: 0, medium: 0, strong: 0 }
  for (const s of scores) {
    if (s < 60) buckets.low += 1
    else if (s < 80) buckets.medium += 1
    else buckets.strong += 1
  }
  let up = 0
  let down = 0
  for (const r of runs) {
    const rating = r.feedback?.rating
    if (rating === 'up') up += 1
    if (rating === 'down') down += 1
  }
  const edited = runs.filter((r) => !!r.edited_at).length
  const withLetter = runs.filter(
    (r) => typeof r.cover_letter === 'string' && r.cover_letter.trim().length > 0,
  ).length
  const feedbackTotal = up + down

  return {
    medianScore: median(scores),
    scoreBuckets: buckets,
    feedbackUp: up,
    feedbackDown: down,
    feedbackRate: feedbackTotal === 0 ? null : pct(up, feedbackTotal),
    editRate: pct(edited, runs.length),
    coverLetterRate: pct(withLetter, runs.length),
    runs: runs.length,
    activatedUsers,
    runsPerActivated:
      activatedUsers === 0
        ? null
        : Math.round((runs.length / activatedUsers) * 10) / 10,
  }
}

export function buildWeeklyCohorts(input: {
  users: MetricsUser[]
  runs: MetricsRun[]
  tracked: MetricsTracked[]
  weeks?: number
  now?: Date
}): CohortWeek[] {
  const now = input.now ?? new Date()
  const weekCount = input.weeks ?? 8
  const first = firstRunByUser(input.runs)
  const runDays = distinctRunDaysByUser(input.runs)
  const trackers = new Set(input.tracked.map((t) => t.user_id))

  // Build week buckets ending with the current week.
  const thisWeek = weekStartUtc(now.toISOString())
  const weeks: string[] = []
  for (let i = weekCount - 1; i >= 0; i--) {
    const d = new Date(`${thisWeek}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() - i * 7)
    weeks.push(d.toISOString().slice(0, 10))
  }

  const byWeek = new Map<string, MetricsUser[]>()
  for (const w of weeks) byWeek.set(w, [])
  for (const u of input.users) {
    const w = weekStartUtc(u.created_at)
    if (byWeek.has(w)) byWeek.get(w)!.push(u)
  }

  const cohorts: CohortWeek[] = []
  for (const w of weeks) {
    const cohort = byWeek.get(w) ?? []
    const signedUp = cohort.length
    let tailoredIn7d = 0
    let returned = 0
    let tracking = 0
    for (const u of cohort) {
      const signup = new Date(u.created_at).getTime()
      const firstT = first.get(u.id)
      if (firstT !== undefined && firstT - signup <= 7 * DAY) tailoredIn7d += 1
      if ((runDays.get(u.id) ?? 0) >= 2) returned += 1
      if (trackers.has(u.id)) tracking += 1
    }
    const tailoredRate = pct(tailoredIn7d, signedUp)
    const prev = cohorts.length > 0 ? cohorts[cohorts.length - 1] : null
    cohorts.push({
      weekStart: w,
      label: w.slice(5), // MM-DD
      signedUp,
      tailoredIn7d,
      returned,
      tracking,
      tailoredRate,
      previousTailoredRate: prev ? prev.tailoredRate : null,
      delta: prev ? tailoredRate - prev.tailoredRate : null,
    })
  }
  return cohorts
}

export function buildStuckBuckets(input: {
  users: MetricsUser[]
  profiles: MetricsProfile[]
  runs: MetricsRun[]
  tracked: MetricsTracked[]
  roadmaps?: Array<{ user_id: string; target_role?: string | null }>
  roadmapItems?: Array<{ user_id: string; status?: string }>
  now?: Date
  maxUsersPerBucket?: number
}): StuckBucket[] {
  const now = input.now ?? new Date()
  const max = input.maxUsersPerBucket ?? 12
  const activated = new Set(
    input.profiles.filter((p) => (p.tailors_used ?? 0) >= 1).map((p) => p.id),
  )
  const first = firstRunByUser(input.runs)
  const runDays = distinctRunDaysByUser(input.runs)
  const best = highestTrackerStatus(input.tracked)
  const hasRoadmap = new Set(
    (input.roadmaps ?? [])
      .filter((r) => (r.target_role ?? '').trim().length > 0)
      .map((r) => r.user_id),
  )
  const skillActivity = new Set(
    (input.roadmapItems ?? [])
      .filter((i) => i.status === 'in_progress' || i.status === 'done')
      .map((i) => i.user_id),
  )

  const pick = (ids: string[]) =>
    ids.slice(0, max).map(maskUserId)

  const neverTailored = input.users
    .filter((u) => {
      if (activated.has(u.id) || first.has(u.id)) return false
      return now.getTime() - new Date(u.created_at).getTime() >= 3 * DAY
    })
    .map((u) => u.id)

  const oneAndDone = [...activated].filter((id) => (runDays.get(id) ?? 0) < 2)

  const trackingNoApply = [...best.entries()]
    .filter(([, s]) => s === 'saved')
    .map(([id]) => id)
    .filter((id) => activated.has(id))

  const appliedNoInterview = [...best.entries()]
    .filter(([, s]) => s === 'applied')
    .map(([id]) => id)

  const northStarIdle = [...hasRoadmap].filter((id) => !skillActivity.has(id))

  return [
    {
      key: 'never_tailored',
      label: 'Signed up 3+ days ago, never tailored',
      meaning: 'Onboarding or first-run friction.',
      count: neverTailored.length,
      users: pick(neverTailored),
    },
    {
      key: 'one_and_done',
      label: 'Tailored once, never returned',
      meaning: 'Activated but no habit yet.',
      count: oneAndDone.length,
      users: pick(oneAndDone),
    },
    {
      key: 'tracking_no_apply',
      label: 'Tracking jobs, never marked applied',
      meaning: 'Saved applications without pipeline movement.',
      count: trackingNoApply.length,
      users: pick(trackingNoApply),
    },
    {
      key: 'applied_no_interview',
      label: 'Applied, no interview progression',
      meaning: 'Stuck at Applied — quality or follow-through.',
      count: appliedNoInterview.length,
      users: pick(appliedNoInterview),
    },
    {
      key: 'north_star_idle',
      label: 'North Star locked, no skill activity',
      meaning: 'Path exists but nothing started.',
      count: northStarIdle.length,
      users: pick(northStarIdle),
    },
  ]
}

export function timeToFirstTailorHours(
  users: MetricsUser[],
  runs: MetricsRun[],
  days = 30,
  now = new Date(),
): number | null {
  const cutoff = now.getTime() - days * DAY
  const first = firstRunByUser(runs)
  const hours: number[] = []
  for (const u of users) {
    const signup = new Date(u.created_at).getTime()
    if (signup < cutoff) continue
    const t = first.get(u.id)
    if (t === undefined || t < signup) continue
    hours.push((t - signup) / 3_600_000)
  }
  const m = median(hours)
  return m === null ? null : Math.round(m * 10) / 10
}

export function thirtyDayReturnRate(
  profiles: MetricsProfile[],
  runs: MetricsRun[],
  now = new Date(),
): { rate: number; returned: number; activated: number } {
  const cutoff = now.getTime() - 30 * DAY
  const activated = profiles.filter((p) => (p.tailors_used ?? 0) >= 1).map((p) => p.id)
  // Among users who had at least one run in the last 30d, who ran on 2+ days?
  const recentRuns = runs.filter(
    (r) => r.created_at && new Date(r.created_at).getTime() >= cutoff,
  )
  const days = distinctRunDaysByUser(recentRuns)
  const activatedWithRecent = activated.filter((id) => days.has(id))
  const returned = activatedWithRecent.filter((id) => (days.get(id) ?? 0) >= 2).length
  return {
    rate: pct(returned, activatedWithRecent.length),
    returned,
    activated: activatedWithRecent.length,
  }
}

export function buildFeatureAdoption(input: {
  eligibleUsers: number
  roadmaps: Array<{ user_id: string; target_role?: string | null }>
  roadmapItems: Array<{ user_id: string; status?: string }>
  careerProfiles: Array<{ user_id: string }>
  arcShares: number
  evidenceUsers: number
  firstCvs: Array<{ user_id: string; status?: string | null }>
}): FeatureAdoption {
  const pathUsers = new Set(input.roadmaps.map((r) => r.user_id))
  const locked = new Set(
    input.roadmaps
      .filter((r) => (r.target_role ?? '').trim().length > 0)
      .map((r) => r.user_id),
  )
  const completedSkills = input.roadmapItems.filter((i) => i.status === 'done').length
  const arcProfiles = new Set(input.careerProfiles.map((p) => p.user_id)).size
  const firstStarted = new Set(input.firstCvs.map((f) => f.user_id)).size
  const firstCompleted = new Set(
    input.firstCvs
      .filter((f) => f.status === 'ready')
      .map((f) => f.user_id),
  ).size

  return {
    careerPathUsers: pathUsers.size,
    northStarLocked: locked.size,
    skillsCompleted: completedSkills,
    careerArcProfiles: arcProfiles,
    careerArcShared: input.arcShares,
    evidenceUsers: input.evidenceUsers,
    firstCvStarted: firstStarted,
    firstCvCompleted: firstCompleted,
    eligibleUsers: input.eligibleUsers,
  }
}

/** Assemble the full product-health payload for the admin API. */
export function buildProductHealth(input: {
  users: MetricsUser[]
  profiles: MetricsProfile[]
  runs: MetricsRun[]
  tracked: MetricsTracked[]
  roadmaps?: Array<{ user_id: string; target_role?: string | null }>
  roadmapItems?: Array<{ user_id: string; status?: string }>
  careerProfiles?: Array<{ user_id: string }>
  arcShares?: number
  evidenceUsers?: number
  firstCvs?: Array<{ user_id: string; status?: string | null }>
  now?: Date
  windowDays?: number
}): ProductHealth {
  const now = input.now ?? new Date()
  const windowDays = input.windowDays ?? 30
  const activated = activationRate(input.users, input.profiles)
  const cohort7 = recentCohortActivation(input.users, input.runs, 7, now)
  const return30 = thirtyDayReturnRate(input.profiles, input.runs, now)

  const notes = [
    `Outcome and quality metrics use the last ${windowDays} days of tailor runs unless labelled otherwise.`,
    'Activation and feature adoption are all-time counts of distinct users.',
    'Stuck buckets show masked ids only — never emails, CVs, or job text.',
  ]
  if (input.profiles.length !== input.users.length) {
    notes.push(
      `Auth users (${input.users.length}) and profiles (${input.profiles.length}) differ — counters may drift.`,
    )
  }

  return {
    headlines: {
      sevenDayActivation: cohort7,
      timeToFirstTailorHours: timeToFirstTailorHours(
        input.users, input.runs, windowDays, now,
      ),
      weeklyActiveTailorers: weeklyActiveTailorers(input.runs, now),
      thirtyDayReturnRate: return30,
    },
    cohorts: buildWeeklyCohorts({
      users: input.users,
      runs: input.runs,
      tracked: input.tracked,
      weeks: 8,
      now,
    }),
    outcomeFunnel: buildOutcomeFunnel({
      users: input.users,
      profiles: input.profiles,
      runs: input.runs,
      tracked: input.tracked,
    }),
    quality: buildQualityMetrics(input.runs, activated.activated),
    features: buildFeatureAdoption({
      eligibleUsers: input.users.length,
      roadmaps: input.roadmaps ?? [],
      roadmapItems: input.roadmapItems ?? [],
      careerProfiles: input.careerProfiles ?? [],
      arcShares: input.arcShares ?? 0,
      evidenceUsers: input.evidenceUsers ?? 0,
      firstCvs: input.firstCvs ?? [],
    }),
    stuck: buildStuckBuckets({
      users: input.users,
      profiles: input.profiles,
      runs: input.runs,
      tracked: input.tracked,
      roadmaps: input.roadmaps,
      roadmapItems: input.roadmapItems,
      now,
    }),
    confidence: {
      windowDays,
      notes,
      profilesVsAuth: {
        profiles: input.profiles.length,
        authUsers: input.users.length,
      },
    },
  }
}

export const windowNote =
  'Run-level metrics cover the last 30 days; activation is all-time.'
