import type { CourseLevel, CourseSource, CourseSourceRecord } from '@/lib/course-sources/types'
import { normalizeSkillTag, uniqueStrings } from '@/lib/course-sources/types'

/**
 * Search queries, aimed at who Tailr's users actually are.
 *
 * The first pass used generic developer topics — JavaScript, cloud, Python —
 * and returned 40 videos, none of which helped an RPA business analyst close a
 * UiPath or requirements gap. Tailr's audience is automation/BA/data, so the
 * queries are now the skills their job descriptions actually ask for.
 *
 * "full course" / "tutorial" wording is deliberate: it biases YouTube toward
 * complete teaching material and away from vlogs and conference talks, which
 * was the main junk category in the first run.
 */
const DEFAULT_QUERIES = [
  // Automation / RPA — the North Star for most current users
  'UiPath full course tutorial',
  'RPA full course for beginners',
  'Power Automate full course',
  'automation anywhere tutorial full course',
  // Business analysis
  'business analyst full course',
  'requirements gathering tutorial business analyst',
  'BRD FRD documentation tutorial',
  'process mapping tutorial course',
  // Data / reporting — the recurring gap across applications
  'Power BI full course',
  'SQL full course',
  'Excel data analysis full course',
  'data analysis full course',
  // Delivery and stakeholder skills
  'stakeholder management course',
  'project management full course',
  'agile scrum full course',
  'change management training course',
]

/**
 * Channels whose uploads are genuinely structured courses rather than vlogs,
 * shorts or conference talks. Reviewed from the first sync's candidate queue
 * (28 Jul 2026) — IDs taken from the API response, not guessed.
 *
 * Being listed here means new uploads skip the review queue, so the bar is
 * "consistently publishes teaching material", not "one good video".
 * `YOUTUBE_COURSE_CHANNEL_IDS` still overrides this list entirely.
 */
const DEFAULT_TRUSTED_CHANNELS = [
  'UCWv7vMbMWH4-V0ZXdmDpPBA', // Programming with Mosh
  'UCkw4JCwteGrDHIsyIIKo4tQ', // edureka!
  'UCsvqVGtbbyHaMoevxPAq9Fg', // Simplilearn
  'UCCktnahuRFYIBtNnKT5IYyg', // Intellipaat
  'UCLLw7jmFsvfIVaUFsLs8mlQ', // Luke Barousse — data analytics
  'UC8_RSKwbU1OmZWNEoLV1tQg', // Data with Baraa — SQL
  'UC1bhYMFuSFREIQ5bgclLDkQ', // Adam Finer — Learn BI
  'UC8uqqZwyoW303ZeWyUiNdMg', // David McLachlan — PM / PMBOK
  'UCY38RvRIxYODO4penyxUwTg', // Dave Gray — web development
  'UC4SVo0Ue36XCfOyb5Lh1viQ', // Bro Code — programming fundamentals
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
  const configured = (process.env.YOUTUBE_COURSE_CHANNEL_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  // Env var overrides entirely when set; otherwise the reviewed list applies.
  // Without this fallback the set is empty, every channel is untrusted, and a
  // sync appears to do nothing — 40 videos went to review that way on the
  // first run.
  return new Set(configured.length > 0 ? configured : DEFAULT_TRUSTED_CHANNELS)
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

/** YouTube's videos endpoint accepts at most 50 ids per request. */
const HYDRATE_BATCH = 50

/**
 * Fetch durations for the discovered videos.
 *
 * Batched because the id list is a hard 50-per-request limit: this sent one
 * request with every id, which worked at 8 search queries (~40 videos) and
 * started returning 400 the moment the query list grew to 16. Batching removes
 * the coupling between how many things we search for and whether the lookup
 * survives.
 *
 * A failed batch is skipped rather than thrown: losing durations for 50 videos
 * is a degraded sync, but throwing loses the entire run including the ones that
 * came back fine.
 */
async function hydrate(ids: string[], apiKey: string): Promise<Map<string, VideoItem>> {
  const out = new Map<string, VideoItem>()
  if (ids.length === 0) return out

  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += HYDRATE_BATCH) {
    batches.push(ids.slice(i, i + HYDRATE_BATCH))
  }

  const results = await Promise.all(batches.map(async (batch) => {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.search = new URLSearchParams({
      part: 'contentDetails,status',
      id: batch.join(','),
      key: apiKey,
    }).toString()
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!response.ok) return []
      const body = await response.json() as { items?: VideoItem[] }
      return body.items ?? []
    } catch {
      return []
    }
  }))

  for (const item of results.flat()) {
    if (typeof item.id === 'string') out.set(item.id, item)
  }
  return out
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
            verifiedByProvider: true,
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
