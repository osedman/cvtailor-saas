import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin'

export const maxDuration = 30

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function GET() {
  try {
    // Gate: must be signed in AND an admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const since30 = daysAgo(30)

    const [usersRes, loginsRes, profilesRes, historyRes, trackerRes] = await Promise.all([
      // All users with auth metadata
      admin.auth.admin.listUsers({ perPage: 1000 }),
      // Login events, last 30 days
      admin.from('login_events')
        .select('user_id, email, created_at, ip, user_agent')
        .gte('created_at', since30)
        .order('created_at', { ascending: false })
        .limit(500),
      // Profiles (usage counters)
      admin.from('profiles').select('id, email, tailors_used, plan, created_at'),
      // Tailoring runs, last 30 days
      admin.from('tailor_history')
        .select('user_id, created_at, match_score')
        .gte('created_at', since30),
      // Tracker activity
      admin.from('job_tracker').select('user_id, status, created_at'),
    ])

    if (usersRes.error) throw usersRes.error

    type AuthUser = { id: string; email?: string; created_at: string; last_sign_in_at?: string }
    const users = (usersRes.data.users as AuthUser[]).map(u => ({
      id: u.id,
      email: u.email ?? '',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }))

    return NextResponse.json({
      users,
      loginEvents: loginsRes.data ?? [],
      profiles: profilesRes.data ?? [],
      tailorRuns: historyRes.data ?? [],
      trackerJobs: trackerRes.data ?? [],
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/stats] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
