import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Per-user rate limiting for the AI endpoints, backed by the Supabase
 * consume_rate_limit() RPC (fixed-window counters). Protects against runaway
 * Claude API cost and abuse.
 *
 * Fail-open: if the limiter infrastructure errors (or the migration hasn't
 * been applied yet), requests are allowed rather than breaking the product —
 * the failure is logged. Tighten to fail-closed later if needed.
 */

type Rule = { key: string; limit: number; windowSeconds: number }

const DAY = 86_400

// Shared "ai:*" buckets span every generative endpoint so a user can't bypass
// a per-feature limit by spreading calls across features.
const PRESETS: Record<string, Rule[]> = {
  // The expensive two-pass tailor — tightest limits.
  tailor: [
    { key: 'tailor:min', limit: 6,   windowSeconds: 60 },
    { key: 'tailor:day', limit: 60,  windowSeconds: DAY },
    { key: 'ai:min',     limit: 20,  windowSeconds: 60 },
    { key: 'ai:day',     limit: 250, windowSeconds: DAY },
  ],
  // Cover letter, company analysis, interview prep, pitches.
  ai: [
    { key: 'ai:min', limit: 20,  windowSeconds: 60 },
    { key: 'ai:day', limit: 250, windowSeconds: DAY },
  ],
}

export type RateLimitPreset = keyof typeof PRESETS

async function consume(userId: string, rule: Rule): Promise<{ allowed: boolean; resetSeconds: number }> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_user_id: userId,
      p_key: rule.key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })
    if (error) {
      console.error('[rate-limit] rpc error:', error.message)
      return { allowed: true, resetSeconds: 0 } // fail-open
    }
    const d = data as { allowed: boolean; reset_seconds: number }
    return { allowed: d.allowed, resetSeconds: d.reset_seconds }
  } catch (e) {
    console.error('[rate-limit] error:', e)
    return { allowed: true, resetSeconds: 0 } // fail-open
  }
}

/**
 * Enforce the given preset for a user. Returns a 429 NextResponse if any rule
 * is exceeded, otherwise null (proceed).
 */
export async function checkRateLimit(userId: string, preset: RateLimitPreset): Promise<NextResponse | null> {
  for (const rule of PRESETS[preset]) {
    const { allowed, resetSeconds } = await consume(userId, rule)
    if (!allowed) {
      const mins = Math.ceil(resetSeconds / 60)
      const wait = resetSeconds >= 3600
        ? `${Math.ceil(resetSeconds / 3600)} hour(s)`
        : resetSeconds >= 60 ? `${mins} minute(s)` : `${resetSeconds} second(s)`
      return NextResponse.json(
        { error: `You're doing that a lot — please wait ${wait} and try again.` },
        { status: 429, headers: { 'Retry-After': String(resetSeconds) } },
      )
    }
  }
  return null
}
