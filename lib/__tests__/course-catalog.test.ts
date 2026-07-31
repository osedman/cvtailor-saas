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

/**
 * These pin the rule that a record must be ABOUT the skill to be offered.
 *
 * Before it, relevance and fit were one score: a free, short Microsoft module
 * scored ~66 on metadata alone against a threshold of 15, so every skill came
 * back with five results no matter how unrelated. That looked harmless and was
 * not — full coverage suppresses the web-search fallback, so business skills
 * were left with irrelevant courses and no way to look elsewhere, and reached
 * users with a project brief and no resources at all.
 */
describe('rankCourses only offers records that are about the skill', () => {
  const msLearn = (over: Partial<CourseCatalogEntry> = {}) => entry({
    provider: 'microsoft-learn',
    qualityScore: 0.5,
    durationMinutes: 60,
    accessType: 'free',
    ...over,
  })
  const search = { region: 'GB', freeOnly: true, maxDurationMinutes: 600 }

  it('rejects a record that matches only on generic words', () => {
    // Real false positive from production: served for "Direct line management".
    const teamsToolkit = msLearn({
      id: 'teams-toolkit',
      title: 'Deploy a Microsoft Teams app to Azure by using Teams Toolkit',
      description: 'Deploy an app to Azure.',
      skillTags: ['office teams', 'developer', 'm365'],
    })
    const ranked = rankCourses([teamsToolkit], {
      ...search,
      skill: 'Direct line management / team leadership of RPA analysts, developers or delivery',
    })
    expect(ranked).toHaveLength(0)
  })

  it('rejects a record matching one generic word of a long skill', () => {
    // Served for "Target Operating Model" purely on the word "model".
    const powerApps = msLearn({
      id: 'model-driven',
      title: 'Advanced Model-Driven Apps with Power Apps',
      description: 'Configuration and customisation.',
      skillTags: ['power apps', 'model driven apps'],
    })
    const ranked = rankCourses([powerApps], {
      ...search,
      skill: 'Target Operating Model (TOM) design & transformation programme leadership',
    })
    expect(ranked).toHaveLength(0)
  })

  it('still returns a record that genuinely covers the skill', () => {
    const processMining = entry({
      id: 'process-mining',
      provider: 'udemy',
      title: 'Process Mining & Process Intelligence',
      description: 'Tool-independent process mining.',
      skillTags: ['process mining', 'process intelligence'],
      canonicalUrl: 'https://www.udemy.com/course/process-mining/',
    })
    const ranked = rankCourses([processMining], {
      ...search,
      skill: 'Process Mining / Process Intelligence tools (e.g. Celonis, UiPath Process Mining',
    })
    expect(ranked.map((e) => e.id)).toEqual(['process-mining'])
  })

  it('matches a short skill on its exact phrase', () => {
    const powerBi = msLearn({
      id: 'power-bi',
      title: 'Manage and secure Power BI',
      skillTags: ['power bi'],
    })
    expect(rankCourses([powerBi], { ...search, skill: 'Power BI' }).map((e) => e.id))
      .toEqual(['power-bi'])
  })

  it('does not match a short tag inside an unrelated longer word', () => {
    // "ai" must not match "email"; substring overlap needs real length.
    const aiCourse = msLearn({ id: 'ai', title: 'Intro to AI', skillTags: ['ai'] })
    expect(rankCourses([aiCourse], { ...search, skill: 'email marketing campaigns' }))
      .toHaveLength(0)
  })

  it('leaves an uncovered skill short of coverage, which re-enables web search', () => {
    const irrelevant = msLearn({
      id: 'api-mgmt',
      title: 'Implement API Management',
      skillTags: ['api management', 'azure'],
    })
    const ranked = rankCourses([irrelevant], {
      ...search,
      skill: 'Vendor / partner relationship management (third-party automation suppliers)',
    })
    expect(ranked.length).toBeLessThan(2)
  })
})
