import { describe, expect, it } from 'vitest'
import type { CareerProfileSections } from '@/lib/anthropic'
import type { EvidenceRow } from '@/lib/career-arc-ledger'
import {
  DEFAULT_SHARE_SETTINGS,
  bandClaim,
  bandLeaksFigures,
  buildPublicArc,
  generateShareToken,
  maskClaim,
  remapClaimRedactions,
  isValidShareToken,
  validateShareSettings,
  type ShareSettings,
} from '@/lib/career-arc-share'

const sections = (): CareerProfileSections => ({
  identity: { name: 'Amara Okafor', roleLine: 'Operations leader', supportingLine: '' },
  stats: [],
  achievements: [],
  timeline: [
    { title: 'Ops Assistant', company: 'Wilko', start: '2017', end: '2019', highlights: [] },
    { title: 'Ops Manager', company: 'Gousto', start: '2019', end: '2023', highlights: [] },
    { title: 'Ops Lead', company: 'Deliveroo', start: '2023', end: 'Present', highlights: [] },
  ],
  organisations: [
    { name: 'Wilko', roleCount: 1, span: '' },
    { name: 'Gousto', roleCount: 1, span: '' },
    { name: 'Deliveroo', roleCount: 1, span: '' },
  ],
  skills: [],
  growth: { fromTitle: 'Ops Assistant', toTitle: 'Ops Lead', tenureYears: 9, milestones: [] },
  chapters: [
    { span: '2017-2019', name: 'Foundations', summary: 'Retail ops' },
    { span: '2019-2021', name: 'Break — carer for a parent', summary: 'Returned Feb 2021' },
    { span: '2021-2026', name: 'Leading', summary: 'Automation era' },
  ],
  story: { origin: '', turningPoint: '', ambition: '' },
  projects: [],
  qualities: [],
})

const row = (id: string, over: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id,
  category: 'quant',
  claim: `Claim ${id}`,
  source_role: 'Ops Lead',
  source_company: 'Deliveroo',
  source_span: '2023—26',
  cv_line: 4,
  pinned: false,
  hidden: false,
  rephrased_text: null,
  sort_order: 0,
  ...over,
})

const settings = (over: Partial<ShareSettings> = {}): ShareSettings => ({
  ...DEFAULT_SHARE_SETTINGS,
  claimRedactions: {},
  ...over,
})

const build = (evidence: EvidenceRow[], s: ShareSettings) =>
  buildPublicArc({ sections: sections(), evidence, settings: s, sharedOn: '2 Aug 2026', expiresOn: null })

describe('generateShareToken', () => {
  it('produces unique 32-char URL-safe tokens', () => {
    const a = generateShareToken()
    const b = generateShareToken()
    expect(a).not.toBe(b)
    expect(isValidShareToken(a)).toBe(true)
    expect(isValidShareToken('short')).toBe(false)
    expect(isValidShareToken(`${a.slice(0, 31)}!`)).toBe(false)
  })
})

describe('bandClaim', () => {
  it('bands money to figure words', () => {
    expect(bandClaim('Saved £1.2m per annum')).toBe('Saved ⟪seven-figure⟫ per annum')
    expect(bandClaim('recovering $3M+ in value')).toBe('recovering ⟪seven-figure⟫ in value')
    expect(bandClaim('a €250k budget')).toBe('a ⟪six-figure⟫ budget')
  })

  it('bands percentages by magnitude', () => {
    expect(bandClaim('cut time by 80%')).toBe('cut time by ⟪double-digit %⟫')
    expect(bandClaim('recovered 4% premium')).toBe('recovered ⟪single-digit %⟫ premium')
  })

  it('bands plain counts', () => {
    expect(bandClaim('teams of 34 people')).toBe('teams of ⟪30+⟫ people')
    expect(bandClaim('across 4 sites')).toBe('across ⟪multiple⟫ sites')
  })

  it('never leaks a digit outside markers', () => {
    const claims = [
      'Saved £1.2m and cut onboarding from 6 weeks to 9 days across 4 sites (80% faster, 34 people, $3M+).',
      'Delivered 3 workflows recovering 4% missing premium equity in 2023.',
    ]
    for (const c of claims) {
      expect(bandLeaksFigures(bandClaim(c))).toBe(false)
    }
  })
})

describe('buildPublicArc — the serialization boundary', () => {
  it('never emits hidden or hide-redacted cards', () => {
    const out = build(
      [row('a'), row('b', { hidden: true }), row('c')],
      settings({ claimRedactions: { c: 'hide' } }),
    )
    expect(out.cards).toHaveLength(1)
    expect(JSON.stringify(out)).not.toContain('Claim b')
    expect(JSON.stringify(out)).not.toContain('Claim c')
  })

  it('banded cards carry no raw figures', () => {
    const out = build(
      [row('a', { claim: 'Saved £1.2m across 4 sites with 34 people' })],
      settings({ claimRedactions: { a: 'band' } }),
    )
    expect(out.cards[0].banded).toBe(true)
    expect(bandLeaksFigures(out.cards[0].text)).toBe(false)
    expect(out.cards[0].text).not.toContain('1.2')
  })

  it('reduces to first name by default and keeps full name only when asked', () => {
    expect(build([], settings()).displayName).toBe('Amara')
    expect(build([], settings({ firstNameOnly: false })).displayName).toBe('Amara Okafor')
  })

  it('drops break chapters by default, keeps them when included', () => {
    const def = build([], settings())
    expect(def.chapters.map((c) => c.name)).toEqual(['Foundations', 'Leading'])
    const inc = build([], settings({ includeBreak: true }))
    expect(inc.chapters).toHaveLength(3)
  })

  it('strips employers everywhere when hidden', () => {
    const out = build([row('a')], settings({ hideEmployers: true }))
    const json = JSON.stringify(out)
    expect(json).not.toContain('Deliveroo')
    expect(json).not.toContain('Gousto')
    expect(json).not.toContain('Wilko')
    expect(out.glance.some((g) => /employer/i.test(g.label))).toBe(false)
  })

  it('strips years when dates are hidden but keeps tenure', () => {
    const out = build([], settings({ hideDates: true }))
    expect(out.period).toBe('9 years')
    expect(out.nodes.every((n) => n.year === '')).toBe(true)
    expect(out.chapters.every((c) => c.span === '')).toBe(true)
  })
})

describe('validateShareSettings', () => {
  const own = new Set(['a', 'b'])

  it('accepts a valid patch', () => {
    const s = validateShareSettings(
      { claimRedactions: { a: 'band', b: 'hide' }, includeBreak: true },
      own,
    )
    expect(s).toEqual({
      claimRedactions: { a: 'band', b: 'hide' },
      firstNameOnly: true,
      hideEmployers: false,
      hideDates: false,
      includeBreak: true,
    })
  })

  it('rejects unknown card ids, bad values and junk shapes', () => {
    expect(validateShareSettings({ claimRedactions: { zzz: 'band' } }, own)).toBeNull()
    expect(validateShareSettings({ claimRedactions: { a: 'blur' } }, own)).toBeNull()
    expect(validateShareSettings({ claimRedactions: 'all' }, own)).toBeNull()
    expect(validateShareSettings({ firstNameOnly: 'yes' }, own)).toBeNull()
    expect(validateShareSettings([], own)).toBeNull()
    expect(validateShareSettings(null, own)).toBeNull()
  })
})

describe('mask redaction', () => {
  it('blacks out every figure and leaks no digits', () => {
    const masked = maskClaim('Saved £1.2m across 4 sites with 34 people, up 80%')
    expect(masked).not.toMatch(/\d/)
    expect(masked).toContain('████')
    expect(masked).toContain('Saved')
  })

  it('uses a fixed bar width so magnitude cannot be inferred from length', () => {
    const small = maskClaim('saved 4')
    const large = maskClaim('saved 4200000')
    expect(small).toBe(large)
  })

  it('marks masked cards distinctly from banded ones', () => {
    const out = build([row('a', { claim: 'Saved £1.2m per annum' })], settings({ claimRedactions: { a: 'mask' } }))
    expect(out.cards[0].masked).toBe(true)
    expect(out.cards[0].banded).toBe(true)
    expect(out.cards[0].text).not.toMatch(/1\.2/)
  })

  it('accepts mask in validated settings', () => {
    expect(validateShareSettings({ claimRedactions: { a: 'mask' } }, new Set(['a']))?.claimRedactions.a).toBe('mask')
  })
})

describe('promotions stat', () => {
  it('counts same-employer title changes and omits the stat at zero', () => {
    const promoted = buildPublicArc({
      sections: { ...sections(), timeline: [
        { title: 'Ops Coordinator', company: 'Gousto', start: '2019', end: '2021', highlights: [] },
        { title: 'Ops Manager', company: 'Gousto', start: '2021', end: '2023', highlights: [] },
      ] },
      evidence: [], settings: settings(), sharedOn: '', expiresOn: null,
    })
    expect(promoted.glance.find((g) => /Promotion/.test(g.label))?.value).toBe(1)
    expect(build([], settings()).glance.some((g) => /Promotion/.test(g.label))).toBe(false)
  })
})

describe('remapClaimRedactions — choices survive rebuilds', () => {
  const oldCard = (id: string, claim: string, rephrased: string | null = null) => ({ id, claim, rephrased_text: rephrased })

  it('keeps entries whose ids still exist, untouched', () => {
    const cards = [oldCard('a', 'Saved £1.2m per annum')]
    const { remapped, changed } = remapClaimRedactions(cards, cards, { a: 'band' })
    expect(remapped).toEqual({ a: 'band' })
    expect(changed).toBe(false)
  })

  it('follows a claim to its new id on exact normalized match', () => {
    const { remapped, changed } = remapClaimRedactions(
      [oldCard('old1', 'Saved £1.2m per annum through process automation')],
      [oldCard('new1', 'Saved £1.2M   per annum through process automation')],
      { old1: 'mask' },
    )
    expect(remapped).toEqual({ new1: 'mask' })
    expect(changed).toBe(true)
  })

  it('follows a lightly reworded claim via token overlap', () => {
    const { remapped } = remapClaimRedactions(
      [oldCard('old1', 'Developed RPA solutions using UiPath, reducing task completion time by 80% and saving over $3M annually')],
      [oldCard('new1', 'Developed and implemented RPA solutions using UiPath, reducing task completion time by up to 80% and saving over $3M annually')],
      { old1: 'band' },
    )
    expect(remapped).toEqual({ new1: 'band' })
  })

  it('drops the entry when the claim is genuinely gone — never jumps to an unrelated card', () => {
    const { remapped, changed } = remapClaimRedactions(
      [oldCard('old1', 'Ran the warehouse night shift for two winters')],
      [oldCard('new1', 'Saved £1.2m per annum through process automation')],
      { old1: 'hide' },
    )
    expect(remapped).toEqual({})
    expect(changed).toBe(true)
  })

  it('never maps two old entries onto one new card', () => {
    const { remapped } = remapClaimRedactions(
      [oldCard('o1', 'Saved £1.2m per annum through automation'), oldCard('o2', 'Saved £1.2m per annum through automations')],
      [oldCard('n1', 'Saved £1.2m per annum through automation')],
      { o1: 'band', o2: 'hide' },
    )
    expect(Object.keys(remapped)).toEqual(['n1'])
  })

  it('matches on the rephrased text when present', () => {
    const { remapped } = remapClaimRedactions(
      [oldCard('old1', 'original wording here', 'Cut £1.2m in annual cost by automating core processes')],
      [oldCard('new1', 'Cut £1.2m in annual cost by automating core processes')],
      { old1: 'band' },
    )
    expect(remapped).toEqual({ new1: 'band' })
  })
})
