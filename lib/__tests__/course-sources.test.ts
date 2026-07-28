import { describe, expect, it } from 'vitest'
import { CURATED_COURSES } from '@/lib/course-sources/curated'
import {
  ALLOWED_COURSE_DOMAINS,
  COURSE_PROVIDERS,
  courseProviderPrompt,
  providerForUrl,
} from '@/lib/course-sources/registry'
import { catalogRow, candidateRow } from '@/lib/course-sync'
import { isAllowedResourceUrl } from '@/lib/course-validation'
import { parseIsoDurationMinutes } from '@/lib/course-sources/youtube'

describe('course provider registry', () => {
  it('is the single source for every allowed domain', () => {
    expect(ALLOWED_COURSE_DOMAINS).toEqual(
      expect.arrayContaining(COURSE_PROVIDERS.flatMap((provider) => [...provider.domains])),
    )
    expect(providerForUrl('https://learn.microsoft.com/training/paths/example')?.id)
      .toBe('microsoft-learn')
    expect(providerForUrl('https://youtube.com.evil.example/watch')).toBeNull()
  })

  it('generates provider prompt policy from the registry', () => {
    const prompt = courseProviderPrompt()
    expect(prompt).toContain('freeCodeCamp')
    expect(prompt).toContain('Microsoft Learn')
    expect(prompt).toContain('MIT OpenCourseWare')
  })
})

describe('curated catalog seed', () => {
  it('contains only trusted, free/audit, structurally allowed records', () => {
    expect(CURATED_COURSES.length).toBeGreaterThanOrEqual(10)
    for (const course of CURATED_COURSES) {
      expect(course.trusted).toBe(true)
      expect(course.accessType).not.toBe('paid')
      expect(course.title).not.toBe('')
      expect(course.skillTags.length).toBeGreaterThan(0)
      expect(isAllowedResourceUrl(course.canonicalUrl)).toBe(true)
    }
  })

  it('normalizes trusted and review records into separate DB shapes', () => {
    const now = '2026-07-28T00:00:00.000Z'
    const seed = CURATED_COURSES[0]
    expect(catalogRow(seed, now)).toMatchObject({
      provider: seed.provider,
      external_id: seed.externalId,
      canonical_url: seed.canonicalUrl,
      status: 'active',
      last_verified_at: now,
    })
    expect(candidateRow({ ...seed, trusted: false }, now)).toMatchObject({
      canonical_url: seed.canonicalUrl,
      status: 'pending',
      discovered_via: 'curated',
    })
  })
})

describe('YouTube metadata normalization', () => {
  it('parses ISO-8601 durations without a dependency', () => {
    expect(parseIsoDurationMinutes('PT2H14M30S')).toBe(135)
    expect(parseIsoDurationMinutes('PT45M')).toBe(45)
    expect(parseIsoDurationMinutes('bad')).toBeNull()
  })
})
