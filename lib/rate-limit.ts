import { createHash } from 'crypto'
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
  // Unauthenticated sign-in email sends (magic link / OTP). Keyed per target
  // email address by the caller — stops the endpoint being used to email-bomb
  // an inbox. The per-network charge uses "auth_net" below, not this.
  auth: [
    { key: 'auth:min', limit: 3,  windowSeconds: 60 },
    { key: 'auth:day', limit: 15, windowSeconds: DAY },
  ],
  // Per NETWORK, per front door — a flood ceiling for sign-in email only. On
  // 28 Sep 2026 request-otp charged the caller's network at "auth" (3/min,
  // 15/day), a number set for one person, so the fourth colleague in one
  // office asking for a code for their OWN address was refused. An office
  // signing in together passes this; one network is capped at 200 sign-in
  // emails a day per door (400 across both doors, where the old number allowed
  // 30). It is NOT the Resend account quota: nothing caps the total across
  // networks, and rotating addresses reaches that quota whatever this says.
  // The same ceiling bounds, per source, the generateLink side effects (its
  // error messages, junk sign-ups, and using up someone's per-address bucket).
  // What stops an inbox being flooded is the per-ADDRESS "auth" charge above,
  // and it is unchanged.
  auth_net: [
    { key: 'auth_net:min', limit: 20,  windowSeconds: 60 },
    { key: 'auth_net:day', limit: 200, windowSeconds: DAY },
  ],
  // Career Arc share-link writes (create / regenerate / settings). Cheap DB
  // ops, but token regeneration and settings churn shouldn't be scriptable.
  share: [
    { key: 'share:min', limit: 10, windowSeconds: 60 },
    { key: 'share:day', limit: 60, windowSeconds: DAY },
  ],
  // An owner inviting teammates. Each new address creates a Tailr account and
  // sends an email, so a loop would create accounts for strangers
  // (30 Sep 2026 access audit).
  team_invite: [
    { key: 'team_invite:min', limit: 10, windowSeconds: 60 },
    { key: 'team_invite:day', limit: 50, windowSeconds: DAY },
  ],
  // File uploads to private buckets (the job description on a brief). Each
  // call can store 10 MB and uploading never changes a version, so nothing
  // else would notice a loop; this does.
  upload: [
    { key: 'upload:min', limit: 10,  windowSeconds: 60 },
    { key: 'upload:day', limit: 100, windowSeconds: DAY },
  ],
  // The token doorways (booking, consent, reference): anonymous pages whose
  // only credential is a 192-bit link token (randomBytes(24), stored hashed).
  // Guessing one is infeasible at any request rate, so these limits are NOT
  // anti-guessing — they only stop a flood. Two ceilings, used together by
  // checkDoorwayLimit():
  //
  // Per LINK — generous for one person, who opens the page, picks, changes
  // their mind, reloads. Nobody else shares this bucket.
  doorway_link: [
    { key: 'doorway_link:min', limit: 20,  windowSeconds: 60 },
    { key: 'doorway_link:day', limit: 200, windowSeconds: DAY },
  ],
  // Per NETWORK — a flood ceiling only. An office, a family Wi-Fi or a mobile
  // carrier's NAT puts many real candidates behind one address; on 28 Sep 2026
  // the "auth" tier (3/min per IP) refused the second of them, and the page
  // showed "That link is not valid". High enough that shared networks never
  // meet it, low enough that a script hammering the endpoint does.
  doorway_net: [
    { key: 'doorway_net:min', limit: 120,  windowSeconds: 60 },
    { key: 'doorway_net:day', limit: 3000, windowSeconds: DAY },
  ],
  // Per LINK, for doorway writes that reach a person's inbox (the consent
  // answer emails every recruiter on the agency). doorway_link's 20/min is
  // right for reading and choosing, but as an email ceiling it would allow 200
  // recruiter emails a day from one scripted link. A real candidate answers
  // once, maybe changes their mind; five a minute is far past that. Per link,
  // so a second candidate on the same Wi-Fi never shares it.
  doorway_write: [
    { key: 'doorway_write:min', limit: 5,  windowSeconds: 60 },
    { key: 'doorway_write:day', limit: 20, windowSeconds: DAY },
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

/** Deterministic UUID from an arbitrary seed (email, IP…) so anonymous
 * callers can share the same fixed-window counters. No FK on rate_limits. */
export function anonRateLimitId(seed: string): string {
  const h = createHash('sha256').update(seed.trim().toLowerCase()).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** The one 429 every limiter answers with, so pages read a single shape. */
/** The one 429 every limit answers with — also used where an upstream service
 *  (Supabase's own per-account wait) refuses, so the words never differ. */
export function limitedResponse(resetSeconds: number): NextResponse {
  const mins = Math.ceil(resetSeconds / 60)
  const wait = resetSeconds >= 3600
    ? `${Math.ceil(resetSeconds / 3600)} hour(s)`
    : resetSeconds >= 60 ? `${mins} minute(s)` : `${resetSeconds} second(s)`
  return NextResponse.json(
    { error: `You're doing that a lot — please wait ${wait} and try again.` },
    { status: 429, headers: { 'Retry-After': String(resetSeconds) } },
  )
}

async function enforce(userId: string, rules: Rule[]): Promise<NextResponse | null> {
  for (const rule of rules) {
    const { allowed, resetSeconds } = await consume(userId, rule)
    if (!allowed) return limitedResponse(resetSeconds)
  }
  return null
}

/**
 * Enforce the given preset for a user. Returns a 429 NextResponse if any rule
 * is exceeded, otherwise null (proceed).
 */
export async function checkRateLimit(userId: string, preset: RateLimitPreset): Promise<NextResponse | null> {
  return enforce(userId, PRESETS[preset])
}

/**
 * The two counter ids a token doorway request is charged to. Pure, so a test
 * can prove the property the 28 Sep bug lacked: two links on one network get
 * DIFFERENT link ids (one candidate never spends another's allowance) and the
 * SAME network id (the flood ceiling still sees them together).
 *
 * The link seed is sha256(token), never the raw token — seeds are the kind of
 * thing that ends up in a log line.
 */
export function doorwayLimitIds(doorway: string, ip: string, token: string): { net: string; link: string } {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return {
    net: anonRateLimitId(`${doorway}:net:${ip}`),
    link: anonRateLimitId(`${doorway}:link:${tokenHash}`),
  }
}

/**
 * Rate limit for an anonymous token doorway (booking, consent, reference).
 * Consumes the per-network flood ceiling first, then the per-link ceiling.
 * Returns the same 429 shape as checkRateLimit (with Retry-After), or null.
 *
 * Not for sign-in or OTP routes: those send email and keep the strict "auth"
 * tier per address on purpose (with "auth_net" as their per-network ceiling).
 */
export async function checkDoorwayLimit(doorway: string, ip: string, token: string): Promise<NextResponse | null> {
  const ids = doorwayLimitIds(doorway, ip, token)
  return (await enforce(ids.net, PRESETS.doorway_net)) ?? (await enforce(ids.link, PRESETS.doorway_link))
}

/**
 * The extra per-link ceiling for a doorway write that notifies someone (the
 * consent answer). Call it after checkDoorwayLimit. Keyed by the same link id,
 * so it never touches another candidate's allowance on a shared network.
 */
export async function checkDoorwayWriteLimit(doorway: string, token: string): Promise<NextResponse | null> {
  // The link id does not depend on the address; any ip gives the same one.
  return enforce(doorwayLimitIds(doorway, '', token).link, PRESETS.doorway_write)
}
