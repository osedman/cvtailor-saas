import { describe, it, expect } from 'vitest'
import {
  buildFunnel,
  activationRate,
  weeklyActiveTailorers,
  recentCohortActivation,
  distinctRunDaysByUser,
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
    // 'c' tracked a job but has zero tailors — it must not inflate the stage
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

describe('activationRate', () => {
  it('is the share of signups that ever finished a tailor', () => {
    const r = activationRate(
      [{ id: 'a', created_at: iso(1) }, { id: 'b', created_at: iso(1) }],
      [{ id: 'a', tailors_used: 3 }, { id: 'b', tailors_used: 0 }]
    )
    expect(r).toEqual({ rate: 50, activated: 1, total: 2 })
  })

  it('does not move when signups grow but nobody activates', () => {
    const before = activationRate(
      [{ id: 'a', created_at: iso(1) }],
      [{ id: 'a', tailors_used: 1 }]
    )
    const after = activationRate(
      [{ id: 'a', created_at: iso(1) }, { id: 'b', created_at: iso(1) }],
      [{ id: 'a', tailors_used: 1 }, { id: 'b', tailors_used: 0 }]
    )
    expect(before.rate).toBe(100)
    expect(after.rate).toBe(50) // honest: dilution shows
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
      { user_id: 'c', created_at: iso(20) }, // outside the window
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
      { user_id: 'fast', created_at: iso(18) }, // 2 days after signup
      { user_id: 'slow', created_at: iso(2) },  // 18 days after signup
    ]
    const r = recentCohortActivation(users, runs, 30)
    expect(r).toEqual({ rate: 33, activated: 1, total: 3 })
  })

  it('ignores users who signed up before the cohort window', () => {
    const r = recentCohortActivation(
      [{ id: 'old', created_at: iso(90) }],
      [{ user_id: 'old', created_at: iso(89) }],
      30
    )
    expect(r.total).toBe(0)
    expect(r.rate).toBe(0)
  })
})
