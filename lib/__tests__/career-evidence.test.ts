import { describe, expect, it } from 'vitest'
import {
  claimUsedInText,
  computeUsageCounts,
  findCvLine,
  isSubstringOfCv,
  normalizeForMatch,
  numberTokens,
  validateEvidenceCards,
  validateRephrase,
} from '@/lib/career-evidence'

const CV = [
  'Amara Okafor',
  'Operations leader, London',
  '',
  'Ops Lead — Deliveroo (2023—26)',
  '- Rolled a warehouse management system across four sites, cutting supplier onboarding from six weeks to nine days',
  '- Saved £1.2m per annum through process automation',
  '',
  'Ops Manager — Gousto (2019—23)',
  '- Led three teams — 34 people — through a single unified workflow',
  '- Promoted during a company-wide restructure; retained 100% of the team',
].join('\n')

const card = (over: Partial<Record<string, unknown>> = {}) => ({
  category: 'quant',
  claim: 'Saved £1.2m per annum through process automation at Deliveroo.',
  sourceRole: 'Ops Lead',
  sourceCompany: 'Deliveroo',
  sourceSpan: '2023—26',
  cvLine: 6,
  ...over,
})

describe('normalizeForMatch', () => {
  it('collapses whitespace and case', () => {
    expect(normalizeForMatch('  Led   THREE\n teams ')).toBe('led three teams')
  })
})

describe('numberTokens', () => {
  it('captures money, percentages and counts without commas', () => {
    expect(numberTokens('Saved £1,200,000 (65%) across 34 people')).toEqual(['£1200000', '65%', '34'])
  })
})

describe('validateEvidenceCards', () => {
  it('keeps a fully supported card', () => {
    const out = validateEvidenceCards([card()], CV)
    expect(out).toHaveLength(1)
    expect(out[0].claim).toMatch(/£1.2m/)
    expect(out[0].cvLine).toBe(6)
  })

  it('drops a card whose figure is not in the CV (invented number)', () => {
    const out = validateEvidenceCards([card({ claim: 'Saved £4.7m per annum through process automation work.' })], CV)
    expect(out).toEqual([])
  })

  it('drops a quant card with no figure at all', () => {
    const out = validateEvidenceCards([card({ claim: 'Saved a very large amount through process automation.' })], CV)
    expect(out).toEqual([])
  })

  it('drops unknown categories, junk shapes, markup and duplicates; nulls bad line numbers', () => {
    const out = validateEvidenceCards(
      [
        card({ category: 'vibes' }),
        'not-an-object',
        card({ claim: '<b>Saved £1.2m per annum through automation</b>' }),
        card(),
        card(), // duplicate claim
        card({ category: 'scope', claim: 'Led three teams — 34 people — through a single unified workflow.', cvLine: 999 }),
      ],
      CV,
    )
    expect(out).toHaveLength(2)
    expect(out[1].cvLine).toBeNull()
  })

  it('returns empty for non-array input', () => {
    expect(validateEvidenceCards(undefined, CV)).toEqual([])
    expect(validateEvidenceCards({ evil: true }, CV)).toEqual([])
  })
})

describe('add-from-cv substring rule', () => {
  it('accepts exact CV text regardless of case and spacing', () => {
    expect(isSubstringOfCv(CV, 'saved £1.2m   per annum through PROCESS automation')).toBe(true)
  })

  it('rejects text not present in the CV', () => {
    expect(isSubstringOfCv(CV, 'Single-handedly rescued the Q4 launch')).toBe(false)
  })

  it('locates the supporting line', () => {
    expect(findCvLine(CV, 'Led three teams')).toBe(9)
    expect(findCvLine(CV, 'not in the cv')).toBeNull()
  })
})

describe('validateRephrase', () => {
  const original = 'Saved £1.2m per annum through process automation at Deliveroo.'

  it('accepts a wording-only change', () => {
    expect(validateRephrase(original, 'Cut £1.2m in annual cost by automating core processes at Deliveroo.')).toBeTruthy()
  })

  it('rejects a rephrase that introduces a new figure', () => {
    expect(validateRephrase(original, 'Saved £1.2m and boosted output 40% through automation at Deliveroo.')).toBeNull()
  })

  it('rejects markup, wrong types and out-of-bounds lengths', () => {
    expect(validateRephrase(original, '<script>x</script> saved £1.2m yearly')).toBeNull()
    expect(validateRephrase(original, 42 as unknown as string)).toBeNull()
    expect(validateRephrase(original, 'too short')).toBeNull()
  })
})

describe('usage counts', () => {
  const tailored = normalizeForMatch(
    JSON.stringify({ cv: 'Delivered £1.2m annual savings through process automation across Deliveroo operations' }),
  )

  it('counts a run that keeps the figures and most distinctive words', () => {
    expect(claimUsedInText('Saved £1.2m per annum through process automation at Deliveroo.', tailored)).toBe(true)
  })

  it('does not count a run missing the claim figure', () => {
    const other = normalizeForMatch(JSON.stringify({ cv: 'Improved processes through automation at Deliveroo' }))
    expect(claimUsedInText('Saved £1.2m per annum through process automation at Deliveroo.', other)).toBe(false)
  })

  it('prefers the rephrased text and maps counts by id', () => {
    const counts = computeUsageCounts(
      [
        { id: 'a', claim: 'Saved £1.2m per annum through process automation at Deliveroo.', rephrased_text: null },
        { id: 'b', claim: 'Led three teams — 34 people — through a single unified workflow.', rephrased_text: null },
      ],
      [tailored],
    )
    expect(counts).toEqual({ a: 1, b: 0 })
  })
})
