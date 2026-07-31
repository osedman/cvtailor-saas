import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8')

describe('course repository wiring', () => {
  const careerPath = read('app/api/career-path/route.ts')
  const upskill = read('app/api/upskill/route.ts')

  it('grounds all five AI generation paths through the repository finalizer', () => {
    expect(careerPath.match(/finalizeRoadmapResources\(/g)).toHaveLength(4)
    expect(upskill.match(/finalizeRoadmapResources\(/g)).toHaveLength(2)
    expect(careerPath).not.toContain('validateItemResources')
    expect(upskill).not.toContain('validateItemResources')
  })

  it('closes the client-supplied upskill accept bypass', () => {
    const acceptBlock = upskill.slice(
      upskill.indexOf("if (body?.mode === 'accept')"),
      upskill.indexOf('// ── Generate + capture'),
    )
    expect(acceptBlock).toContain('finalizeRoadmapResources')
    expect(acceptBlock).toContain('validatedItem')
    expect(acceptBlock).toContain('allowFallback: false')
    expect(acceptBlock).toContain('queueFallbacks: false')
  })

  it('sends every unseen record to review, however trusted its source', () => {
    const sync = read('lib/course-sync.ts')
    // The split is catalog-membership, not source trust: a record the catalog
    // has never seen goes to the approval queue even from a first-party
    // provider. Reintroducing a `trusted` filter here would put thousands of
    // unreviewed rows straight in front of users.
    expect(sync).toMatch(/const candidates = valid\.filter\(\(record\) => !known\.has\(/)
    expect(sync).toMatch(/const refresh = valid\.filter\(\(record\) => known\.has\(/)
    expect(sync).not.toMatch(/filter\(\(record\) => record\.trusted\)/)
  })

  it('refreshes known rows without overturning a review decision', () => {
    const sync = read('lib/course-sync.ts')
    // catalogRow() computes a status from provider metadata; replaying it over
    // a row an admin has already judged would silently revert them.
    expect(sync).toMatch(/status: _decidedByReview, \.\.\.fields/)
  })

  it('pages the catalog-key read so a short page cannot flood the queue', () => {
    const sync = read('lib/course-sync.ts')
    // A truncated read makes existing rows look new, which would queue the
    // entire catalog for re-approval.
    expect(sync).toMatch(/\.range\(from, from \+ PAGE - 1\)/)
    expect(sync).toMatch(/if \(!data \|\| data\.length < PAGE\) return keys/)
  })

  it('marks only the candidates it actually wrote', () => {
    const route = read('app/api/admin/course-candidates/route.ts')
    // A whole-provider approval is served in bounded pages. Marking the wider
    // provider scope approved would strand every unwritten row: flagged as
    // approved, never present in the catalog.
    expect(route).toMatch(/const writtenIds = /)
    expect(route).toMatch(/\.in\('id', writtenIds\)/)
  })

  it('registers a secret-protected daily sync', () => {
    const route = read('app/api/cron/course-sync/route.ts')
    const vercel = JSON.parse(read('vercel.json')) as {
      crons: Array<{ path: string; schedule: string }>
    }
    expect(route).toContain('Bearer ${secret}')
    expect(route).toContain('createAdminClient()')
    // Daily, not weekly: discovery feeds the approval queue every morning, and
    // the link-rot sweep only covers the catalog in reasonable time at this
    // cadence. Stays within Hobby's one-trigger-per-day cron limit.
    expect(vercel.crons).toContainEqual({
      path: '/api/cron/course-sync',
      schedule: '0 3 * * *',
    })
  })

  it('offers a browser-friendly sync only to a signed-in admin', () => {
    const route = read('app/api/admin/course-sync/route.ts')
    expect(route).toContain('supabase.auth.getUser()')
    expect(route).toContain('isAdminEmail(user.email)')
    expect(route).toContain("searchParams.get('confirm')")
    expect(route).toContain('createAdminClient()')
  })

  it('ships RLS for the shared catalog and service-only internals', () => {
    const migration = read('supabase/migrations/20260728172335_course_catalog.sql')
    expect(migration).toContain('alter table public.course_catalog enable row level security')
    expect(migration).toContain('to authenticated')
    expect(migration).toContain("using (status = 'active')")
    expect(migration).toContain('alter table public.course_candidates enable row level security')
    expect(migration).toContain('alter table public.course_sync_runs enable row level security')
  })
})
