import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/admin'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { errMessage } from '@/lib/err'

export const maxDuration = 60

/**
 * The course review queue — admin only.
 *
 * The sync routes anything from an untrusted source into `course_candidates`
 * rather than putting it in front of users. That gate was built with no way to
 * act on it, so the queue just accumulated: 37 videos after one YouTube run.
 * This is the missing half.
 *
 * Approving copies the candidate into `course_catalog` (which is what users
 * actually read) and marks the row approved. Rejecting records the decision so
 * the same video never reappears — the sync skips URLs it has already seen.
 */

function gate(email: string | undefined | null) {
  return !!email && isAdminEmail(email)
}

/** Pending candidates, newest first. */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!gate(user?.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()
    const [{ data: rows, error }, { count: catalogCount }] = await Promise.all([
      admin.from('course_candidates')
        .select('id, provider, title, canonical_url, payload, discovered_via, discovered_at')
        .eq('status', 'pending')
        .order('discovered_at', { ascending: false })
        .limit(200),
      admin.from('course_catalog').select('*', { count: 'exact', head: true }),
    ])
    if (error) throw error

    const candidates = (rows ?? []).map((r: Record<string, unknown>) => {
      const p = (r.payload ?? {}) as Record<string, unknown>
      return {
        id: r.id as string,
        provider: r.provider as string,
        title: r.title as string,
        url: r.canonical_url as string,
        channel: (p.channelTitle as string) ?? '',
        channelId: (p.channelId as string) ?? '',
        durationMinutes: (p.durationMinutes as number) ?? null,
        skillTags: Array.isArray(p.skillTags) ? (p.skillTags as string[]) : [],
        discoveredAt: r.discovered_at as string,
      }
    })

    return NextResponse.json({ candidates, catalogCount: catalogCount ?? 0 })
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 })
  }
}

/** Act on a selection: approve into the catalogue, or reject. */
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
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    const admin = createAdminClient()
    const now = new Date().toISOString()

    if (action === 'reject') {
      const { error } = await admin.from('course_candidates')
        .update({ status: 'rejected', reviewed_at: now, updated_at: now })
        .in('id', ids)
      if (error) throw error
      return NextResponse.json({ rejected: ids.length })
    }

    // Approve: read the full rows, then write real catalog entries.
    const { data: rows, error: readErr } = await admin
      .from('course_candidates').select('*').in('id', ids).eq('status', 'pending')
    if (readErr) throw readErr

    const catalogRows = (rows ?? []).map((r: Record<string, unknown>) => {
      const p = (r.payload ?? {}) as Record<string, unknown>
      const duration = typeof p.durationMinutes === 'number' && p.durationMinutes > 0
        ? Math.round(p.durationMinutes) : null
      return {
        provider: r.provider,
        external_id: (r.external_id as string) ?? (r.canonical_url as string),
        title: r.title,
        description: (p.description as string) ?? '',
        canonical_url: r.canonical_url,
        skill_tags: Array.isArray(p.skillTags) ? p.skillTags : [],
        level: typeof p.level === 'string' ? p.level : 'all',
        duration_minutes: duration,
        language: 'en',
        regions: [],
        access_type: 'free',
        // Hand-approved, so it should outrank an auto-synced record of the same
        // skill — a human looked at this one.
        quality_score: 0.88,
        sync_source: 'admin-review',
        status: 'active',
        search_text: `${r.title} ${(p.description as string) ?? ''}`.slice(0, 4000),
        provider_payload: r.payload ?? {},
        last_verified_at: now,
        updated_at: now,
      }
    })

    if (catalogRows.length > 0) {
      const { error: upErr } = await admin
        .from('course_catalog').upsert(catalogRows, { onConflict: 'canonical_url' })
      if (upErr) throw upErr
    }

    const { error: markErr } = await admin.from('course_candidates')
      .update({ status: 'approved', reviewed_at: now, updated_at: now })
      .in('id', ids)
    if (markErr) throw markErr

    return NextResponse.json({ approved: catalogRows.length })
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 })
  }
}
