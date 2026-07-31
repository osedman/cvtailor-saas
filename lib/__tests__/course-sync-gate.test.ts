/**
 * The review gate, tested by behaviour rather than by reading the source.
 *
 * The property that matters: a record the catalog has never seen must land in
 * the approval queue, even when its source is a trusted first-party provider.
 * Before this gate, `trusted: true` meant "publish straight to users", which
 * put thousands of unreviewed rows in front of them on a single sync.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CourseSourceRecord } from '@/lib/course-sources'

const collectCourseSources = vi.fn()
vi.mock('@/lib/course-sources', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/course-sources')>(),
  collectCourseSources: () => collectCourseSources(),
}))
// Link verification would make real network calls; the gate doesn't depend on it.
vi.mock('@/lib/course-validation', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/course-validation')>(),
  isUrlAlive: async () => true,
}))

import { syncCourseCatalog } from '@/lib/course-sync'

function record(overrides: Partial<CourseSourceRecord>): CourseSourceRecord {
  return {
    provider: 'microsoft-learn',
    externalId: 'mod-1',
    title: 'A module',
    description: 'Description',
    canonicalUrl: 'https://learn.microsoft.com/training/modules/a',
    skillTags: ['excel'],
    level: 'all',
    durationMinutes: 30,
    language: 'en',
    regions: [],
    accessType: 'free',
    qualityScore: 0.5,
    discoveredVia: 'microsoft-learn',
    trusted: true,
    providerPayload: { verifiedByProvider: true },
    ...overrides,
  } as CourseSourceRecord
}

/** Minimal chainable Supabase stub that records what each table was sent. */
function fakeAdmin(existing: Array<{ provider: string; external_id: string }>) {
  const upserts: Record<string, unknown[][]> = { course_catalog: [], course_candidates: [] }
  let catalogKeyReadCount = 0

  const builder = (table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
      select: (cols?: string) => {
        if (table === 'course_catalog' && cols === 'provider, external_id') {
          catalogKeyReadCount += 1
          // One full page, then the loop stops because it is under PAGE size.
          return { ...chain, range: async () => ({ data: existing, error: null }) }
        }
        return chain
      },
      insert: () => chain,
      update: () => chain,
      upsert: (rows: unknown[]) => {
        upserts[table]?.push(rows)
        return Promise.resolve({ error: null })
      },
      eq: self, in: self, order: self, limit: async () => ({ data: [], error: null }),
      range: async () => ({ data: existing, error: null }),
      single: async () => ({ data: { id: 'run-1' }, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: [], error: null }),
    })
    return chain
  }

  return {
    client: { from: (table: string) => builder(table) },
    upserts,
    catalogKeyReads: () => catalogKeyReadCount,
  }
}

const flat = (batches: unknown[][]) => batches.flat() as Array<Record<string, unknown>>

beforeEach(() => collectCourseSources.mockReset())

describe('course sync review gate', () => {
  it('queues an unseen record for review even from a trusted source', async () => {
    collectCourseSources.mockResolvedValue([{
      source: 'microsoft-learn',
      error: null,
      records: [record({ externalId: 'brand-new', canonicalUrl: 'https://learn.microsoft.com/training/modules/new' })],
    }])
    const admin = fakeAdmin([])

    const result = await syncCourseCatalog(admin.client as never)

    expect(flat(admin.upserts.course_candidates)).toHaveLength(1)
    expect(flat(admin.upserts.course_candidates)[0]).toMatchObject({
      status: 'pending',
      provider: 'microsoft-learn',
    })
    expect(flat(admin.upserts.course_catalog)).toHaveLength(0)
    expect(result.candidates).toBe(1)
    expect(result.upserted).toBe(0)
  })

  it('refreshes a record the catalog already has, without re-queueing it', async () => {
    collectCourseSources.mockResolvedValue([{
      source: 'microsoft-learn',
      error: null,
      records: [record({ externalId: 'mod-1' })],
    }])
    const admin = fakeAdmin([{ provider: 'microsoft-learn', external_id: 'mod-1' }])

    const result = await syncCourseCatalog(admin.client as never)

    expect(flat(admin.upserts.course_candidates)).toHaveLength(0)
    expect(flat(admin.upserts.course_catalog)).toHaveLength(1)
    expect(result.upserted).toBe(1)
  })

  it('never rewrites status on a refresh, so a review decision survives', async () => {
    collectCourseSources.mockResolvedValue([{
      source: 'microsoft-learn',
      error: null,
      records: [record({ externalId: 'mod-1' })],
    }])
    const admin = fakeAdmin([{ provider: 'microsoft-learn', external_id: 'mod-1' }])

    await syncCourseCatalog(admin.client as never)

    const refreshed = flat(admin.upserts.course_catalog)[0]
    expect(refreshed).not.toHaveProperty('status')
    expect(refreshed).toHaveProperty('title')
  })

  it('splits a mixed batch by catalog membership, not by source trust', async () => {
    collectCourseSources.mockResolvedValue([{
      source: 'microsoft-learn',
      error: null,
      records: [
        record({ externalId: 'known-1', canonicalUrl: 'https://learn.microsoft.com/training/modules/k1' }),
        record({ externalId: 'new-1', canonicalUrl: 'https://learn.microsoft.com/training/modules/n1' }),
        record({ externalId: 'new-2', canonicalUrl: 'https://learn.microsoft.com/training/modules/n2' }),
      ],
    }])
    const admin = fakeAdmin([{ provider: 'microsoft-learn', external_id: 'known-1' }])

    const result = await syncCourseCatalog(admin.client as never)

    expect(result.upserted).toBe(1)
    expect(result.candidates).toBe(2)
  })
})
