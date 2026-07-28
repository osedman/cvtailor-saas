import type { SupabaseClient } from '@supabase/supabase-js'
import { collectCourseSources, type CourseSourceRecord } from '@/lib/course-sources'
import { searchTextFor } from '@/lib/course-sources/types'
import { isAllowedResourceUrl, isUrlAlive } from '@/lib/course-validation'

const UPSERT_BATCH_SIZE = 200
const VERIFY_BATCH_SIZE = 100

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

export function catalogRow(record: CourseSourceRecord, now: string) {
  return {
    provider: record.provider,
    external_id: record.externalId,
    title: record.title.slice(0, 500),
    description: record.description.slice(0, 4_000),
    canonical_url: record.canonicalUrl,
    skill_tags: record.skillTags.slice(0, 30),
    level: record.level,
    duration_minutes: record.durationMinutes,
    language: record.language.slice(0, 10),
    regions: record.regions.slice(0, 20),
    access_type: record.accessType,
    quality_score: record.qualityScore,
    status: 'active',
    search_text: searchTextFor(record),
    provider_payload: record.providerPayload ?? {},
    last_verified_at: now,
    updated_at: now,
  }
}

export function candidateRow(record: CourseSourceRecord, now: string) {
  return {
    provider: record.provider,
    external_id: record.externalId,
    title: record.title.slice(0, 500),
    canonical_url: record.canonicalUrl,
    discovered_via: record.discoveredVia,
    payload: {
      ...record.providerPayload,
      description: record.description,
      skillTags: record.skillTags,
      level: record.level,
      durationMinutes: record.durationMinutes,
      language: record.language,
      regions: record.regions,
      accessType: record.accessType,
      qualityScore: record.qualityScore,
    },
    status: 'pending',
    updated_at: now,
  }
}

export interface CourseSyncResult {
  ok: boolean
  dryRun: boolean
  discovered: number
  upserted: number
  candidates: number
  stale: number
  sources: Array<{ source: string; discovered: number; error: string | null }>
}

export async function syncCourseCatalog(
  admin: SupabaseClient,
  options: { dryRun?: boolean } = {},
): Promise<CourseSyncResult> {
  const dryRun = options.dryRun === true
  const now = new Date().toISOString()
  const collections = await collectCourseSources()
  let upserted = 0
  let candidateCount = 0
  let stale = 0

  for (const collection of collections) {
    const valid = collection.records.filter((record) =>
      record.title.trim().length > 0 &&
      record.externalId.trim().length > 0 &&
      isAllowedResourceUrl(record.canonicalUrl),
    )
    const trusted = valid.filter((record) => record.trusted)
    const candidates = valid.filter((record) => !record.trusted)
    let runId: string | null = null

    if (!dryRun) {
      const { data: run, error: runError } = await admin
        .from('course_sync_runs')
        .insert({ source: collection.source, status: 'running' })
        .select('id')
        .single()
      if (runError) throw runError
      runId = run.id as string

      try {
        for (const batch of chunks(trusted.map((record) => catalogRow(record, now)), UPSERT_BATCH_SIZE)) {
          const { error } = await admin
            .from('course_catalog')
            .upsert(batch, { onConflict: 'provider,external_id' })
          if (error) throw error
          upserted += batch.length
        }

        for (const batch of chunks(candidates.map((record) => candidateRow(record, now)), UPSERT_BATCH_SIZE)) {
          const { error } = await admin
            .from('course_candidates')
            .upsert(batch, { onConflict: 'canonical_url' })
          if (error) throw error
          candidateCount += batch.length
        }

        await admin.from('course_sync_runs').update({
          status: collection.error ? 'partial' : 'succeeded',
          finished_at: new Date().toISOString(),
          discovered_count: valid.length,
          upserted_count: trusted.length,
          candidate_count: candidates.length,
          error: collection.error,
        }).eq('id', runId)
      } catch (error) {
        await admin.from('course_sync_runs').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          discovered_count: valid.length,
          error: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
        }).eq('id', runId)
        throw error
      }
    } else {
      upserted += trusted.length
      candidateCount += candidates.length
    }
  }

  if (!dryRun) {
    const { data: verifyRows, error } = await admin
      .from('course_catalog')
      .select('id, canonical_url')
      .eq('status', 'active')
      .order('last_verified_at', { ascending: true, nullsFirst: true })
      .limit(VERIFY_BATCH_SIZE)
    if (error) throw error

    const checked = await Promise.all((verifyRows ?? []).map(async (row) => ({
      id: row.id as string,
      alive: await isUrlAlive(row.canonical_url as string, 6_000),
    })))
    const liveIds = checked.filter((row) => row.alive).map((row) => row.id)
    const staleIds = checked.filter((row) => !row.alive).map((row) => row.id)
    if (liveIds.length > 0) {
      const { error: liveError } = await admin
        .from('course_catalog')
        .update({ last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in('id', liveIds)
      if (liveError) throw liveError
    }
    if (staleIds.length > 0) {
      const { error: staleError } = await admin
        .from('course_catalog')
        .update({ status: 'stale', updated_at: new Date().toISOString() })
        .in('id', staleIds)
      if (staleError) throw staleError
      stale = staleIds.length
    }
  }

  return {
    ok: collections.every((collection) => !collection.error),
    dryRun,
    discovered: collections.reduce((sum, collection) => sum + collection.records.length, 0),
    upserted,
    candidates: candidateCount,
    stale,
    sources: collections.map((collection) => ({
      source: collection.source,
      discovered: collection.records.length,
      error: collection.error,
    })),
  }
}
