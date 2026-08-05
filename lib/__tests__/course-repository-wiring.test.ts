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

  it('registers a secret-protected weekly sync', () => {
    // Vercel Hobby allows two cron jobs. The daily slot belongs to agency
    // housekeeping; course-sync and path-digest share the weekly dispatcher,
    // which forwards the CRON_SECRET Authorization header on the right day.
    const route = read('app/api/cron/course-sync/route.ts')
    const dispatcher = read('app/api/cron/weekly/route.ts')
    const vercel = JSON.parse(read('vercel.json')) as {
      crons: Array<{ path: string; schedule: string }>
    }
    expect(route).toContain('Bearer ${secret}')
    expect(route).toContain('createAdminClient()')
    expect(dispatcher).toContain('Bearer ${secret}')
    expect(dispatcher).toContain('"/api/cron/course-sync"')
    expect(dispatcher).toContain('"/api/path-digest"')
    expect(vercel.crons).toContainEqual({
      path: '/api/cron/weekly',
      schedule: '0 9 * * 0,1',
    })
    expect(vercel.crons).toContainEqual({
      path: '/api/agency/cron',
      schedule: '30 3 * * *',
    })
    expect(vercel.crons).toHaveLength(2)
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
