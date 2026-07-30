import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/admin'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { errMessage } from '@/lib/err'

export const maxDuration = 60

/**
 * Browse the course catalogue — admin only.
 *
 * Search and paging are done in Postgres, not the browser: the catalogue is
 * ~2,000 rows and growing, so shipping it all to the client would be slow now
 * and broken later.
 *
 * "Retire" sets status='stale' rather than deleting. The user-facing RLS policy
 * only exposes status='active', so a retired course disappears from
 * recommendations immediately — but the row survives, which keeps the unique
 * canonical_url index meaningful and stops the next sync happily re-adding
 * something you just removed.
 */

const PAGE = 40

function gate(email: string | undefined | null) {
  return !!email && isAdminEmail(email)
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!gate(user?.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const sp = req.nextUrl.searchParams
    const q = (sp.get('q') ?? '').trim().slice(0, 120)
    const provider = (sp.get('provider') ?? '').trim().slice(0, 40)
    const freeOnly = sp.get('free') === '1'
    const offset = Math.max(0, Number(sp.get('offset') ?? 0) || 0)

    const admin = createAdminClient()

    let query = admin
      .from('course_catalog')
      .select('id, provider, title, canonical_url, duration_minutes, skill_tags, access_type, quality_score, status, sync_source', { count: 'exact' })
      .order('quality_score', { ascending: false })
      .order('title')
      .range(offset, offset + PAGE - 1)

    if (q) {
      // Escape PostgREST's or() delimiters before interpolating user input.
      const safe = q.replace(/[,()]/g, ' ')
      query = query.or(`title.ilike.%${safe}%,search_text.ilike.%${safe}%`)
    }
    if (provider) query = query.eq('provider', provider)
    if (freeOnly) query = query.eq('access_type', 'free')

    const [{ data, error, count }, { data: provRows }] = await Promise.all([
      query,
      admin.from('course_catalog').select('provider').limit(5000),
    ])
    if (error) throw error

    const providers = [...new Set((provRows ?? []).map((r: Record<string, unknown>) => String(r.provider)))].sort()

    return NextResponse.json({
      courses: (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id, provider: r.provider, title: r.title, url: r.canonical_url,
        durationMinutes: r.duration_minutes, skillTags: r.skill_tags ?? [],
        accessType: r.access_type, quality: r.quality_score, status: r.status,
        syncSource: r.sync_source,
      })),
      total: count ?? 0,
      offset,
      pageSize: PAGE,
      providers,
    })
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 })
  }
}

/** Retire (or restore) catalogue entries. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!gate(user?.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? '')
    const ids = (Array.isArray(body?.ids) ? body.ids : [])
      .map((i: unknown) => String(i)).filter(Boolean).slice(0, 200)
    if (ids.length === 0) return NextResponse.json({ error: 'Nothing selected.' }, { status: 400 })
    if (action !== 'retire' && action !== 'restore') {
      return NextResponse.json({ error: 'action must be retire or restore' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.from('course_catalog')
      .update({ status: action === 'retire' ? 'stale' : 'active', updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) throw error

    return NextResponse.json({ [action === 'retire' ? 'retired' : 'restored']: ids.length })
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 })
  }
}
