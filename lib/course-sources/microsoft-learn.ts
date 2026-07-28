import type { CourseLevel, CourseSource, CourseSourceRecord } from '@/lib/course-sources/types'
import { uniqueStrings } from '@/lib/course-sources/types'

const CATALOG_URL = 'https://learn.microsoft.com/api/catalog/?locale=en-us'

interface LearnItem {
  uid?: unknown
  title?: unknown
  summary?: unknown
  url?: unknown
  duration_in_minutes?: unknown
  roles?: unknown
  products?: unknown
  subjects?: unknown
  levels?: unknown
  last_modified?: unknown
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function levelFrom(values: string[]): CourseLevel {
  const joined = values.join(' ').toLowerCase()
  if (joined.includes('beginner')) return 'beginner'
  if (joined.includes('advanced')) return 'advanced'
  if (joined.includes('intermediate')) return 'intermediate'
  return 'all'
}

function canonicalLearnUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw, 'https://learn.microsoft.com')
    if (url.hostname !== 'learn.microsoft.com') return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function normalize(item: LearnItem, kind: string): CourseSourceRecord | null {
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  const externalId = typeof item.uid === 'string' ? item.uid.trim() : ''
  const canonicalUrl = canonicalLearnUrl(item.url)
  if (!title || !externalId || !canonicalUrl) return null

  const levels = strings(item.levels)
  const tags = uniqueStrings([
    ...strings(item.subjects),
    ...strings(item.products),
    ...strings(item.roles),
    title,
  ])
  const duration = typeof item.duration_in_minutes === 'number' && item.duration_in_minutes > 0
    ? Math.round(item.duration_in_minutes)
    : null

  return {
    provider: 'microsoft-learn',
    externalId: `${kind}:${externalId}`,
    title,
    description: typeof item.summary === 'string' ? item.summary.trim().slice(0, 2_000) : '',
    canonicalUrl,
    skillTags: tags,
    level: levelFrom(levels),
    durationMinutes: duration,
    language: 'en',
    regions: [],
    accessType: 'free',
    qualityScore: kind === 'learningPath' ? 0.84 : 0.8,
    trusted: true,
    discoveredVia: 'microsoft-learn-catalog',
    providerPayload: {
      kind,
      verifiedByProvider: true,
      lastModified: typeof item.last_modified === 'string' ? item.last_modified : null,
    },
  }
}

export const microsoftLearnSource: CourseSource = {
  id: 'microsoft-learn',
  enabled: () =>
    process.env.COURSE_SOURCES_ENABLED !== '0' &&
    process.env.MICROSOFT_LEARN_ENABLED !== '0',
  async collect() {
    const response = await fetch(CATALOG_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
      next: { revalidate: 86_400 },
    })
    if (!response.ok) throw new Error(`Microsoft Learn catalog returned ${response.status}`)

    const body = await response.json() as Record<string, unknown>
    const records: CourseSourceRecord[] = []
    for (const [key, kind] of [['modules', 'module'], ['learningPaths', 'learningPath']] as const) {
      const values = Array.isArray(body[key]) ? body[key] as LearnItem[] : []
      for (const value of values) {
        const record = normalize(value, kind)
        if (record) records.push(record)
      }
    }

    const max = Math.max(1, Number(process.env.MICROSOFT_LEARN_MAX_RECORDS) || 2_000)
    return records.slice(0, max)
  },
}
