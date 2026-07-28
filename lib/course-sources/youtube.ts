import type { CourseLevel, CourseSource, CourseSourceRecord } from '@/lib/course-sources/types'
import { normalizeSkillTag, uniqueStrings } from '@/lib/course-sources/types'

const DEFAULT_QUERIES = [
  'SQL full course',
  'Python full course',
  'data analysis full course',
  'project management full course',
  'stakeholder management course',
  'Power BI full course',
  'JavaScript full course',
  'cloud computing fundamentals course',
]

interface SearchItem {
  id?: { videoId?: unknown }
  snippet?: {
    title?: unknown
    description?: unknown
    channelId?: unknown
    channelTitle?: unknown
    publishedAt?: unknown
  }
}

interface VideoItem {
  id?: unknown
  contentDetails?: { duration?: unknown }
  status?: {
    embeddable?: unknown
    privacyStatus?: unknown
    uploadStatus?: unknown
  }
}

function parseIsoDurationMinutes(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const match = raw.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return null
  const [, days, hours, minutes, seconds] = match
  const total = Number(days || 0) * 1_440 + Number(hours || 0) * 60 + Number(minutes || 0)
    + Math.ceil(Number(seconds || 0) / 60)
  return total > 0 ? total : null
}

function configuredQueries(): string[] {
  const configured = process.env.YOUTUBE_COURSE_QUERIES
    ?.split(',')
    .map((query) => query.trim())
    .filter(Boolean)
  return (configured?.length ? configured : DEFAULT_QUERIES).slice(0, 20)
}

function vettedChannels(): Set<string> {
  return new Set(
    (process.env.YOUTUBE_COURSE_CHANNEL_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
}

async function search(query: string, apiKey: string, region: string): Promise<SearchItem[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: '5',
    order: 'relevance',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    safeSearch: 'moderate',
    relevanceLanguage: 'en',
    regionCode: region,
    key: apiKey,
  }).toString()
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`YouTube search returned ${response.status}`)
  const body = await response.json() as { items?: SearchItem[] }
  return Array.isArray(body.items) ? body.items : []
}

async function hydrate(ids: string[], apiKey: string): Promise<Map<string, VideoItem>> {
  if (ids.length === 0) return new Map()
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.search = new URLSearchParams({
    part: 'contentDetails,status',
    id: ids.join(','),
    key: apiKey,
  }).toString()
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`YouTube video lookup returned ${response.status}`)
  const body = await response.json() as { items?: VideoItem[] }
  return new Map(
    (body.items ?? [])
      .filter((item): item is VideoItem & { id: string } => typeof item.id === 'string')
      .map((item) => [item.id, item]),
  )
}

function inferredLevel(query: string): CourseLevel {
  const value = query.toLowerCase()
  if (value.includes('advanced')) return 'advanced'
  if (value.includes('beginner') || value.includes('fundamentals')) return 'beginner'
  return 'all'
}

export const youtubeCourseSource: CourseSource = {
  id: 'youtube',
  enabled: () =>
    process.env.COURSE_SOURCES_ENABLED !== '0' &&
    process.env.YOUTUBE_COURSES_ENABLED !== '0' &&
    Boolean(process.env.YOUTUBE_API_KEY),
  async collect() {
    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) return []

    const region = (process.env.COURSE_SOURCE_REGION || 'GB').toUpperCase().slice(0, 2)
    const allowedChannels = vettedChannels()
    const queryResults = await Promise.all(
      configuredQueries().map(async (query) => ({ query, items: await search(query, apiKey, region) })),
    )
    const ids = [...new Set(queryResults.flatMap(({ items }) =>
      items.map((item) => item.id?.videoId).filter((id): id is string => typeof id === 'string'),
    ))]
    const details = await hydrate(ids, apiKey)
    const records: CourseSourceRecord[] = []

    for (const { query, items } of queryResults) {
      for (const item of items) {
        const videoId = item.id?.videoId
        const title = item.snippet?.title
        const channelId = item.snippet?.channelId
        if (typeof videoId !== 'string' || typeof title !== 'string') continue
        const detail = details.get(videoId)
        if (
          !detail ||
          detail.status?.embeddable !== true ||
          detail.status?.privacyStatus !== 'public' ||
          detail.status?.uploadStatus !== 'processed'
        ) continue

        records.push({
          provider: 'youtube',
          externalId: videoId,
          title: title.trim(),
          description: typeof item.snippet?.description === 'string'
            ? item.snippet.description.trim().slice(0, 2_000)
            : '',
          canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
          skillTags: uniqueStrings([
            normalizeSkillTag(query.replace(/\b(full )?course\b/gi, '')),
            title,
          ]),
          level: inferredLevel(query),
          durationMinutes: parseIsoDurationMinutes(detail.contentDetails?.duration),
          language: 'en',
          regions: [region],
          accessType: 'free',
          qualityScore: allowedChannels.has(String(channelId)) ? 0.85 : 0.65,
          trusted: allowedChannels.has(String(channelId)),
          discoveredVia: 'youtube-data-api',
          providerPayload: {
            channelId: typeof channelId === 'string' ? channelId : null,
            channelTitle: typeof item.snippet?.channelTitle === 'string' ? item.snippet.channelTitle : null,
            publishedAt: typeof item.snippet?.publishedAt === 'string' ? item.snippet.publishedAt : null,
            query,
          },
        })
      }
    }

    return [...new Map(records.map((record) => [record.externalId, record])).values()]
  },
}

export { parseIsoDurationMinutes }
