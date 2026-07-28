import { describe, it, expect } from 'vitest'
import {
  isAllowedResourceUrl,
  filterAllowedResources,
  validateItemResources,
} from '@/lib/course-validation'

const r = (url: string, title = 'A course') => ({ url, title, source: 'x' })

describe('isAllowedResourceUrl', () => {
  it('accepts the platforms the 27 Jul sync chose', () => {
    expect(isAllowedResourceUrl('https://www.udemy.com/course/rpa-basics/')).toBe(true)
    expect(isAllowedResourceUrl('https://www.youtube.com/watch?v=abc123')).toBe(true)
    expect(isAllowedResourceUrl('https://youtu.be/abc123')).toBe(true)
    expect(isAllowedResourceUrl('https://www.freecodecamp.org/learn/sql')).toBe(true)
    expect(isAllowedResourceUrl('https://learn.microsoft.com/en-gb/training/')).toBe(true)
    expect(isAllowedResourceUrl('https://www.coursera.org/learn/python')).toBe(true)
  })

  it('rejects the university-course pattern the sync retired', () => {
    expect(isAllowedResourceUrl('https://www.open.edu/openlearn/course')).toBe(false)
    expect(isAllowedResourceUrl('https://www.futurelearn.com/courses/x')).toBe(false)
    expect(isAllowedResourceUrl('https://ocw.mit.edu/courses/6-0001/')).toBe(false)
    expect(isAllowedResourceUrl('https://www.ox.ac.uk/some-module')).toBe(false)
  })

  it('is not fooled by allowlisted names in the wrong position', () => {
    // Domain suffix must match a real allowlisted host, not a lookalike
    expect(isAllowedResourceUrl('https://udemy.com.evil.io/course')).toBe(false)
    expect(isAllowedResourceUrl('https://notudemy.com/course')).toBe(false)
    expect(isAllowedResourceUrl('https://evil.io/?ref=youtube.com')).toBe(false)
  })

  it('rejects malformed URLs and non-http protocols', () => {
    expect(isAllowedResourceUrl('not a url')).toBe(false)
    expect(isAllowedResourceUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedResourceUrl('ftp://udemy.com/x')).toBe(false)
    expect(isAllowedResourceUrl('')).toBe(false)
  })
})

describe('filterAllowedResources', () => {
  it('keeps allowed rows, drops the rest, preserves order', () => {
    const out = filterAllowedResources([
      r('https://www.udemy.com/course/a/'),
      r('https://ocw.mit.edu/b'),
      r('https://youtu.be/c'),
    ])
    expect(out.map((x) => x.url)).toEqual([
      'https://www.udemy.com/course/a/',
      'https://youtu.be/c',
    ])
  })

  it('drops rows with empty titles or missing urls', () => {
    const out = filterAllowedResources([
      r('https://youtu.be/ok', '  '),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { title: 'no url', source: 'x' } as any,
    ])
    expect(out).toEqual([])
  })
})

describe('validateItemResources', () => {
  it('never drops an item, only its junk resources', async () => {
    const items = [
      { skill: 'SQL', resources: [r('https://ocw.mit.edu/junk')] },
      { skill: 'dbt', resources: [] },
    ]
    const out = await validateItemResources(items)
    expect(out).toHaveLength(2)
    expect(out[0].skill).toBe('SQL')
    expect(out[0].resources).toEqual([]) // junk gone, skill kept
  })
})
