import { describe, it, expect } from 'vitest'
import { computeCareerSignal } from '@/lib/career-signal'
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

describe('computeCareerSignal', () => {
  it('returns nothing with fewer than 3 runs of history', () => {
    const runs = [
      [req({ keywords: ['SQL'], strength: 'none' })],
      [req({ keywords: ['SQL'], strength: 'none' })],
    ]
    expect(computeCareerSignal(runs)).toEqual([])
  })

  it('surfaces a keyword that recurs as weak across 2+ separate runs', () => {
    const runs = [
      [req({ keywords: ['SQL'], strength: 'none' })],
      [req({ keywords: ['SQL'], strength: 'partial' })],
      [req({ keywords: ['Python'], strength: 'strong' })],
    ]
    expect(computeCareerSignal(runs)).toEqual([{ keyword: 'sql', count: 2 }])
  })

  it('ignores strong and transferable evidence', () => {
    const runs = [
      [req({ keywords: ['SQL'], strength: 'strong' })],
      [req({ keywords: ['SQL'], strength: 'transferable' })],
      [req({ keywords: ['SQL'], strength: 'strong' })],
    ]
    expect(computeCareerSignal(runs)).toEqual([])
  })

  it('does not surface a keyword only weak once', () => {
    const runs = [
      [req({ keywords: ['SQL'], strength: 'none' })],
      [req({ keywords: ['Python'], strength: 'none' })],
      [req({ keywords: ['Excel'], strength: 'none' })],
    ]
    expect(computeCareerSignal(runs)).toEqual([])
  })

  it('dedupes repeated keywords within a single run', () => {
    const runs = [
      [req({ keywords: ['SQL'], strength: 'none' }), req({ keywords: ['SQL'], strength: 'partial' })],
      [req({ keywords: ['SQL'], strength: 'none' })],
      [req({ keywords: ['Python'], strength: 'strong' })],
    ]
    // SQL appears twice in run 1 but must only count once for that run
    expect(computeCareerSignal(runs)).toEqual([{ keyword: 'sql', count: 2 }])
  })

  it('matching is case-insensitive and trims whitespace', () => {
    const runs = [
      [req({ keywords: [' SQL '], strength: 'none' })],
      [req({ keywords: ['sql'], strength: 'none' })],
      [req({ keywords: ['Python'], strength: 'strong' })],
    ]
    expect(computeCareerSignal(runs)).toEqual([{ keyword: 'sql', count: 2 }])
  })

  it('returns at most the top 3 recurring keywords, sorted by frequency', () => {
    const runs = [
      [req({ keywords: ['SQL', 'Python', 'Excel', 'AWS'], strength: 'none' })],
      [req({ keywords: ['SQL', 'Python', 'Excel'], strength: 'none' })],
      [req({ keywords: ['SQL', 'Python'], strength: 'none' })],
      [req({ keywords: ['SQL'], strength: 'none' })],
    ]
    const result = computeCareerSignal(runs)
    expect(result.length).toBe(3)
    expect(result[0]).toEqual({ keyword: 'sql', count: 4 })
    expect(result[1]).toEqual({ keyword: 'python', count: 3 })
    expect(result[2]).toEqual({ keyword: 'excel', count: 2 })
  })
})
