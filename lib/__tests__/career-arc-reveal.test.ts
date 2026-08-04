import { describe, expect, it } from 'vitest'
import type { CareerProfileSections } from '@/lib/anthropic'
import type { EvidenceRow } from '@/lib/career-arc-ledger'
import { buildRevealSlides, isDarkSlide, type RevealSlide } from '@/lib/career-arc-reveal'

const sections = (over: Partial<CareerProfileSections> = {}): CareerProfileSections => ({
  identity: { name: 'Amara Okafor', roleLine: 'Operations leader', supportingLine: '' },
  stats: [{ label: '9 years', value: '9' }, { label: '4 roles', value: '4' }] as CareerProfileSections['stats'],
  achievements: [],
  timeline: [
    { title: 'Ops Assistant', company: 'Wilko', start: '2017', end: '2019', highlights: [] },
    { title: 'Ops Lead', company: 'Deliveroo', start: '2023', end: 'Present', highlights: [] },
  ],
  organisations: [], skills: [],
  growth: { fromTitle: 'Ops Assistant', toTitle: 'Ops Lead', tenureYears: 9, milestones: [] },
  chapters: [],
  story: { origin: 'I started on a shop floor.', turningPoint: '', ambition: '' },
  projects: [], qualities: [],
  ...over,
})

const card = (id: string, over: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id, category: 'quant', claim: `Saved £1.2m at scale ${id}`, source_role: 'Ops Lead',
  source_company: 'Deliveroo', source_span: '', cv_line: 14, pinned: false, hidden: false,
  rephrased_text: null, sort_order: 0, ...over,
})

const kinds = (slides: RevealSlide[]) => slides.map((s) => s.kind)

describe('buildRevealSlides', () => {
  it('opens on the proof count and closes on the stamp', () => {
    const slides = buildRevealSlides(sections(), [card('a')])
    expect(slides[0]).toEqual({ kind: 'proofs', count: 1 })
    expect(slides.at(-1)).toMatchObject({ kind: 'final', firstName: 'Amara', count: 1 })
  })

  it('runs the full six beats when the data supports them', () => {
    const slides = buildRevealSlides(sections(), [card('a')])
    expect(kinds(slides)).toEqual(['proofs', 'span', 'origin', 'climb', 'number', 'final'])
  })

  it('drops the proofs beat entirely when the bank is empty', () => {
    const slides = buildRevealSlides(sections(), [])
    expect(kinds(slides)).toEqual(['span', 'origin', 'climb', 'final'])
  })

  it('never counts hidden cards toward the thesis', () => {
    const slides = buildRevealSlides(sections(), [card('a'), card('h', { hidden: true })])
    expect(slides[0]).toEqual({ kind: 'proofs', count: 1 })
  })

  it('picks the most-reused quantified card as the hero number, with its source', () => {
    const slides = buildRevealSlides(
      sections(),
      [card('a', { claim: 'Saved £250k once', sort_order: 0 }), card('b', { claim: 'Saved £1.2m per annum', sort_order: 1 })],
      { a: 1, b: 9 },
    )
    const number = slides.find((s) => s.kind === 'number')
    expect(number).toMatchObject({ figure: '£1.2M', source: 'Ops Lead · Deliveroo', cvLine: 14 })
  })

  it('omits the number beat when nothing is quantified — never invents one', () => {
    const slides = buildRevealSlides(sections(), [card('a', { claim: 'Led the team through a restructure' })])
    expect(kinds(slides)).not.toContain('number')
  })

  it('omits span, origin and climb when their data is missing', () => {
    const bare = sections({
      stats: [], timeline: [], story: { origin: '', turningPoint: '', ambition: '' },
      growth: { fromTitle: '', toTitle: '', tenureYears: null, milestones: [] },
    })
    expect(kinds(buildRevealSlides(bare, []))).toEqual(['final'])
  })

  it('alternates ink and cream so no two cream slides sit together', () => {
    const slides = buildRevealSlides(sections(), [card('a')])
    const darks = slides.map(isDarkSlide)
    expect(darks).toEqual([true, false, false, true, true, true])
  })
})
