import { describe, it, expect } from 'vitest'
import { computeMatchScore, checkKeywords } from '@/lib/scoring'
import type { RequirementMapping } from '@/lib/anthropic'

function req(overrides: Partial<RequirementMapping>): RequirementMapping {
  return {
    requirement: 'Some requirement',
    type: 'must',
    keywords: [],
    strength: 'none',
    evidence: '',
    ...overrides,
  }
}

describe('computeMatchScore', () => {
  it('returns 0 for no requirements', () => {
    expect(computeMatchScore([])).toBe(0)
  })

  it('returns 100 when every must requirement is strong', () => {
    const reqs = [req({ strength: 'strong', type: 'must' }), req({ strength: 'strong', type: 'must' })]
    expect(computeMatchScore(reqs)).toBe(100)
  })

  it('returns 0 when every requirement has no evidence', () => {
    const reqs = [req({ strength: 'none' }), req({ strength: 'none' })]
    expect(computeMatchScore(reqs)).toBe(0)
  })

  it('weights must-have requirements twice as heavily as nice-to-have', () => {
    // One strong must (weight 2, earned 2) + one none nice-to-have (weight 1, earned 0)
    // => 2 / 3 = 66.67 rounds to 67
    const reqs = [req({ strength: 'strong', type: 'must' }), req({ strength: 'none', type: 'nice' })]
    expect(computeMatchScore(reqs)).toBe(67)
  })

  it('applies partial credit for transferable and partial strength', () => {
    const reqs = [req({ strength: 'transferable', type: 'must' })] // 0.6 * 2 / 2 = 60
    expect(computeMatchScore(reqs)).toBe(60)
    const reqs2 = [req({ strength: 'partial', type: 'must' })] // 0.25 * 2 / 2 = 25
    expect(computeMatchScore(reqs2)).toBe(25)
  })
})

describe('checkKeywords', () => {
  it('flags keywords present in the CV as present', () => {
    const reqs = [req({ keywords: ['stakeholder management'], strength: 'strong' })]
    const { present, missing } = checkKeywords(reqs, 'Experienced in stakeholder management across teams.')
    expect(present).toEqual(['stakeholder management'])
    expect(missing).toEqual([])
  })

  it('flags keywords absent from the CV as missing when strength is not none', () => {
    const reqs = [req({ keywords: ['Kubernetes'], strength: 'partial' })]
    const { present, missing } = checkKeywords(reqs, 'No container orchestration experience here.')
    expect(present).toEqual([])
    expect(missing).toEqual(['Kubernetes'])
  })

  it('does not flag a missing keyword as an ATS gap when strength is none', () => {
    const reqs = [req({ keywords: ['Kubernetes'], strength: 'none' })]
    const { present, missing } = checkKeywords(reqs, 'No container orchestration experience here.')
    expect(present).toEqual([])
    expect(missing).toEqual([])
  })

  it('deduplicates repeated keywords across requirements', () => {
    const reqs = [
      req({ keywords: ['SQL'], strength: 'strong' }),
      req({ keywords: ['sql'], strength: 'strong' }),
    ]
    const { present } = checkKeywords(reqs, 'Strong SQL skills.')
    expect(present).toEqual(['SQL'])
  })

  it('matching is case-insensitive', () => {
    const reqs = [req({ keywords: ['Python'], strength: 'strong' })]
    const { present } = checkKeywords(reqs, 'Five years of python development.')
    expect(present).toEqual(['Python'])
  })
})
