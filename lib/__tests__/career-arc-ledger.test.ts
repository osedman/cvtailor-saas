import { describe, expect, it } from 'vitest'
import type { CareerProfileSections } from '@/lib/anthropic'
import {
  PATH_CHART_MIN_ROLES,
  arcPeriod,
  deriveGlance,
  isBreakChapter,
  parseYear,
  pathLayout,
  type EvidenceRow,
} from '@/lib/career-arc-ledger'
import { countCvsUsingAny } from '@/lib/career-evidence'

const role = (title: string, company: string, start: string, end: string) => ({
  title, company, start, end, highlights: [],
})

const sections = (over: Partial<CareerProfileSections> = {}): CareerProfileSections => ({
  identity: { name: 'A', roleLine: '', supportingLine: '' },
  stats: [],
  achievements: [],
  timeline: [
    role('Ops Assistant', 'Wilko', '2017', '2019'),
    role('Ops Coordinator', 'Gousto', '2019', '2021'),
    role('Ops Manager', 'Gousto', '2021', '2023'),
    role('Ops Lead', 'Deliveroo', 'Jan 2023', 'Present'),
  ],
  organisations: [
    { name: 'Wilko', roleCount: 1, span: '' },
    { name: 'Gousto', roleCount: 2, span: '' },
    { name: 'Deliveroo', roleCount: 1, span: '' },
  ],
  skills: [],
  growth: { fromTitle: 'Ops Assistant', toTitle: 'Ops Lead', tenureYears: 9, milestones: [{ year: '2021', label: 'First senior title' }] },
  chapters: [
    { span: '2017-2019', name: 'The foundations', summary: '' },
    { span: '2019-2023', name: 'Going senior', summary: '' },
    { span: '2023-2026', name: 'Leading the change', summary: '' },
  ],
  story: { origin: '', turningPoint: '', ambition: '' },
  projects: [],
  qualities: [],
  ...over,
})

const evidenceRow = (id: string, over: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id, category: 'quant', claim: `claim ${id}`, source_role: '', source_company: '',
  source_span: '', cv_line: null, pinned: false, hidden: false, rephrased_text: null,
  sort_order: 0, ...over,
})

describe('parseYear / arcPeriod', () => {
  it('parses the first plausible year', () => {
    expect(parseYear('Jan 2023')).toBe(2023)
    expect(parseYear('nope')).toBeNull()
  })

  it('spans first start to current year when a role is Present', () => {
    expect(arcPeriod(sections().timeline)).toBe(`2017 — ${new Date().getFullYear()}`)
  })

  it('is empty when nothing parses', () => {
    expect(arcPeriod([role('X', 'Y', '?', '?')])).toBe('')
  })
})

describe('pathLayout', () => {
  it('returns null under the chart threshold', () => {
    const thin = sections({ timeline: [role('A', 'X', '2021', '2022'), role('B', 'X', '2024', 'Present')] })
    expect(thin.timeline.length).toBeLessThan(PATH_CHART_MIN_ROLES)
    expect(pathLayout(thin)).toBeNull()
  })

  it('lays nodes out ascending left-to-right', () => {
    const layout = pathLayout(sections())!
    expect(layout.nodes).toHaveLength(4)
    for (let i = 1; i < layout.nodes.length; i++) {
      expect(layout.nodes[i].x).toBeGreaterThan(layout.nodes[i - 1].x)
      expect(layout.nodes[i].y).toBeLessThan(layout.nodes[i - 1].y)
    }
    expect(layout.nodes.at(-1)!.isCurrent).toBe(true)
  })

  it('marks interior milestone years, never the endpoints', () => {
    const layout = pathLayout(sections())!
    expect(layout.nodes.map((n) => n.isMilestone)).toEqual([false, false, true, false])
  })
})

describe('deriveGlance', () => {
  it('produces the four ledger stats from full data', () => {
    const ev = [evidenceRow('a'), evidenceRow('b'), evidenceRow('c', { hidden: true })]
    const stats = deriveGlance(sections(), ev, { a: 3, b: 1, c: 9 }, 4)
    expect(stats).toEqual([
      { value: 3, label: 'Chapters · 9 years' },
      { value: 3, label: 'Employers' },
      { value: 2, label: 'Proofs on file' },
      { value: 4, label: 'Reuses in 4 CVs' },
    ])
  })

  it('omits stats with nothing behind them', () => {
    const bare = sections({ chapters: [], organisations: [], growth: { fromTitle: '', toTitle: '', tenureYears: null, milestones: [] } })
    expect(deriveGlance(bare, [], {}, 0)).toEqual([{ value: 0, label: 'Proofs on file' }])
  })
})

describe('isBreakChapter', () => {
  it('spots break-like chapter names only', () => {
    expect(isBreakChapter('Break — carer for a parent')).toBe(true)
    expect(isBreakChapter('Parental leave')).toBe(true)
    expect(isBreakChapter('Breaking into leadership')).toBe(false)
    expect(isBreakChapter('Going senior')).toBe(false)
  })
})

describe('countCvsUsingAny', () => {
  const cards = [
    { claim: 'Saved £1.2m per annum through process automation at Deliveroo.', rephrased_text: null },
    { claim: 'Led three teams — 34 people — through a single unified workflow.', rephrased_text: null },
  ]
  const usesFirst = JSON.stringify({ cv: 'Delivered £1.2m annual savings through process automation across Deliveroo operations' })
  const usesNone = JSON.stringify({ cv: 'General improvements to operations' })

  it('counts rows using at least one card, once each', () => {
    expect(countCvsUsingAny(cards, [usesFirst, usesNone, usesFirst])).toBe(2)
  })

  it('is zero with no cards or no matching rows', () => {
    expect(countCvsUsingAny([], [usesFirst])).toBe(0)
    expect(countCvsUsingAny(cards, [usesNone])).toBe(0)
  })
})
