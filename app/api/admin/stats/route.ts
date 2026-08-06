import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminViewer } from '@/lib/admin'
import {
  buildProductHealth,
  buildQualityMetrics,
  activationRate,
  type MetricsRun,
} from '@/lib/admin-metrics'

export const maxDuration = 30

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Paginate auth users — listUsers caps at 1000 per page. */
async function listAllUsers(admin: ReturnType<typeof createAdminClient>) {
  const users: Array<{ id: string; created_at: string }> = []
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const batch = data.users ?? []
    for (const u of batch) {
      users.push({ id: u.id, created_at: u.created_at })
    }
    if (batch.length < 1000) break
    page += 1
    if (page > 20) break // hard stop — ~20k users
  }
  return users
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
    // Cohorts need first-run timestamps beyond 30d for older signup weeks.
    const since90 = daysAgo(90)

    const [
      users,
      profilesRes,
      historyRes,
      historyQualityRes,
      trackerRes,
      roadmapsRes,
      roadmapItemsRes,
      careerProfilesRes,
      arcSharesRes,
      evidenceRes,
      firstCvsRes,
    ] = await Promise.all([
      listAllUsers(admin),
      // No email — aggregates only
      admin.from('profiles').select('id, tailors_used'),
      admin
        .from('tailor_history')
        .select('user_id, created_at')
        .gte('created_at', since90),
      admin
        .from('tailor_history')
        .select('user_id, created_at, match_score, feedback, edited_at, cover_letter')
        .gte('created_at', since30),
      admin.from('job_tracker').select('user_id, status, created_at, updated_at'),
      admin.from('career_roadmaps').select('user_id, target_role'),
      admin.from('career_roadmap_items').select('user_id, status'),
      admin.from('career_profiles').select('user_id'),
      admin.from('career_arc_shares').select('id', { count: 'exact', head: true }),
      admin.from('career_evidence').select('user_id'),
      admin.from('first_cvs').select('user_id, status'),
    ])

    if (profilesRes.error) throw profilesRes.error
    if (historyRes.error) throw historyRes.error
    if (historyQualityRes.error) throw historyQualityRes.error
    if (trackerRes.error) throw trackerRes.error
    // Feature tables may be absent in older envs — degrade gracefully
    type RowUser = { user_id: string }
    type RowRoadmap = { user_id: string; target_role: string | null }
    type RowItem = { user_id: string; status: string }
    type RowFirstCv = { user_id: string; status: string | null }
    type RowProfile = { id: string; tailors_used: number | null }
    type RowRunTiming = { user_id: string; created_at: string }
    type RowRunQuality = RowRunTiming & {
      match_score: number | null
      feedback: MetricsRun['feedback']
      edited_at: string | null
      cover_letter: string | null
    }
    type RowTracked = {
      user_id: string
      status: string
      created_at: string
      updated_at: string | null
    }

    const roadmaps = (roadmapsRes.error ? [] : (roadmapsRes.data ?? [])) as RowRoadmap[]
    const roadmapItems = (roadmapItemsRes.error ? [] : (roadmapItemsRes.data ?? [])) as RowItem[]
    const careerProfiles = (careerProfilesRes.error ? [] : (careerProfilesRes.data ?? [])) as RowUser[]
    const firstCvs = (firstCvsRes.error ? [] : (firstCvsRes.data ?? [])) as RowFirstCv[]
    const evidenceUsers = evidenceRes.error
      ? 0
      : new Set(((evidenceRes.data ?? []) as RowUser[]).map((r) => r.user_id)).size
    const arcShares = arcSharesRes.error ? 0 : (arcSharesRes.count ?? 0)

    const profiles = ((profilesRes.data ?? []) as RowProfile[]).map((p) => ({
      id: p.id,
      tailors_used: Number(p.tailors_used ?? 0),
    }))

    // Merge 90d runs (timing) with 30d quality fields for product health.
    const qualityByKey = new Map<string, MetricsRun>()
    for (const r of (historyQualityRes.data ?? []) as RowRunQuality[]) {
      const key = `${r.user_id}|${r.created_at}`
      qualityByKey.set(key, {
        user_id: r.user_id,
        created_at: r.created_at,
        match_score: r.match_score,
        feedback: r.feedback,
        edited_at: r.edited_at,
        cover_letter: r.cover_letter,
      })
    }
    const runs90: MetricsRun[] = ((historyRes.data ?? []) as RowRunTiming[]).map((r) => {
      const key = `${r.user_id}|${r.created_at}`
      return qualityByKey.get(key) ?? { user_id: r.user_id, created_at: r.created_at }
    })
    // Quality metrics should only use the 30d window
    const runs30 = [...qualityByKey.values()]

    const tracked = ((trackerRes.data ?? []) as RowTracked[]).map((t) => ({
      user_id: t.user_id,
      status: t.status,
      created_at: t.created_at,
      updated_at: t.updated_at ?? undefined,
    }))

    const health = buildProductHealth({
      users,
      profiles,
      runs: runs90,
      tracked,
      roadmaps: roadmaps.map((r) => ({
        user_id: r.user_id,
        target_role: r.target_role,
      })),
      roadmapItems: roadmapItems.map((i) => ({
        user_id: i.user_id,
        status: i.status,
      })),
      careerProfiles: careerProfiles.map((p) => ({ user_id: p.user_id })),
      arcShares,
      evidenceUsers,
      firstCvs: firstCvs.map((f) => ({
        user_id: f.user_id,
        status: f.status,
      })),
      windowDays: 30,
    })

    // Quality uses the strict 30d window (scores/feedback/edits).
    const activated = activationRate(users, profiles).activated
    health.quality = buildQualityMetrics(runs30, activated)

    return NextResponse.json({
      health,
      generatedAt: new Date().toISOString(),
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/stats] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
