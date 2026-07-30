export type CourseAccessType = 'free' | 'audit' | 'paid'
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced' | 'all'

export interface CourseSourceRecord {
  provider: string
  externalId: string
  title: string
  description: string
  canonicalUrl: string
  skillTags: string[]
  level: CourseLevel
  durationMinutes: number | null
  language: string
  regions: string[]
  accessType: CourseAccessType
  qualityScore: number
  trusted: boolean
  discoveredVia: string
  providerPayload?: Record<string, unknown>
}

export interface CourseSource {
  id: string
  enabled(): boolean
  collect(): Promise<CourseSourceRecord[]>
}

export function normalizeSkillTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
    .replace(/\s+/g, ' ')
}

export function uniqueStrings(values: unknown[], max = 30): string[] {
  return [...new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map(normalizeSkillTag)
      .filter(Boolean),
  )].slice(0, max)
}

export function searchTextFor(record: Pick<CourseSourceRecord, 'title' | 'description' | 'skillTags'>): string {
  return [record.title, record.description, ...record.skillTags].join(' ').slice(0, 10_000)
}
