import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isCareerPathBeta, BETA_LOCKED } from '@/lib/feature-gate'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  DEFAULT_SHARE_SETTINGS,
  SHARE_EXPIRY_CHOICES,
  generateShareToken,
  validateShareSettings,
  type ShareSettings,
} from '@/lib/career-arc-share'

/**
 * Owner-side management of the Career Arc share link (rebuild stage 3).
 * The public read path lives in app/arc/[token]/page.tsx, not here.
 *
 * GET   → current share state (or { share: null })
 * POST  → create the share if none exists (idempotent; returns existing)
 * PATCH → { action: 'settings' | 'expiry' | 'revoke' | 'regenerate', ... }
 */

interface ShareRow {
  token: string
  claim_redactions: Record<string, string>
  first_name_only: boolean
  hide_employers: boolean
  hide_dates: boolean
  include_break: boolean
  expires_at: string | null
  revoked: boolean
  view_count: number
  created_at: string
}

function shape(row: ShareRow) {
  return {
    token: row.token,
    settings: {
      claimRedactions: row.claim_redactions ?? {},
      firstNameOnly: row.first_name_only,
      hideEmployers: row.hide_employers,
      hideDates: row.hide_dates,
      includeBreak: row.include_break,
    },
    expiresAt: row.expires_at,
    revoked: row.revoked,
    viewCount: row.view_count,
    createdAt: row.created_at,
  }
}

const SHARE_COLUMNS = 'token, claim_redactions, first_name_only, hide_employers, hide_dates, include_break, expires_at, revoked, view_count, created_at'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, res: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  if (!(await isCareerPathBeta(user.email))) {
    return { supabase, user: null, res: NextResponse.json(BETA_LOCKED, { status: 403 }) }
  }
  return { supabase, user, res: null }
}

export async function GET() {
  try {
    const { supabase, user, res } = await requireUser()
    if (!user) return res
    const { data, error } = await supabase
      .from('career_arc_shares')
      .select(SHARE_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ share: data ? shape(data as ShareRow) : null })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function POST() {
  try {
    const { supabase, user, res } = await requireUser()
    if (!user) return res
    const limited = await checkRateLimit(user.id, 'share')
    if (limited) return limited

    const { data: existing } = await supabase
      .from('career_arc_shares')
      .select(SHARE_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing) return NextResponse.json({ share: shape(existing as ShareRow) })

    const d = DEFAULT_SHARE_SETTINGS
    const { data, error } = await supabase
      .from('career_arc_shares')
      .insert({
        user_id: user.id,
        token: generateShareToken(),
        claim_redactions: d.claimRedactions,
        first_name_only: d.firstNameOnly,
        hide_employers: d.hideEmployers,
        hide_dates: d.hideDates,
        include_break: d.includeBreak,
      })
      .select(SHARE_COLUMNS)
      .single()
    if (error) throw error
    return NextResponse.json({ share: shape(data as ShareRow) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, user, res } = await requireUser()
    if (!user) return res
    const limited = await checkRateLimit(user.id, 'share')
    if (limited) return limited

    const body = await req.json().catch(() => ({}))
    const action = typeof body?.action === 'string' ? body.action : ''

    if (action === 'settings') {
      const { data: cards, error: cardsErr } = await supabase
        .from('career_evidence')
        .select('id')
        .eq('user_id', user.id)
      if (cardsErr) throw cardsErr
      const settings: ShareSettings | null = validateShareSettings(
        body?.settings,
        new Set((cards ?? []).map((c: { id: string }) => c.id)),
      )
      if (!settings) {
        return NextResponse.json({ error: 'Those share settings are not valid.' }, { status: 422 })
      }
      const { data, error } = await supabase
        .from('career_arc_shares')
        .update({
          claim_redactions: settings.claimRedactions,
          first_name_only: settings.firstNameOnly,
          hide_employers: settings.hideEmployers,
          hide_dates: settings.hideDates,
          include_break: settings.includeBreak,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select(SHARE_COLUMNS)
        .single()
      if (error) throw error
      return NextResponse.json({ share: shape(data as ShareRow) })
    }

    if (action === 'expiry') {
      const days = body?.days ?? null
      if (!SHARE_EXPIRY_CHOICES.includes(days)) {
        return NextResponse.json({ error: 'Expiry must be 7, 30 or null.' }, { status: 422 })
      }
      const expires_at = days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('career_arc_shares')
        .update({ expires_at, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .select(SHARE_COLUMNS)
        .single()
      if (error) throw error
      return NextResponse.json({ share: shape(data as ShareRow) })
    }

    if (action === 'revoke' || action === 'unrevoke') {
      const { data, error } = await supabase
        .from('career_arc_shares')
        .update({ revoked: action === 'revoke', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .select(SHARE_COLUMNS)
        .single()
      if (error) throw error
      return NextResponse.json({ share: shape(data as ShareRow) })
    }

    if (action === 'regenerate') {
      // New token, same settings — the old URL dies immediately.
      const { data, error } = await supabase
        .from('career_arc_shares')
        .update({ token: generateShareToken(), revoked: false, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .select(SHARE_COLUMNS)
        .single()
      if (error) throw error
      return NextResponse.json({ share: shape(data as ShareRow) })
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
