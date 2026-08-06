import { describe, it, expect } from 'vitest'
import {
  buildQualityByOutcome,
  buildTimeToX,
  buildQuotaPressure,
  buildFeatureRetention,
  buildQuietUsers,
  countEnrichmentStuck,
  buildOpsAlerts,
  buildAdminInsights,
} from '@/lib/admin-insights'

const iso = (daysAgo: number, hour = 12) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

describe('buildQualityByOutcome', () => {
  it('computes median scores per tracker stage', () => {
    const rows = buildQualityByOutcome(
      [
        { user_id: 'a', created_at: iso(1), match_score: 60 },
        { user_id: 'b', created_at: iso(1), match_score: 80 },
        { user_id: 'c', created_at: iso(1), match_score: 90 },
      ],
      [
        { user_id: 'a', status: 'saved' },
        { user_id: 'b', status: 'applied' },
        { user_id: 'c', status: 'offer' },
      ],
    )
    const by = Object.fromEntries(rows.map((r) => [r.stage, r]))
    expect(by.offer.users).toBe(1)
    expect(by.offer.medianScore).toBe(90)
    expect(by.applied.users).toBe(2) // b + c
    expect(by.saved.users).toBe(3)
  })
})

describe('buildTimeToX', () => {
  it('medians the three journey legs', () => {
    const t = buildTimeToX({
      users: [{ id: 'a', created_at: iso(10), email: 'a@x.com' }],
      runs: [{ user_id: 'a', created_at: iso(10, 18) }], // +6h
      tracked: [
        { user_id: 'a', status: 'saved', created_at: iso(9) },
        { user_id: 'a', status: 'applied', created_at: iso(8), updated_at: iso(8) },
      ],
    })
    expect(t.signupToFirstTailorHours).toBe(6)
    expect(t.sampleSizes.signupToFirstTailor).toBe(1)
    expect(t.firstTailorToTrackHours).not.toBeNull()
    expect(t.trackToAppliedHours).not.toBeNull()
  })
})

describe('buildQuotaPressure', () => {
  it('flags free users near the daily wall', () => {
    const runs30d = Array.from({ length: 45 }, (_, i) => ({
      user_id: 'heavy',
      created_at: iso(i % 20),
    }))
    const q = buildQuotaPressure({
      users: [
        { id: 'heavy', created_at: iso(40), email: 'heavy@example.com' },
        { id: 'pro', created_at: iso(40), email: 'pro@example.com' },
      ],
      profiles: [
        { id: 'heavy', tailors_used: 45, plan: 'free' },
        { id: 'pro', tailors_used: 100, plan: 'pro' },
      ],
      runs30d,
    })
    expect(q.freeNearDailyWall).toBe(1)
    expect(q.nearWallEmails[0]).toBe('heavy@example.com')
    expect(q.proShare).toBe(50)
  })
})

describe('buildFeatureRetention', () => {
  it('counts adopters who tailored in each window', () => {
    const rows = buildFeatureRetention({
      adopters: {
        careerPath: ['a', 'b'],
        careerArc: ['a'],
        firstCv: [],
      },
      runs: [
        { user_id: 'a', created_at: iso(1) },
        { user_id: 'b', created_at: iso(20) },
      ],
    })
    const path = rows.find((r) => r.key === 'career_path')!
    expect(path.adopters).toBe(2)
    expect(path.active7d).toBe(1)
    expect(path.active30d).toBe(2)
  })
})

describe('buildQuietUsers', () => {
  it('lists recent activators who went dark', () => {
    const quiet = buildQuietUsers({
      users: [
        {
          id: 'a',
          created_at: iso(10),
          email: 'quiet@example.com',
          last_sign_in_at: iso(8),
        },
        {
          id: 'b',
          created_at: iso(10),
          email: 'active@example.com',
          last_sign_in_at: iso(1),
        },
      ],
      profiles: [
        { id: 'a', tailors_used: 2 },
        { id: 'b', tailors_used: 2 },
      ],
      runs: [
        { user_id: 'a', created_at: iso(9) },
        { user_id: 'b', created_at: iso(9) },
      ],
    })
    expect(quiet.map((q) => q.email)).toEqual(['quiet@example.com'])
  })
})

describe('countEnrichmentStuck', () => {
  it('counts core skills with empty plans', () => {
    expect(countEnrichmentStuck([
      { user_id: 'a', horizon: 'core', resources: [], project_brief: '' },
      { user_id: 'a', horizon: 'core', resources: [{ title: 'x' }], project_brief: '' },
      { user_id: 'a', horizon: 'quick', resources: [], project_brief: '' },
      { user_id: 'a', horizon: 'core', status: 'done', resources: [], project_brief: '' },
    ])).toBe(1)
  })
})

describe('buildOpsAlerts', () => {
  it('surfaces pending courses and mismatches', () => {
    const alerts = buildOpsAlerts({
      course: {
        pendingTotal: 12,
        pendingByProvider: { youtube: 12 },
        catalogActive: 100,
        catalogStale: 3,
        lastSync: {
          source: 'youtube',
          status: 'failed',
          started_at: iso(1),
          finished_at: iso(1),
          error: 'boom',
        },
      },
      authUsers: 10,
      profiles: 8,
      enrichmentStuck: 5,
    })
    expect(alerts.some((a) => a.key === 'courses_pending')).toBe(true)
    expect(alerts.some((a) => a.key === 'sync_failed')).toBe(true)
    expect(alerts.some((a) => a.key === 'auth_profile_mismatch')).toBe(true)
    expect(alerts.some((a) => a.key === 'enrichment_stuck')).toBe(true)
  })
})

describe('buildAdminInsights', () => {
  it('assembles a complete payload', () => {
    const insights = buildAdminInsights({
      users: [{ id: 'a', created_at: iso(5), email: 'a@example.com', last_sign_in_at: iso(1) }],
      profiles: [{ id: 'a', tailors_used: 2, plan: 'free' }],
      runs: [{ user_id: 'a', created_at: iso(4), match_score: 70 }],
      runs30d: [{ user_id: 'a', created_at: iso(4), match_score: 70 }],
      tracked: [{ user_id: 'a', status: 'applied', created_at: iso(3) }],
      roadmapItems: [],
      careerPathUsers: ['a'],
      careerArcUsers: [],
      firstCvUsers: [],
      course: {
        pendingTotal: 0,
        pendingByProvider: {},
        catalogActive: 10,
        catalogStale: 0,
        lastSync: null,
      },
    })
    expect(insights.qualityByOutcome.length).toBe(4)
    expect(insights.featureRetention[0].adopters).toBe(1)
    expect(insights.alerts.some((a) => a.key === 'all_clear')).toBe(true)
  })
})
