/**
 * Admin insights — the second dashboard page.
 *
 * Pure functions over rows already in Postgres. Emails are OK for admin
 * viewers; IPs / CV / JD text stay out.
 */

import { median, userLabel, type MetricsRun, type MetricsTracked, type MetricsUser } from '@/lib/admin-metrics'

const DAY = 86_400_000
const HOUR = 3_600_000
const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100))

export interface InsightsProfile {
  id: string
  tailors_used: number
  plan?: string | null
}

export interface RoadmapItemRow {
  user_id: string
  status?: string
  horizon?: string | null
  resources?: unknown
  project_brief?: string | null
}

export interface FeatureTouch {
  user_id: string
  /** First known timestamp for the feature, if available. */
  at?: string | null
}

export interface CourseOpsInput {
  pendingTotal: number
  pendingByProvider: Record<string, number>
  catalogActive: number
  catalogStale: number
  lastSync: {
    source: string
    status: string
    started_at: string
    finished_at: string | null
    error: string | null
  } | null
}

export interface OpsAlert {
  key: string
  severity: 'info' | 'warn' | 'critical'
  label: string
  detail: string
  count?: number
  href?: string
}

export interface QualityByOutcome {
  stage: string
  label: string
  users: number
  runs: number
  medianScore: number | null
}

export interface TimeToX {
  signupToFirstTailorHours: number | null
  firstTailorToTrackHours: number | null
  trackToAppliedHours: number | null
  sampleSizes: {
    signupToFirstTailor: number
    firstTailorToTrack: number
    trackToApplied: number
  }
}

export interface QuotaPressure {
  freeUsers: number
  proUsers: number
  proShare: number
  /** Free users at/above heavy all-time usage thresholds. */
  freeHeavy10: number
  freeHeavy30: number
  /** Free users with ≥40 tailor runs in the last 30 days (near daily rate wall). */
  freeNearDailyWall: number
  nearWallEmails: string[]
}

export interface FeatureRetentionRow {
  key: string
  label: string
  adopters: number
  active7d: number
  active30d: number
  rate7d: number
  rate30d: number
}

export interface QuietUser {
  email: string
  last_sign_in_at: string | null
  activated_at: string | null
  tailors_used: number
}

export interface AdminInsights {
  alerts: OpsAlert[]
  qualityByOutcome: QualityByOutcome[]
  timeToX: TimeToX
  quota: QuotaPressure
  featureRetention: FeatureRetentionRow[]
  courseOps: {
    pendingTotal: number
    pendingByProvider: Record<string, number>
    catalogActive: number
    catalogStale: number
    lastSync: CourseOpsInput['lastSync']
  }
  quietUsers: QuietUser[]
  generatedNotes: string[]
}

function firstRunByUser(runs: MetricsRun[]): Map<string, number> {
  const first = new Map<string, number>()
  for (const r of runs) {
    if (!r?.user_id || !r?.created_at) continue
    const t = new Date(r.created_at).getTime()
    const prev = first.get(r.user_id)
    if (prev === undefined || t < prev) first.set(r.user_id, t)
  }
  return first
}

function firstTrackedByUser(tracked: MetricsTracked[]): Map<string, number> {
  const first = new Map<string, number>()
  for (const t of tracked) {
    if (!t?.user_id || !t.created_at) continue
    const ts = new Date(t.created_at).getTime()
    const prev = first.get(t.user_id)
    if (prev === undefined || ts < prev) first.set(t.user_id, ts)
  }
  return first
}

function firstAppliedByUser(tracked: MetricsTracked[]): Map<string, number> {
  const rank: Record<string, number> = { applied: 2, interview: 3, offer: 4 }
  const first = new Map<string, number>()
  for (const t of tracked) {
    if (!t?.user_id || !t.created_at || !t.status) continue
    if ((rank[t.status] ?? 0) < 2) continue
    // Prefer updated_at when status moved; fall back to created_at.
    const ts = new Date(t.updated_at || t.created_at).getTime()
    const prev = first.get(t.user_id)
    if (prev === undefined || ts < prev) first.set(t.user_id, ts)
  }
  return first
}

function highestStatus(tracked: MetricsTracked[]): Map<string, string> {
  const rank: Record<string, number> = { saved: 1, applied: 2, interview: 3, offer: 4 }
  const best = new Map<string, string>()
  for (const t of tracked) {
    if (!t?.user_id || !t.status) continue
    const prev = best.get(t.user_id)
    if (!prev || (rank[t.status] ?? 0) > (rank[prev] ?? 0)) best.set(t.user_id, t.status)
  }
  return best
}

function isEmptyResources(resources: unknown): boolean {
  if (resources == null) return true
  if (Array.isArray(resources)) return resources.length === 0
  return false
}

export function buildQualityByOutcome(
  runs: MetricsRun[],
  tracked: MetricsTracked[],
): QualityByOutcome[] {
  const best = highestStatus(tracked)
  const stages: Array<{ stage: string; label: string; minRank: number }> = [
    { stage: 'saved', label: 'Tracking only', minRank: 1 },
    { stage: 'applied', label: 'Applied+', minRank: 2 },
    { stage: 'interview', label: 'Interview+', minRank: 3 },
    { stage: 'offer', label: 'Offer', minRank: 4 },
  ]
  const rank: Record<string, number> = { saved: 1, applied: 2, interview: 3, offer: 4 }

  return stages.map(({ stage, label, minRank }) => {
    const userIds = new Set(
      [...best.entries()]
        .filter(([, s]) => (rank[s] ?? 0) >= minRank)
        .map(([id]) => id),
    )
    const stageRuns = runs.filter((r) => userIds.has(r.user_id))
    const scores = stageRuns
      .map((r) => r.match_score)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    return {
      stage,
      label,
      users: userIds.size,
      runs: stageRuns.length,
      medianScore: median(scores),
    }
  })
}

export function buildTimeToX(input: {
  users: MetricsUser[]
  runs: MetricsRun[]
  tracked: MetricsTracked[]
}): TimeToX {
  const firstRun = firstRunByUser(input.runs)
  const firstTrack = firstTrackedByUser(input.tracked)
  const firstApplied = firstAppliedByUser(input.tracked)

  const signupToTailor: number[] = []
  const tailorToTrack: number[] = []
  const trackToApplied: number[] = []

  for (const u of input.users) {
    const signup = new Date(u.created_at).getTime()
    const run = firstRun.get(u.id)
    if (run !== undefined && run >= signup) {
      signupToTailor.push((run - signup) / HOUR)
    }
    if (run !== undefined) {
      const track = firstTrack.get(u.id)
      if (track !== undefined && track >= run) {
        tailorToTrack.push((track - run) / HOUR)
      }
    }
    const track = firstTrack.get(u.id)
    const applied = firstApplied.get(u.id)
    if (track !== undefined && applied !== undefined && applied >= track) {
      trackToApplied.push((applied - track) / HOUR)
    }
  }

  const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10)

  return {
    signupToFirstTailorHours: round1(median(signupToTailor)),
    firstTailorToTrackHours: round1(median(tailorToTrack)),
    trackToAppliedHours: round1(median(trackToApplied)),
    sampleSizes: {
      signupToFirstTailor: signupToTailor.length,
      firstTailorToTrack: tailorToTrack.length,
      trackToApplied: trackToApplied.length,
    },
  }
}

export function buildQuotaPressure(input: {
  users: MetricsUser[]
  profiles: InsightsProfile[]
  runs30d: MetricsRun[]
  nearWallThreshold?: number
}): QuotaPressure {
  const nearWall = input.nearWallThreshold ?? 40
  const emailById = new Map(input.users.map((u) => [u.id, u.email ?? null]))
  const free = input.profiles.filter((p) => (p.plan ?? 'free') !== 'pro')
  const pro = input.profiles.filter((p) => p.plan === 'pro')

  const runsByUser = new Map<string, number>()
  for (const r of input.runs30d) {
    runsByUser.set(r.user_id, (runsByUser.get(r.user_id) ?? 0) + 1)
  }

  const nearWallIds = free
    .filter((p) => (runsByUser.get(p.id) ?? 0) >= nearWall)
    .sort((a, b) => (runsByUser.get(b.id) ?? 0) - (runsByUser.get(a.id) ?? 0))

  return {
    freeUsers: free.length,
    proUsers: pro.length,
    proShare: pct(pro.length, free.length + pro.length),
    freeHeavy10: free.filter((p) => (p.tailors_used ?? 0) >= 10).length,
    freeHeavy30: free.filter((p) => (p.tailors_used ?? 0) >= 30).length,
    freeNearDailyWall: nearWallIds.length,
    nearWallEmails: nearWallIds
      .slice(0, 12)
      .map((p) => userLabel(p.id, emailById.get(p.id))),
  }
}

export function buildFeatureRetention(input: {
  adopters: {
    careerPath: string[]
    careerArc: string[]
    firstCv: string[]
  }
  runs: MetricsRun[]
  now?: Date
}): FeatureRetentionRow[] {
  const now = input.now ?? new Date()
  const cut7 = now.getTime() - 7 * DAY
  const cut30 = now.getTime() - 30 * DAY

  const activeSince = (cutoff: number) => {
    const ids = new Set<string>()
    for (const r of input.runs) {
      if (!r.user_id || !r.created_at) continue
      if (new Date(r.created_at).getTime() >= cutoff) ids.add(r.user_id)
    }
    return ids
  }
  const a7 = activeSince(cut7)
  const a30 = activeSince(cut30)

  const rows: Array<{ key: string; label: string; ids: string[] }> = [
    { key: 'career_path', label: 'Career Path', ids: input.adopters.careerPath },
    { key: 'career_arc', label: 'Career Arc', ids: input.adopters.careerArc },
    { key: 'first_cv', label: 'First CV', ids: input.adopters.firstCv },
  ]

  return rows.map((r) => {
    const set = new Set(r.ids)
    const active7d = [...set].filter((id) => a7.has(id)).length
    const active30d = [...set].filter((id) => a30.has(id)).length
    return {
      key: r.key,
      label: r.label,
      adopters: set.size,
      active7d,
      active30d,
      rate7d: pct(active7d, set.size),
      rate30d: pct(active30d, set.size),
    }
  })
}

export function buildQuietUsers(input: {
  users: MetricsUser[]
  profiles: InsightsProfile[]
  runs: MetricsRun[]
  now?: Date
  activatedWithinDays?: number
  quietDays?: number
  max?: number
}): QuietUser[] {
  const now = input.now ?? new Date()
  const activatedWithin = (input.activatedWithinDays ?? 14) * DAY
  const quietMs = (input.quietDays ?? 7) * DAY
  const max = input.max ?? 20
  const first = firstRunByUser(input.runs)
  const activated = new Set(
    input.profiles.filter((p) => (p.tailors_used ?? 0) >= 1).map((p) => p.id),
  )

  const quiet = input.users
    .filter((u) => {
      if (!activated.has(u.id)) return false
      const activatedAt = first.get(u.id) ?? new Date(u.created_at).getTime()
      if (now.getTime() - activatedAt > activatedWithin) return false
      if (!u.last_sign_in_at) return true
      return now.getTime() - new Date(u.last_sign_in_at).getTime() >= quietMs
    })
    .map((u) => {
      const profile = input.profiles.find((p) => p.id === u.id)
      const activatedAt = first.get(u.id)
      return {
        email: userLabel(u.id, u.email),
        last_sign_in_at: u.last_sign_in_at ?? null,
        activated_at: activatedAt ? new Date(activatedAt).toISOString() : u.created_at,
        tailors_used: profile?.tailors_used ?? 0,
      }
    })
    .sort((a, b) => (a.last_sign_in_at ?? '').localeCompare(b.last_sign_in_at ?? ''))

  return quiet.slice(0, max)
}

export function countEnrichmentStuck(items: RoadmapItemRow[]): number {
  return items.filter((i) => {
    if ((i.horizon ?? 'core') !== 'core') return false
    if ((i.status ?? 'todo') === 'done') return false
    const brief = (i.project_brief ?? '').trim()
    return isEmptyResources(i.resources) && brief.length === 0
  }).length
}

export function buildOpsAlerts(input: {
  course: CourseOpsInput
  authUsers: number
  profiles: number
  enrichmentStuck: number
}): OpsAlert[] {
  const alerts: OpsAlert[] = []

  if (input.course.pendingTotal > 0) {
    alerts.push({
      key: 'courses_pending',
      severity: input.course.pendingTotal >= 50 ? 'critical' : 'warn',
      label: 'Course candidates pending review',
      detail: `${input.course.pendingTotal} waiting in the queue`,
      count: input.course.pendingTotal,
      href: '/admin/courses',
    })
  }

  const sync = input.course.lastSync
  if (sync && (sync.status === 'failed' || sync.status === 'partial')) {
    alerts.push({
      key: 'sync_failed',
      severity: sync.status === 'failed' ? 'critical' : 'warn',
      label: `Course sync ${sync.status}`,
      detail: sync.error?.slice(0, 160) || `${sync.source} · ${sync.started_at.slice(0, 10)}`,
      href: '/admin/courses',
    })
  }

  if (input.authUsers !== input.profiles) {
    alerts.push({
      key: 'auth_profile_mismatch',
      severity: 'warn',
      label: 'Auth users ≠ profiles',
      detail: `${input.authUsers} auth · ${input.profiles} profiles`,
      count: Math.abs(input.authUsers - input.profiles),
    })
  }

  if (input.enrichmentStuck > 0) {
    alerts.push({
      key: 'enrichment_stuck',
      severity: input.enrichmentStuck >= 20 ? 'critical' : 'warn',
      label: 'North Star skills missing plans',
      detail: `${input.enrichmentStuck} core skills with empty resources`,
      count: input.enrichmentStuck,
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      key: 'all_clear',
      severity: 'info',
      label: 'Nothing urgent',
      detail: 'No pending course backlog, failed syncs, or enrichment stalls detected.',
    })
  }

  return alerts
}

/** Assemble the full insights payload. */
export function buildAdminInsights(input: {
  users: MetricsUser[]
  profiles: InsightsProfile[]
  runs: MetricsRun[]
  runs30d: MetricsRun[]
  tracked: MetricsTracked[]
  roadmapItems: RoadmapItemRow[]
  careerPathUsers: string[]
  careerArcUsers: string[]
  firstCvUsers: string[]
  course: CourseOpsInput
  now?: Date
}): AdminInsights {
  const enrichmentStuck = countEnrichmentStuck(input.roadmapItems)

  return {
    alerts: buildOpsAlerts({
      course: input.course,
      authUsers: input.users.length,
      profiles: input.profiles.length,
      enrichmentStuck,
    }),
    qualityByOutcome: buildQualityByOutcome(input.runs30d, input.tracked),
    timeToX: buildTimeToX({
      users: input.users,
      runs: input.runs,
      tracked: input.tracked,
    }),
    quota: buildQuotaPressure({
      users: input.users,
      profiles: input.profiles,
      runs30d: input.runs30d,
    }),
    featureRetention: buildFeatureRetention({
      adopters: {
        careerPath: input.careerPathUsers,
        careerArc: input.careerArcUsers,
        firstCv: input.firstCvUsers,
      },
      runs: input.runs,
      now: input.now,
    }),
    courseOps: {
      pendingTotal: input.course.pendingTotal,
      pendingByProvider: input.course.pendingByProvider,
      catalogActive: input.course.catalogActive,
      catalogStale: input.course.catalogStale,
      lastSync: input.course.lastSync,
    },
    quietUsers: buildQuietUsers({
      users: input.users,
      profiles: input.profiles,
      runs: input.runs,
      now: input.now,
    }),
    generatedNotes: [
      'Quality-by-outcome uses the last 30 days of tailor runs among users at each tracker stage.',
      'Feature retention = adopters who tailored again in the window (not page views).',
      'Near daily wall = free users with ≥40 tailor runs in 30 days (rate limit is 60/day).',
      'Quiet users = activated in the last 14 days, no sign-in for 7+ days.',
    ],
  }
}
