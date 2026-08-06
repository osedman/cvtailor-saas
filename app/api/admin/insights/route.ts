import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminViewer } from '@/lib/admin'
import { buildAdminInsights, type CourseOpsInput } from '@/lib/admin-insights'
import type { MetricsRun } from '@/lib/admin-metrics'

export const maxDuration = 30

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

async function listAllUsers(admin: ReturnType<typeof createAdminClient>) {
  const users: Array<{
    id: string
    email: string
    created_at: string
    last_sign_in_at: string | null
  }> = []
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const batch = data.users ?? []
    for (const u of batch) {
      users.push({
        id: u.id,
        email: u.email ?? '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })
    }
    if (batch.length < 1000) break
    page += 1
    if (page > 20) break
  }
  return users
}

async function loadCourseOps(
  admin: ReturnType<typeof createAdminClient>,
): Promise<CourseOpsInput> {
  const empty: CourseOpsInput = {
    pendingTotal: 0,
    pendingByProvider: {},
    catalogActive: 0,
    catalogStale: 0,
    lastSync: null,
  }

  try {
    const [
      pendingRes,
      activeRes,
      staleRes,
      syncRes,
      providerRows,
    ] = await Promise.all([
      admin.from('course_candidates').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('course_catalog').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('course_catalog').select('*', { count: 'exact', head: true }).eq('status', 'stale'),
      admin
        .from('course_sync_runs')
        .select('source, status, started_at, finished_at, error')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('course_candidates')
        .select('provider')
        .eq('status', 'pending')
        .limit(5000),
    ])

    if (pendingRes.error && activeRes.error) return empty

    const pendingByProvider: Record<string, number> = {}
    for (const row of (providerRows.data ?? []) as Array<{ provider: string }>) {
      const p = row.provider || 'unknown'
      pendingByProvider[p] = (pendingByProvider[p] ?? 0) + 1
    }

    return {
      pendingTotal: pendingRes.count ?? 0,
      pendingByProvider,
      catalogActive: activeRes.count ?? 0,
      catalogStale: staleRes.count ?? 0,
      lastSync: syncRes.error || !syncRes.data
        ? null
        : {
            source: syncRes.data.source as string,
            status: syncRes.data.status as string,
            started_at: syncRes.data.started_at as string,
            finished_at: (syncRes.data.finished_at as string | null) ?? null,
            error: (syncRes.data.error as string | null) ?? null,
          },
    }
  } catch {
    return empty
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !isAdminViewer(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const since30 = daysAgo(30)
    const since90 = daysAgo(90)

    const [
      users,
      profilesRes,
      historyRes,
      historyQualityRes,
      trackerRes,
      roadmapItemsRes,
      roadmapsRes,
      careerProfilesRes,
      firstCvsRes,
      course,
    ] = await Promise.all([
      listAllUsers(admin),
      admin.from('profiles').select('id, tailors_used, plan'),
      admin.from('tailor_history').select('user_id, created_at').gte('created_at', since90),
      admin
        .from('tailor_history')
        .select('user_id, created_at, match_score')
        .gte('created_at', since30),
      admin.from('job_tracker').select('user_id, status, created_at, updated_at'),
      admin
        .from('career_roadmap_items')
        .select('user_id, status, horizon, resources, project_brief'),
      admin.from('career_roadmaps').select('user_id'),
      admin.from('career_profiles').select('user_id'),
      admin.from('first_cvs').select('user_id'),
      loadCourseOps(admin),
    ])

    if (profilesRes.error) throw profilesRes.error
    if (historyRes.error) throw historyRes.error
    if (historyQualityRes.error) throw historyQualityRes.error
    if (trackerRes.error) throw trackerRes.error

    type RowProfile = { id: string; tailors_used: number | null; plan: string | null }
    type RowRun = { user_id: string; created_at: string; match_score?: number | null }
    type RowTracked = {
      user_id: string
      status: string
      created_at: string
      updated_at: string | null
    }
    type RowItem = {
      user_id: string
      status: string | null
      horizon: string | null
      resources: unknown
      project_brief: string | null
    }
    type RowUser = { user_id: string }

    const profiles = ((profilesRes.data ?? []) as RowProfile[]).map((p) => ({
      id: p.id,
      tailors_used: Number(p.tailors_used ?? 0),
      plan: p.plan,
    }))

    const runs90: MetricsRun[] = ((historyRes.data ?? []) as RowRun[]).map((r) => ({
      user_id: r.user_id,
      created_at: r.created_at,
    }))
    const runs30: MetricsRun[] = ((historyQualityRes.data ?? []) as RowRun[]).map((r) => ({
      user_id: r.user_id,
      created_at: r.created_at,
      match_score: r.match_score,
    }))

    const tracked = ((trackerRes.data ?? []) as RowTracked[]).map((t) => ({
      user_id: t.user_id,
      status: t.status,
      created_at: t.created_at,
      updated_at: t.updated_at ?? undefined,
    }))

    const roadmapItems = (roadmapItemsRes.error
      ? []
      : (roadmapItemsRes.data ?? [])) as RowItem[]

    const careerPathUsers = (roadmapsRes.error ? [] : (roadmapsRes.data ?? []) as RowUser[])
      .map((r) => r.user_id)
    const careerArcUsers = (careerProfilesRes.error
      ? []
      : (careerProfilesRes.data ?? []) as RowUser[])
      .map((r) => r.user_id)
    const firstCvUsers = (firstCvsRes.error ? [] : (firstCvsRes.data ?? []) as RowUser[])
      .map((r) => r.user_id)

    const insights = buildAdminInsights({
      users,
      profiles,
      runs: runs90,
      runs30d: runs30,
      tracked,
      roadmapItems: roadmapItems.map((i) => ({
        user_id: i.user_id,
        status: i.status ?? undefined,
        horizon: i.horizon,
        resources: i.resources,
        project_brief: i.project_brief,
      })),
      careerPathUsers,
      careerArcUsers,
      firstCvUsers,
      course,
    })

    return NextResponse.json({
      insights,
      generatedAt: new Date().toISOString(),
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/insights] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
