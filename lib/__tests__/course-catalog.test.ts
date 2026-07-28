import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  catalogAwareRoadmapTools,
  courseCatalogPrompt,
  finalizeRoadmapResources,
  rankCourses,
  skillSearchTerms,
  type CourseCatalogContext,
  type CourseCatalogEntry,
} from '@/lib/course-catalog'
import type { CareerRoadmapItem } from '@/lib/anthropic'

const entry = (overrides: Partial<CourseCatalogEntry> = {}): CourseCatalogEntry => ({
  id: 'course-1',
  provider: 'freecodecamp',
  externalId: 'sql',
  title: 'Relational Database',
  description: 'Learn SQL and PostgreSQL',
  canonicalUrl: 'https://www.freecodecamp.org/learn/relational-database/',
  skillTags: ['sql', 'postgresql'],
  level: 'beginner',
  durationMinutes: 300,
  language: 'en',
  regions: [],
  accessType: 'free',
  qualityScore: 0.9,
  ...overrides,
})

const item = (resources: CareerRoadmapItem['resources']): CareerRoadmapItem => ({
  skill: 'SQL',
  whyItMatters: 'It is required.',
  resources,
  projectBrief: 'Build a reporting database.',
  cvPhrasing: 'Built a reporting database.',
  status: 'todo',
  effortHours: 8,
})

describe('course catalog ranking', () => {
  it('expands common skill aliases', () => {
    expect(skillSearchTerms('Power BI')).toEqual(expect.arrayContaining([
      'power bi',
      'business intelligence',
      'data visualization',
    ]))
  })

  it('ranks exact, free, short skill matches before weaker records', () => {
    const ranked = rankCourses([
      entry(),
      entry({
        id: 'course-2',
        canonicalUrl: 'https://www.youtube.com/watch?v=weak',
        provider: 'youtube',
        title: 'General Programming',
        description: 'A broad overview',
        skillTags: ['programming'],
        durationMinutes: 1_200,
        qualityScore: 0.7,
      }),
    ], { skill: 'SQL', region: 'GB', freeOnly: true, maxDurationMinutes: 600 })
    expect(ranked[0].id).toBe('course-1')
  })

  it('excludes paid and region-incompatible records when requested', () => {
    const ranked = rankCourses([
      entry({ id: 'paid', accessType: 'paid' }),
      entry({ id: 'us', canonicalUrl: 'https://www.youtube.com/watch?v=us', regions: ['US'] }),
    ], { skill: 'SQL', region: 'GB', freeOnly: true })
    expect(ranked).toEqual([])
  })

  it('treats max duration as a hard limit when duration is known', () => {
    const ranked = rankCourses([
      entry({ id: 'long', durationMinutes: 1_200 }),
    ], { skill: 'SQL', region: 'GB', maxDurationMinutes: 600 })
    expect(ranked).toEqual([])
  })
})

describe('catalog-grounded roadmap resources', () => {
  const context = (courses: CourseCatalogEntry[]): CourseCatalogContext => ({
    region: 'GB',
    bySkill: { sql: courses },
    fullCoverage: courses.length >= 2,
  })

  it('resolves known IDs to canonical server-owned metadata', async () => {
    const canonical = entry()
    const [result] = await finalizeRoadmapResources(
      {} as SupabaseClient,
      [item([{
        catalogId: canonical.id,
        title: 'Invented title',
        url: 'https://evil.example/course',
        source: 'Invented',
      }])],
      { context: context([canonical]) },
    )
    expect(result.resources).toEqual([expect.objectContaining({
      catalogId: canonical.id,
      title: canonical.title,
      url: canonical.canonicalUrl,
      source: 'freeCodeCamp',
    })])
  })

  it('rejects an invented catalog ID instead of trusting its URL', async () => {
    const [result] = await finalizeRoadmapResources(
      {} as SupabaseClient,
      [item([{
        catalogId: 'not-real',
        title: 'Invented',
        url: 'https://www.youtube.com/watch?v=also-invented',
        source: 'YouTube',
      }])],
      { context: context([]) },
    )
    expect(result.resources).toEqual([])
  })

  it('omits web search only when every skill has two reviewed matches', () => {
    const tool = { name: 'submit_career_roadmap' }
    expect(catalogAwareRoadmapTools(context([entry(), entry({
      id: 'course-2',
      canonicalUrl: 'https://www.youtube.com/watch?v=2',
    })]), tool, 5)).toEqual([tool])
    expect(catalogAwareRoadmapTools(context([entry()]), tool, 5)[0]).toMatchObject({
      type: 'web_search_20250305',
      max_uses: 5,
    })
  })

  it('puts catalog IDs—not URLs—into the model grounding block', () => {
    const prompt = courseCatalogPrompt(context([entry()]))
    expect(prompt).toContain('"catalogId":"course-1"')
    expect(prompt).not.toContain('freecodecamp.org/learn')
  })
})
