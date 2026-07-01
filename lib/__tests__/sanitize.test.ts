import { describe, it, expect } from 'vitest'
import { stripDashPunctuation, sanitizeDeep } from '@/lib/sanitize'

describe('stripDashPunctuation', () => {
  it('replaces em dashes with a comma', () => {
    expect(stripDashPunctuation('Led the team — delivered on time')).toBe('Led the team, delivered on time')
  })

  it('replaces en dashes with a comma', () => {
    expect(stripDashPunctuation('Grew revenue – 20% year over year')).toBe('Grew revenue, 20% year over year')
  })

  it('replaces spaced hyphens used as sentence punctuation', () => {
    expect(stripDashPunctuation('Owned the roadmap - shipped three releases')).toBe('Owned the roadmap, shipped three releases')
  })

  it('preserves hyphenated compound words', () => {
    expect(stripDashPunctuation('ATS-safe, two-page CV')).toBe('ATS-safe, two-page CV')
  })

  it('preserves unspaced date ranges', () => {
    expect(stripDashPunctuation('Senior Analyst, 2021-2025')).toBe('Senior Analyst, 2021-2025')
  })

  it('preserves bullet markers at the start of a line', () => {
    const input = 'PROFILE\n- Led cross-functional team\n- Delivered ATS-safe rewrite'
    expect(stripDashPunctuation(input)).toBe(input)
  })

  it('cleans up double commas left by adjacent substitutions', () => {
    expect(stripDashPunctuation('First point — second point - third point')).toBe('First point, second point, third point')
  })

  it('does not leave a comma directly before terminal punctuation', () => {
    expect(stripDashPunctuation('We shipped it — great result.')).toBe('We shipped it, great result.')
  })
})

describe('sanitizeDeep', () => {
  it('sanitises strings inside nested objects and arrays', () => {
    const input = {
      tailoredCV: 'Led the team — delivered results',
      keyChanges: ['Added metric — 20% growth', 'Reworded summary'],
      nested: { gaps: ['Missing certification — recommend adding'] },
    }
    const result = sanitizeDeep(input)
    expect(result.tailoredCV).toBe('Led the team, delivered results')
    expect(result.keyChanges[0]).toBe('Added metric, 20% growth')
    expect(result.nested.gaps[0]).toBe('Missing certification, recommend adding')
  })

  it('leaves non-string values untouched', () => {
    const input = { matchScore: 87, active: true, tags: null }
    expect(sanitizeDeep(input)).toEqual(input)
  })
})
