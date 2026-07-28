import type { SupabaseClient } from '@supabase/supabase-js'
import type { CareerResource, CareerRoadmapItem } from '@/lib/anthropic'
import { normalizeSkillTag } from '@/lib/course-sources/types'
import { providerForUrl, providerLabel, providerPreference } from '@/lib/course-sources/registry'
import { validateResources } from '@/lib/course-validation'
import { createAdminClient } from '@/lib/supabase/server'

export interface CourseCatalogEntry {
  id: string
  provider: string
  externalId: string
  title: string
  description: string
  canonicalUrl: string
  skillTags: string[]
  level: 'beginner' | 'intermediate' | 'advanced' | 'all'
  durationMinutes: number | null
  language: string
  regions: string[]
  accessType: 'free' | 'audit' | 'paid'
  qualityScore: number
}

interface CourseCatalogRow {
  id: string
  provider: string
  external_id: string
  title: string
  description: string
  canonical_url: string
  skill_tags: string[]
  level: CourseCatalogEntry['level']
  duration_minutes: number | null
  language: string
  regions: string[]
  access_type: CourseCatalogEntry['accessType']
  quality_score: number | string
}

export interface CourseSearchOptions {
  skill: string
  region?: string | null
  level?: CourseCatalogEntry['level'] | null
  maxDurationMinutes?: number | null
  freeOnly?: boolean
  limit?: number
}

export interface CourseCatalogContext {
  region: string
  bySkill: Record<string, CourseCatalogEntry[]>
  fullCoverage: boolean
}

const SELECT_COLUMNS = [
  'id', 'provider', 'external_id', 'title', 'description', 'canonical_url',
  'skill_tags', 'level', 'duration_minutes', 'language', 'regions',
  'access_type', 'quality_score',
].join(',')

const SKILL_ALIASES: Record<string, string[]> = {
  'power bi': ['business intelligence', 'data visualization', 'dax'],
  'stakeholder management': ['stakeholder engagement', 'communication'],
  'project management': ['agile', 'scrum', 'delivery management'],
  'data analysis': ['analytics', 'pandas', 'sql', 'statistics'],
  'machine learning': ['ml', 'classification', 'regression'],
  'cloud computing': ['aws', 'azure', 'google cloud'],
  'technical writing': ['documentation', 'written communication'],
}

export function skillSearchTerms(skill: string): string[] {
  const normalized = normalizeSkillTag(skill)
  const tokens = normalized.split(' ').filter((token) => token.length > 2)
  return [...new Set([
    normalized,
    ...(SKILL_ALIASES[normalized] ?? []),
    ...tokens,
  ].map(normalizeSkillTag).filter(Boolean))].slice(0, 12)
}

function rowToEntry(row: CourseCatalogRow): CourseCatalogEntry {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    title: row.title,
    description: row.description,
    canonicalUrl: row.canonical_url,
    skillTags: Array.isArray(row.skill_tags) ? row.skill_tags : [],
    level: row.level,
    durationMinutes: row.duration_minutes,
    language: row.language,
    regions: Array.isArray(row.regions) ? row.regions : [],
    accessType: row.access_type,
    qualityScore: Number(row.quality_score) || 0,
  }
}

export function rankCourses(
  entries: CourseCatalogEntry[],
  options: CourseSearchOptions,
): CourseCatalogEntry[] {
  const terms = skillSearchTerms(options.skill)
  const exactSkill = terms[0] ?? ''
  const region = (options.region || 'GB').toUpperCase()
  const level = options.level ?? null
  const maxDuration = options.maxDurationMinutes ?? null

  const ranked = [...new Map(entries.map((entry) => [entry.canonicalUrl, entry])).values()]
    .filter((entry) => !options.freeOnly || entry.accessType !== 'paid')
    .filter((entry) => entry.regions.length === 0 || entry.regions.includes(region))
    .filter((entry) => !level || entry.level === 'all' || entry.level === level)
    .filter((entry) => !maxDuration || !entry.durationMinutes || entry.durationMinutes <= maxDuration)
    .map((entry) => {
      const tags = entry.skillTags.map(normalizeSkillTag)
      const title = normalizeSkillTag(entry.title)
      const description = normalizeSkillTag(entry.description)
      let score = entry.qualityScore * 30 + providerPreference(entry.provider) / 5
      if (tags.includes(exactSkill)) score += 100
      if (title.includes(exactSkill)) score += 55
      for (const term of terms) {
        if (tags.some((tag) => tag === term || tag.includes(term) || term.includes(tag))) score += 24
        if (title.includes(term)) score += 12
        if (description.includes(term)) score += 3
      }
      if (entry.regions.includes(region)) score += 8
      if (entry.accessType === 'free') score += 12
      if (entry.durationMinutes && entry.durationMinutes <= 600) score += 8
      if (maxDuration && entry.durationMinutes) score += 15
      return { entry, score }
    })
    .filter(({ score }) => score > 15)
    .sort((a, b) =>
      b.score - a.score ||
      b.entry.qualityScore - a.entry.qualityScore ||
      (a.entry.durationMinutes ?? Number.MAX_SAFE_INTEGER) - (b.entry.durationMinutes ?? Number.MAX_SAFE_INTEGER) ||
      a.entry.title.localeCompare(b.entry.title),
    )
    .map(({ entry }) => entry)

  return diversifyByProvider(ranked, options.limit ?? 5)
}

/**
 * Take the top `limit`, but never more than `perProvider` from any one source.
 *
 * Why: one provider can dominate the catalogue by sheer volume — Microsoft
 * Learn's open API contributed 2,000 of the first 2,012 rows. Pure relevance
 * ranking then fills every slot with the same source, so a user closing a
 * Salesforce or UiPath gap gets five Microsoft modules and none of the better,
 * rarer match. Variety here is a quality control, not a fairness gesture.
 *
 * The cap is soft on purpose. If a skill genuinely is only covered by one
 * provider, we backfill in rank order rather than returning fewer courses —
 * showing three results because of a quota would be worse for the user than
 * showing five from one place.
 */
export function diversifyByProvider<T extends { provider: string }>(
  ranked: T[],
  limit: number,
  perProvider = 2,
): T[] {
  const picked: T[] = []
  const seen = new Set<T>()
  const counts = new Map<string, number>()

  for (const item of ranked) {
    if (picked.length >= limit) break
    const used = counts.get(item.provider) ?? 0
    if (used >= perProvider) continue
    picked.push(item)
    seen.add(item)
    counts.set(item.provider, used + 1)
  }

  // Backfill: the cap must never cost the user results.
  if (picked.length < limit) {
    for (const item of ranked) {
      if (picked.length >= limit) break
      if (!seen.has(item)) picked.push(item)
    }
  }

  return picked
}

export async function findCourses(
  supabase: SupabaseClient,
  options: CourseSearchOptions,
): Promise<CourseCatalogEntry[]> {
  const terms = skillSearchTerms(options.skill)
  if (terms.length === 0) return []

  const exactResponse = await supabase
    .from('course_catalog')
    .select(SELECT_COLUMNS)
    .eq('status', 'active')
    .overlaps('skill_tags', terms)
    .order('quality_score', { ascending: false })
    .order('duration_minutes', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true })
    .limit(200)
  if (exactResponse.error) throw exactResponse.error

  let rows = (exactResponse.data ?? []) as unknown as CourseCatalogRow[]
  if (rows.length < (options.limit ?? 5)) {
    const webQuery = terms.slice(0, 5).join(' OR ')
    const textResponse = await supabase
      .from('course_catalog')
      .select(SELECT_COLUMNS)
      .eq('status', 'active')
      .textSearch('search_text', webQuery, { type: 'websearch', config: 'english' })
      .order('quality_score', { ascending: false })
      .order('duration_minutes', { ascending: true, nullsFirst: false })
      .order('title', { ascending: true })
      .limit(200)
    if (textResponse.error) throw textResponse.error
    rows = [...rows, ...((textResponse.data ?? []) as unknown as CourseCatalogRow[])]
  }

  return rankCourses(rows.map(rowToEntry), options)
}

export async function loadCourseCatalogContext(
  supabase: SupabaseClient,
  skills: string[],
  options: Omit<CourseSearchOptions, 'skill'> = {},
): Promise<CourseCatalogContext> {
  const region = (options.region || 'GB').toUpperCase()
  const pairs = await Promise.all(
    [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))].map(async (skill) => [
      normalizeSkillTag(skill),
      await findCourses(supabase, { ...options, skill, region, limit: options.limit ?? 5 }),
    ] as const),
  )
  const bySkill = Object.fromEntries(pairs)
  return {
    region,
    bySkill,
    fullCoverage: pairs.length > 0 && pairs.every(([, entries]) => entries.length >= 2),
  }
}

export function courseCatalogPrompt(context: CourseCatalogContext): string {
  const rows = Object.entries(context.bySkill).flatMap(([skill, entries]) =>
    entries.map((entry) => ({
      skill,
      catalogId: entry.id,
      title: entry.title,
      provider: entry.provider,
      access: entry.accessType,
      durationMinutes: entry.durationMinutes,
    })),
  )
  if (rows.length === 0) {
    return '\n\nTAILR COURSE CATALOG: No matching reviewed records were found. Use the permitted web-search fallback.'
  }
  return `\n\nTAILR COURSE CATALOG (source of truth): Select resources from these records by catalogId. Never alter their title/provider or invent an ID. Only use web search for a skill with fewer than two suitable records:\n${JSON.stringify(rows)}`
}

function durationNote(minutes: number | null): string | undefined {
  if (!minutes) return undefined
  if (minutes < 60) return `≈${minutes} minutes`
  const hours = Math.round((minutes / 60) * 10) / 10
  return `≈${hours} hours`
}

export function entryToCareerResource(entry: CourseCatalogEntry): CareerResource {
  return {
    catalogId: entry.id,
    title: entry.title,
    url: entry.canonicalUrl,
    source: providerLabel(entry.provider),
    free: entry.accessType !== 'paid',
    durationNote: durationNote(entry.durationMinutes),
  }
}

export function catalogAwareRoadmapTools<T>(
  context: CourseCatalogContext,
  roadmapTool: T,
  maxWebSearchUses: number,
): unknown[] {
  if (context.fullCoverage) return [roadmapTool]
  return [
    { type: 'web_search_20250305', name: 'web_search', max_uses: maxWebSearchUses },
    roadmapTool,
  ]
}

function safeCareerResource(raw: unknown): CareerResource | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const catalogId = typeof value.catalogId === 'string' ? value.catalogId.trim().slice(0, 100) : ''
  const title = typeof value.title === 'string' ? value.title.trim().slice(0, 500) : ''
  const url = typeof value.url === 'string' ? value.url.trim().slice(0, 2_000) : ''
  const source = typeof value.source === 'string' ? value.source.trim().slice(0, 100) : ''
  if (!catalogId && (!title || !url || !source)) return null
  return {
    ...(catalogId ? { catalogId } : {}),
    title,
    url,
    source,
    free: typeof value.free === 'boolean' ? value.free : undefined,
    durationNote: typeof value.durationNote === 'string'
      ? value.durationNote.trim().slice(0, 100)
      : undefined,
  }
}

async function queueFallbackCandidates(items: CareerRoadmapItem[]): Promise<void> {
  const rows = items.flatMap((item) =>
    item.resources
      .filter((resource) => !resource.catalogId && providerForUrl(resource.url))
      .map((resource) => ({
        provider: providerForUrl(resource.url)?.id ?? 'unknown',
        external_id: null,
        title: resource.title.slice(0, 500),
        canonical_url: resource.url,
        discovered_via: 'model-web-fallback',
        payload: {
          skillTags: [normalizeSkillTag(item.skill)],
          source: resource.source,
          free: resource.free,
          durationNote: resource.durationNote,
        },
        status: 'pending',
        updated_at: new Date().toISOString(),
      })),
  )
  if (rows.length === 0) return
  try {
    const { error } = await createAdminClient()
      .from('course_candidates')
      .upsert(rows, { onConflict: 'canonical_url', ignoreDuplicates: true })
    if (error) throw error
  } catch (error) {
    console.error('[course-catalog] candidate queue failed:', error instanceof Error ? error.message : String(error))
  }
}

export async function finalizeRoadmapResources(
  supabase: SupabaseClient,
  items: CareerRoadmapItem[],
  options: {
    region?: string | null
    context?: CourseCatalogContext
    minimumCatalogResources?: number
    allowFallback?: boolean
    queueFallbacks?: boolean
  } = {},
): Promise<CareerRoadmapItem[]> {
  const context = options.context ?? await loadCourseCatalogContext(
    supabase,
    items.map((item) => item.skill),
    { region: options.region, freeOnly: true },
  )
  const minimum = options.minimumCatalogResources ?? 2

  const safeItems = items.filter(
    (item): item is CareerRoadmapItem =>
      Boolean(item) && typeof item.skill === 'string' && item.skill.trim().length > 0,
  )
  const finalized = await Promise.all(safeItems.map(async (item) => {
    const itemResources = Array.isArray(item.resources)
      ? item.resources.map(safeCareerResource).filter((resource): resource is CareerResource => Boolean(resource))
      : []
    const candidates = context.bySkill[normalizeSkillTag(item.skill)] ?? []
    const byId = new Map(candidates.map((entry) => [entry.id, entry]))
    const selectedIds = itemResources
      .map((resource) => resource.catalogId)
      .filter((id): id is string => typeof id === 'string' && byId.has(id))
    const ordered = [
      ...selectedIds.map((id) => byId.get(id)!),
      ...candidates.filter((entry) => !selectedIds.includes(entry.id)),
    ].slice(0, 3)
    const catalogResources = ordered.map(entryToCareerResource)

    const fallbackInputs = options.allowFallback === false
      ? []
      : itemResources.filter((resource) => !resource.catalogId)
    const fallback = catalogResources.length >= minimum || options.allowFallback === false
      ? []
      : await validateResources(fallbackInputs)
    return {
      ...item,
      resources: [...catalogResources, ...fallback]
        .filter((resource, index, all) =>
          all.findIndex((other) => other.url === resource.url) === index,
        )
        .slice(0, 3),
    }
  }))

  if (options.queueFallbacks !== false) await queueFallbackCandidates(finalized)
  return finalized
}
