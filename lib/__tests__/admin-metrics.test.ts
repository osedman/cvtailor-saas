import { describe, it, expect } from 'vitest'
import {
  buildFunnel,
  buildOutcomeFunnel,
  buildQualityMetrics,
  buildWeeklyCohorts,
  buildStuckBuckets,
  buildProductHealth,
  buildVolumeMetrics,
  activationRate,
  weeklyActiveTailorers,
  recentCohortActivation,
  distinctRunDaysByUser,
  maskUserId,
  userLabel,
  median,
  weekStartUtc,
  timeToFirstTailorHours,
} from '@/lib/admin-metrics'

const iso = (daysAgo: number, hour = 12) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

describe('distinctRunDaysByUser', () => {
  it('counts calendar days, not runs', () => {
    const days = distinctRunDaysByUser([
      { user_id: 'a', created_at: '2026-07-01T09:00:00Z' },
      { user_id: 'a', created_at: '2026-07-01T18:00:00Z' },
      { user_id: 'a', created_at: '2026-07-03T09:00:00Z' },
      { user_id: 'b', created_at: '2026-07-01T09:00:00Z' },
    ])
    expect(days.get('a')).toBe(2)
    expect(days.get('b')).toBe(1)
  })

  it('ignores malformed rows rather than throwing', () => {
    const days = distinctRunDaysByUser([
      { user_id: '', created_at: '2026-07-01T09:00:00Z' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { user_id: 'a', created_at: undefined as any },
      { user_id: 'a', created_at: '2026-07-02T09:00:00Z' },
    ])
    expect(days.get('a')).toBe(1)
    expect(days.has('')).toBe(false)
  })
})

describe('maskUserId', () => {
  it('shows only the last four hex chars', () => {
    expect(maskUserId('aaaaaaaa-bbbb-cccc-dddd-eeeeffff1234')).toBe('User ··1234')
  })
})

describe('userLabel', () => {
  it('prefers email over masked id', () => {
    expect(userLabel('aaaaaaaa-bbbb-cccc-dddd-eeeeffff1234', 'a@example.com')).toBe(
      'a@example.com',
    )
    expect(userLabel('aaaaaaaa-bbbb-cccc-dddd-eeeeffff1234', '')).toBe('User ··1234')
  })
})

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([1, 3, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(3) // round((2+3)/2)
  })
  it('returns null for empty', () => {
    expect(median([])).toBeNull()
  })
})

describe('weekStartUtc', () => {
  it('returns Monday for a Wednesday', () => {
    // 2026-08-05 is Wednesday
    expect(weekStartUtc('2026-08-05T15:00:00Z')).toBe('2026-08-03')
  })
})

describe('buildFunnel', () => {
  const users = [
    { id: 'a', created_at: iso(40) },
    { id: 'b', created_at: iso(20) },
    { id: 'c', created_at: iso(10) },
    { id: 'd', created_at: iso(5) },
  ]
  const profiles = [
    { id: 'a', tailors_used: 6 },
    { id: 'b', tailors_used: 1 },
    { id: 'c', tailors_used: 0 },
    { id: 'd', tailors_used: 0 },
  ]
  const runs = [
    { user_id: 'a', created_at: iso(9) },
    { user_id: 'a', created_at: iso(4) },
    { user_id: 'b', created_at: iso(3) },
  ]
  const tracked = [{ user_id: 'a' }]

  it('reports each stage with honest conversions', () => {
    const f = buildFunnel({ users, profiles, runs, tracked })
    const by = Object.fromEntries(f.map((s) => [s.key, s]))

    expect(by.signed_up.count).toBe(4)
    expect(by.activated.count).toBe(2) // a and b
    expect(by.activated.conversionFromPrev).toBe(50)
    expect(by.returned.count).toBe(1) // only a ran on 2 separate days
    expect(by.returned.conversionFromPrev).toBe(50) // 1 of 2 activated
    expect(by.tracking.count).toBe(1)
  })

  it('never lets a stage exceed the one above it', () => {
    const f = buildFunnel({ users, profiles, runs, tracked })
    for (let i = 1; i < f.length; i++) {
      expect(f[i].count).toBeLessThanOrEqual(f[i - 1].count)
      expect(f[i].conversionFromPrev ?? 0).toBeLessThanOrEqual(100)
    }
  })

  it('excludes tracked jobs from users who never activated', () => {
    const f = buildFunnel({
      users,
      profiles,
      runs,
      tracked: [{ user_id: 'a' }, { user_id: 'c' }],
    })
    expect(f.find((s) => s.key === 'tracking')!.count).toBe(1)
  })

  it('survives an empty instance without dividing by zero', () => {
    const f = buildFunnel({ users: [], profiles: [], runs: [], tracked: [] })
    for (const stage of f) {
      expect(Number.isFinite(stage.count)).toBe(true)
      expect(Number.isFinite(stage.shareOfTotal)).toBe(true)
    }
  })
})

describe('buildOutcomeFunnel', () => {
  it('keeps every stage a subset of the previous', () => {
    const f = buildOutcomeFunnel({
      users: [
        { id: 'a', created_at: iso(40) },
        { id: 'b', created_at: iso(20) },
        { id: 'c', created_at: iso(10) },
      ],
      profiles: [
        { id: 'a', tailors_used: 3 },
        { id: 'b', tailors_used: 1 },
        { id: 'c', tailors_used: 0 },
      ],
      runs: [
        { user_id: 'a', created_at: iso(9) },
        { user_id: 'a', created_at: iso(4) },
        { user_id: 'b', created_at: iso(3) },
      ],
      tracked: [
        { user_id: 'a', status: 'offer' },
        { user_id: 'b', status: 'applied' }, // activated but not returned — excluded from tracking+
      ],
    })
    for (let i = 1; i < f.length; i++) {
      expect(f[i].count).toBeLessThanOrEqual(f[i - 1].count)
    }
    const by = Object.fromEntries(f.map((s) => [s.key, s]))
    expect(by.tracking.count).toBe(1) // only a (returned)
    expect(by.applied.count).toBe(1)
    expect(by.offer.count).toBe(1)
  })
})

describe('buildQualityMetrics', () => {
  it('computes median, buckets, and rates', () => {
    const q = buildQualityMetrics(
      [
        {
          user_id: 'a',
          created_at: iso(1),
          match_score: 50,
          feedback: { rating: 'up' },
          edited_at: iso(1),
          cover_letter: 'Dear hiring manager',
        },
        {
          user_id: 'a',
          created_at: iso(2),
          match_score: 70,
          feedback: { rating: 'down' },
          edited_at: null,
          cover_letter: '',
        },
        {
          user_id: 'b',
          created_at: iso(1),
          match_score: 90,
          feedback: null,
          edited_at: null,
          cover_letter: null,
        },
      ],
      2,
    )
    expect(q.medianScore).toBe(70)
    expect(q.scoreBuckets).toEqual({ low: 1, medium: 1, strong: 1 })
    expect(q.feedbackRate).toBe(50)
    expect(q.editRate).toBe(33)
    expect(q.coverLetterRate).toBe(33)
    expect(q.runsPerActivated).toBe(1.5)
  })
})

describe('buildWeeklyCohorts', () => {
  it('groups signups by ISO week and rates 7-day activation', () => {
    const now = new Date('2026-08-06T12:00:00Z') // Thursday
    const cohorts = buildWeeklyCohorts({
      users: [
        { id: 'a', created_at: '2026-08-04T10:00:00Z' }, // this week Mon+
        { id: 'b', created_at: '2026-07-28T10:00:00Z' }, // prior week
      ],
      runs: [
        { user_id: 'a', created_at: '2026-08-05T10:00:00Z' },
        { user_id: 'b', created_at: '2026-08-10T10:00:00Z' }, // >7d after signup
      ],
      tracked: [],
      weeks: 2,
      now,
    })
    expect(cohorts).toHaveLength(2)
    const thisWeek = cohorts[1]
    expect(thisWeek.signedUp).toBe(1)
    expect(thisWeek.tailoredIn7d).toBe(1)
    expect(thisWeek.tailoredRate).toBe(100)
  })
})

describe('buildStuckBuckets', () => {
  it('shows email when available', () => {
    const stuck = buildStuckBuckets({
      users: [{
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff9999',
        created_at: iso(10),
        email: 'stuck@example.com',
      }],
      profiles: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff9999', tailors_used: 0 }],
      runs: [],
      tracked: [],
      now: new Date(),
    })
    const never = stuck.find((b) => b.key === 'never_tailored')!
    expect(never.count).toBe(1)
    expect(never.users[0]).toBe('stuck@example.com')
  })

  it('falls back to masked id when email is missing', () => {
    const stuck = buildStuckBuckets({
      users: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff9999', created_at: iso(10) }],
      profiles: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff9999', tailors_used: 0 }],
      runs: [],
      tracked: [],
      now: new Date(),
    })
    expect(stuck.find((b) => b.key === 'never_tailored')!.users[0]).toBe('User ··9999')
  })
})

describe('timeToFirstTailorHours', () => {
  it('returns median hours from signup to first run', () => {
    const now = new Date()
    const users = [{ id: 'a', created_at: iso(2) }]
    const runs = [{ user_id: 'a', created_at: iso(2, 18) }] // +6h same day if hour set
    // iso(2) at hour 12, run at hour 18 same day → 6h
    const h = timeToFirstTailorHours(users, runs, 30, now)
    expect(h).toBe(6)
  })
})

describe('activationRate', () => {
  it('is the share of signups that ever finished a tailor', () => {
    const r = activationRate(
      [{ id: 'a', created_at: iso(1) }, { id: 'b', created_at: iso(1) }],
      [{ id: 'a', tailors_used: 3 }, { id: 'b', tailors_used: 0 }],
    )
    expect(r).toEqual({ rate: 50, activated: 1, total: 2 })
  })

  it('does not move when signups grow but nobody activates', () => {
    const before = activationRate(
      [{ id: 'a', created_at: iso(1) }],
      [{ id: 'a', tailors_used: 1 }],
    )
    const after = activationRate(
      [{ id: 'a', created_at: iso(1) }, { id: 'b', created_at: iso(1) }],
      [{ id: 'a', tailors_used: 1 }, { id: 'b', tailors_used: 0 }],
    )
    expect(before.rate).toBe(100)
    expect(after.rate).toBe(50)
  })

  it('returns 0 rather than NaN with no users', () => {
    expect(activationRate([], []).rate).toBe(0)
  })
})

describe('weeklyActiveTailorers', () => {
  it('counts distinct users who produced something in 7 days', () => {
    const n = weeklyActiveTailorers([
      { user_id: 'a', created_at: iso(1) },
      { user_id: 'a', created_at: iso(2) },
      { user_id: 'b', created_at: iso(6) },
      { user_id: 'c', created_at: iso(20) },
    ])
    expect(n).toBe(2)
  })
})

describe('recentCohortActivation', () => {
  it('only counts a first run inside the users first 7 days', () => {
    const users = [
      { id: 'fast', created_at: iso(20) },
      { id: 'slow', created_at: iso(20) },
      { id: 'never', created_at: iso(20) },
    ]
    const runs = [
      { user_id: 'fast', created_at: iso(18) },
      { user_id: 'slow', created_at: iso(2) },
    ]
    const r = recentCohortActivation(users, runs, 30)
    expect(r).toEqual({ rate: 33, activated: 1, total: 3 })
  })

  it('ignores users who signed up before the cohort window', () => {
    const r = recentCohortActivation(
      [{ id: 'old', created_at: iso(90) }],
      [{ user_id: 'old', created_at: iso(89) }],
      30,
    )
    expect(r.total).toBe(0)
    expect(r.rate).toBe(0)
  })
})

describe('buildVolumeMetrics', () => {
  it('counts users, activity windows, and daily series without PII', () => {
    const now = new Date()
    const v = buildVolumeMetrics({
      users: [
        { id: 'a', created_at: iso(1), last_sign_in_at: iso(0) },
        { id: 'b', created_at: iso(10), last_sign_in_at: iso(20) },
      ],
      profiles: [
        { id: 'a', tailors_used: 3, plan: 'pro' },
        { id: 'b', tailors_used: 0, plan: 'free' },
      ],
      runs30d: [
        { user_id: 'a', created_at: iso(1) },
        { user_id: 'a', created_at: iso(2) },
      ],
      tracked: [
        { user_id: 'a', status: 'offer' },
        { user_id: 'a', status: 'saved' },
      ],
      loginAts: [iso(1), iso(1), iso(2)],
      now,
    })
    expect(v.totalUsers).toBe(2)
    expect(v.neverTailored).toBe(1)
    expect(v.proUsers).toBe(1)
    expect(v.dau).toBe(1)
    expect(v.tailorRuns30d).toBe(2)
    expect(v.tailorRunsAllTime).toBe(3)
    expect(v.trackedJobs).toBe(2)
    expect(v.offers).toBe(1)
    expect(v.signupsPerDay).toHaveLength(30)
    expect(v.tailorsPerDay).toHaveLength(14)
    expect(v.topTailorers[0]).toEqual({
      label: 'User ··A',
      email: null,
      tailors: 3,
    })
  })

  it('labels top tailorers with email when present', () => {
    const v = buildVolumeMetrics({
      users: [{ id: 'a', created_at: iso(1), email: 'top@example.com' }],
      profiles: [{ id: 'a', tailors_used: 4, plan: 'free' }],
      runs30d: [{ user_id: 'a', created_at: iso(1) }],
      tracked: [],
    })
    expect(v.topTailorers[0].label).toBe('top@example.com')
    expect(v.topTailorers[0].email).toBe('top@example.com')
  })
})

describe('buildProductHealth', () => {
  it('returns activity directory with emails for admin viewers', () => {
    const health = buildProductHealth({
      users: [{ id: 'a', created_at: iso(5), email: 'a@example.com', last_sign_in_at: iso(1) }],
      profiles: [{ id: 'a', tailors_used: 1 }],
      runs: [{ user_id: 'a', created_at: iso(4), match_score: 80 }],
      tracked: [{ user_id: 'a', status: 'saved' }],
      recentLogins: [{ email: 'a@example.com', created_at: iso(1) }],
    })
    expect(health.headlines.weeklyActiveTailorers).toBeGreaterThanOrEqual(0)
    expect(health.volume.totalUsers).toBe(1)
    expect(health.activity.users[0].email).toBe('a@example.com')
    expect(health.activity.recentLogins[0].email).toBe('a@example.com')
    expect(health.outcomeFunnel.length).toBe(7)
    expect(JSON.stringify(health)).not.toMatch(/"ip"/)
  })
})
