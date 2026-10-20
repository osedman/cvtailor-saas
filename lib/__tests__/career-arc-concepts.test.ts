import { describe, expect, it } from 'vitest'
import type { CareerProfileSections } from '@/lib/anthropic'
import type { EvidenceRow } from '@/lib/career-arc-ledger'
import { deriveConceptData, isConceptId, seniorityRank } from '@/lib/career-arc-concepts'

const role = (title: string, company: string, start: string, end: string) => ({
  title, company, start, end, highlights: [],
})

const sections = (over: Partial<CareerProfileSections> = {}): CareerProfileSections => ({
  identity: { name: 'Amara Okafor', roleLine: '', supportingLine: '' },
  stats: [], achievements: [],
  timeline: [
    role('Ops Assistant', 'Wilko', '2017', '2019'),
    role('Ops Coordinator', 'Gousto', '2019', '2021'),
    role('Ops Manager', 'Gousto', '2021', '2023'),
    role('Ops Lead', 'Deliveroo', '2023', 'Present'),
  ],
  organisations: [], skills: [
    { name: 'WMS', category: 'Systems' }, { name: 'Forecasting', category: 'Systems' },
    { name: 'Coaching', category: 'People' },
  ] as CareerProfileSections['skills'],
  growth: { fromTitle: 'Ops Assistant', toTitle: 'Ops Lead', tenureYears: 9, milestones: [] },
  chapters: [], story: { origin: '', turningPoint: '', ambition: '' }, projects: [], qualities: [],
  ...over,
})

const card = (id: string, over: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id, category: 'quant', claim: `Claim ${id}`, source_role: 'Ops Lead', source_company: 'Deliveroo',
  source_span: '', cv_line: null, pinned: false, hidden: false, rephrased_text: null, sort_order: 0, ...over,
})

describe('seniorityRank', () => {
  it('reads rank words, defaulting mid when absent', () => {
    expect(seniorityRank('Head of Operations')).toBeGreaterThan(seniorityRank('Senior Analyst'))
    expect(seniorityRank('Senior Analyst')).toBeGreaterThan(seniorityRank('Ops Assistant'))
    expect(seniorityRank('Operations')).toBe(2)
  })
})

describe('isConceptId', () => {
  it('accepts only the four concepts', () => {
    expect(isConceptId('metro-map')).toBe(true)
    expect(isConceptId('../../etc/passwd')).toBe(false)
  })
})

describe('deriveConceptData — honest derivation only', () => {
  it('detects promotions as same-employer title changes, not job moves', () => {
    const d = deriveConceptData(sections(), [])
    expect(d.roles.map((r) => r.isPromotion)).toEqual([false, false, true, false])
    expect(d.promotions).toBe(1)
  })

  it('counts distinct employers case-insensitively', () => {
    const d = deriveConceptData(sections({
      timeline: [role('A', 'Gousto', '2019', '2021'), role('B', 'gousto ', '2021', '2023')],
    }), [])
    expect(d.employers).toEqual(['Gousto'])
  })

  it('builds the locker from real usage counts, most-used first', () => {
    const d = deriveConceptData(sections(), [card('a'), card('b', { sort_order: 1 })], { a: 2, b: 9 })
    expect(d.locker.map((l) => l.uses)).toEqual([9, 2])
    expect(d.totalReuses).toBe(11)
  })

  it('never counts hidden cards anywhere', () => {
    const d = deriveConceptData(sections(), [card('a'), card('h', { hidden: true })], { a: 1, h: 99 })
    expect(d.proofCount).toBe(1)
    expect(d.totalReuses).toBe(1)
    expect(d.locker).toHaveLength(1)
  })

  it('joins each category line at the role its first evidence is sourced to', () => {
    const d = deriveConceptData(sections(), [
      card('s', { category: 'systems', source_role: 'Ops Coordinator', sort_order: 0 }),
      card('q', { category: 'quant', source_role: 'Ops Lead', sort_order: 1 }),
    ])
    const systems = d.categoryLines.find((l) => l.category === 'systems')!
    const quant = d.categoryLines.find((l) => l.category === 'quant')!
    expect(systems.joinsAt).toBe(1)
    expect(quant.joinsAt).toBe(3)
  })

  it('groups skills by category as names, never as scores', () => {
    const d = deriveConceptData(sections(), [])
    const systems = d.skillGroups.find((g) => g.category === 'Systems')!
    expect(systems.names).toEqual(['WMS', 'Forecasting'])
    expect(JSON.stringify(d.skillGroups)).not.toMatch(/\d{2,}/)
  })

  it('builds the feed from real dated events, newest first', () => {
    const d = deriveConceptData(sections(), [card('a')])
    expect(d.feed[0].kind).toBe('evidence')
    expect(d.feed.some((f) => f.kind === 'promotion' && /Ops Manager/.test(f.text))).toBe(true)
  })

  it('survives an empty profile without inventing anything', () => {
    const empty = deriveConceptData(sections({ timeline: [], skills: [], growth: { fromTitle: '', toTitle: '', tenureYears: null, milestones: [] } }), [])
    expect(empty.roles).toEqual([])
    expect(empty.period).toBe('')
    expect(empty.promotions).toBe(0)
    expect(empty.proofCount).toBe(0)
  })
})
