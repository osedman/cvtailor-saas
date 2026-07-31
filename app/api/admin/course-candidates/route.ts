import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/admin'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { errMessage } from '@/lib/err'

export const maxDuration = 60

/** Approvals handled per request; the caller repeats while `remaining` > 0. */
const APPROVE_PAGE_SIZE = 500
const UPSERT_CHUNK = 200

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

    // The listing above is capped, so on a first-party catalog sync it shows
    // 200 of several thousand. These counts are what the queue actually acts
    // on for a whole-provider decision, so they must be exact rather than
    // derived from the visible page.
    const providers = [...new Set((rows ?? []).map((r: Record<string, unknown>) => r.provider as string))]
    const pendingByProvider = Object.fromEntries(await Promise.all(
      providers.map(async (provider) => {
        const { count } = await admin.from('course_candidates')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending').eq('provider', provider)
        return [provider, count ?? 0] as const
      }),
    ))

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

    return NextResponse.json({ candidates, catalogCount: catalogCount ?? 0, pendingByProvider })
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
    const provider = typeof body?.provider === 'string' ? body.provider.trim() : ''
    const ids = (Array.isArray(body?.ids) ? body.ids : [])
      .map((i: unknown) => String(i)).filter(Boolean).slice(0, 200)
    if (ids.length === 0 && !provider) {
      return NextResponse.json({ error: 'Nothing selected.' }, { status: 400 })
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    const admin = createAdminClient()
    const now = new Date().toISOString()

    // A whole-provider decision covers every pending row for that provider,
    // not just the page the admin can see. Selecting one first-party catalog
    // is otherwise thousands of individual clicks, which in practice means the
    // queue never gets cleared and the catalog stops growing.
    const scope = <T>(q: T): T => {
      const query = q as { in: (c: string, v: string[]) => T; eq: (c: string, v: string) => T }
      return provider ? query.eq('provider', provider) : query.in('id', ids)
    }

    if (action === 'reject') {
      const { error, count } = await scope(admin.from('course_candidates')
        .update({ status: 'rejected', reviewed_at: now, updated_at: now }, { count: 'exact' })
        .eq('status', 'pending'))
      if (error) throw error
      return NextResponse.json({ rejected: count ?? ids.length })
    }

    // Approve: read the full rows, then write real catalog entries. Bounded
    // per request so a whole-provider approval of a large first-party catalog
    // cannot run past this route's 60s budget and die halfway through the
    // write. The response reports what is left so the caller can repeat.
    const { data: rows, error: readErr } = await scope(
      admin.from('course_candidates').select('*').eq('status', 'pending'),
    ).limit(APPROVE_PAGE_SIZE)
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

    for (let i = 0; i < catalogRows.length; i += UPSERT_CHUNK) {
      const { error: upErr } = await admin
        .from('course_catalog')
        .upsert(catalogRows.slice(i, i + UPSERT_CHUNK), { onConflict: 'canonical_url' })
      if (upErr) throw upErr
    }

    // Mark exactly the rows written above, never the wider provider scope —
    // otherwise a bounded page would mark thousands of unwritten candidates
    // approved and they would silently never reach the catalog.
    const writtenIds = (rows ?? []).map((r: Record<string, unknown>) => r.id as string)
    if (writtenIds.length > 0) {
      const { error: markErr } = await admin.from('course_candidates')
        .update({ status: 'approved', reviewed_at: now, updated_at: now })
        .in('id', writtenIds)
      if (markErr) throw markErr
    }

    let remaining = 0
    if (provider) {
      const { count } = await admin.from('course_candidates')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending').eq('provider', provider)
      remaining = count ?? 0
    }
    return NextResponse.json({ approved: catalogRows.length, remaining })
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 })
  }
}
