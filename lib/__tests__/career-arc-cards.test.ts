import { describe, expect, it } from 'vitest'
import type { CareerProfileSections } from '@/lib/anthropic'
import type { EvidenceRow } from '@/lib/career-arc-ledger'
import { DEFAULT_SHARE_SETTINGS, type ShareSettings } from '@/lib/career-arc-share'
import {
  buildShareCards,
  displayFigure,
  pickDominantFigure,
  proudestSize,
  wrapBigText,
} from '@/lib/career-arc-cards'

const sections = (): CareerProfileSections => ({
  identity: { name: 'Amara Okafor', roleLine: '', supportingLine: '' },
  stats: [],
  achievements: [],
  timeline: [
    { title: 'Ops Assistant', company: 'Wilko', start: '2017', end: '2019', highlights: [] },
    { title: 'Ops Manager', company: 'Gousto', start: '2019', end: '2023', highlights: [] },
    { title: 'Ops Lead', company: 'Deliveroo', start: '2023', end: 'Present', highlights: [] },
  ],
  organisations: [],
  skills: [],
  growth: { fromTitle: '', toTitle: '', tenureYears: 9, milestones: [] },
  chapters: [
    { span: '2017-2019', name: 'Foundations', summary: '' },
    { span: '2019-2026', name: 'Leading', summary: '' },
  ],
  story: { origin: '', turningPoint: '', ambition: '' },
  projects: [],
  qualities: [],
})

const row = (id: string, over: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id, category: 'quant', claim: `Claim ${id}`, source_role: 'Ops Lead', source_company: 'Deliveroo',
  source_span: '2023—26', cv_line: 14, pinned: false, hidden: false, rephrased_text: null, sort_order: 0,
  ...over,
})

const settings = (over: Partial<ShareSettings> = {}): ShareSettings => ({
  ...DEFAULT_SHARE_SETTINGS, claimRedactions: {}, ...over,
})

const build = (evidence: EvidenceRow[], s: ShareSettings = settings()) =>
  buildShareCards({ sections: sections(), evidence, settings: s })

const ids = (cards: ReturnType<typeof build>) => cards.map((c) => c.id)

describe('pickDominantFigure / displayFigure', () => {
  it('prefers currency over percent over counts, longest first', () => {
    expect(pickDominantFigure('Saved £1.2m (80%) across 4 sites')).toBe('£1.2m')
    expect(pickDominantFigure('cut 80% across 4 sites')).toBe('80%')
    expect(pickDominantFigure('led 34 people over 4 sites')).toBe('34')
    expect(pickDominantFigure('no numbers here')).toBeNull()
  })

  it('tidies unit suffixes for display', () => {
    expect(displayFigure('£1.2m')).toBe('£1.2M')
    expect(displayFigure('$3M+')).toBe('$3M+')
    expect(displayFigure('80%')).toBe('80%')
  })
})

describe('wrapBigText / proudestSize', () => {
  it('wraps on spaces within the budget', () => {
    expect(wrapBigText('SIX WEEKS TO NINE DAYS', 10)).toEqual(['SIX WEEKS', 'TO NINE', 'DAYS'])
  })
  it('sizes down as claims get longer', () => {
    expect(proudestSize('short claim').size).toBeGreaterThan(proudestSize('x'.repeat(120)).size)
  })
})

describe('buildShareCards', () => {
  const quant = row('q', { claim: 'Saved £1.2m per annum through process automation' })
  const craftPinned = row('p', { category: 'craft', claim: 'Rolled a warehouse system across four sites', pinned: true })

  it('produces the full five-card set when everything is present', () => {
    const cards = build([quant, craftPinned])
    expect(ids(cards)).toEqual(['cover', 'number', 'proudest', 'path', 'cta'])
  })

  it('skips the Number card when no quantified claim survives — never fakes it', () => {
    expect(ids(build([craftPinned]))).toEqual(['cover', 'proudest', 'path', 'cta'])
    expect(ids(build([quant], settings({ claimRedactions: { q: 'hide' } })))).toEqual(['cover', 'path', 'cta'])
    const hiddenRow = build([row('q', { claim: 'Saved £1.2m', hidden: true })])
    expect(ids(hiddenRow)).toEqual(['cover', 'path', 'cta'])
  })

  it('skips the Proudest card when nothing is pinned', () => {
    expect(ids(build([quant]))).toEqual(['cover', 'number', 'path', 'cta'])
  })

  it('renders the figure on FULL and the band word on BAND, digit-free', () => {
    const full = build([quant]).find((c) => c.id === 'number')!
    expect(full.big.join(' ')).toBe('£1.2M')
    expect(full.chip).toContain('LINE 14')

    const banded = build([quant], settings({ claimRedactions: { q: 'band' } })).find((c) => c.id === 'number')!
    expect(banded.big.join(' ')).toBe('SEVEN-FIGURE')
    expect(banded.big.join(' ')).not.toMatch(/\d/)
    expect(banded.chip).toContain('THE FACT IS REAL')
  })

  it('applies identity redactions across every card', () => {
    const cards = build([quant, craftPinned], settings({ hideEmployers: true, hideDates: true }))
    const json = JSON.stringify(cards)
    expect(json).not.toContain('DELIVEROO')
    expect(json).not.toContain('2023')
    expect(cards[0].name).toBe('AMARA')
    expect(cards[0].footRight).toBe('9 YEARS')
  })

  it('keeps the full name when firstNameOnly is off', () => {
    const cards = build([quant], settings({ firstNameOnly: false }))
    expect(cards[0].name).toBe('AMARA OKAFOR')
  })

  it('bands the pinned claim on the Proudest card when its redaction is band', () => {
    const pinnedQuant = row('pq', { claim: 'Saved £1.2m across 4 sites', pinned: true })
    const cards = build([pinnedQuant], settings({ claimRedactions: { pq: 'band' } }))
    const proudest = cards.find((c) => c.id === 'proudest')!
    expect(proudest.big.join(' ')).not.toMatch(/\d/)
  })

  it('lays the path card nodes ascending with the current node last', () => {
    const path = build([quant]).find((c) => c.id === 'path')!
    const nodes = path.pathNodes!
    expect(nodes).toHaveLength(3)
    expect(nodes.at(-1)!.isCurrent).toBe(true)
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i].x).toBeGreaterThan(nodes[i - 1].x)
      expect(nodes[i].y).toBeLessThan(nodes[i - 1].y)
    }
  })
})
