/**
 * Feature gates for staged rollouts.
 *
 * The career-path cluster (North Star path, quick wins, live market, Career
 * Arc) ships to production behind a small allowlist first — the 28 Jul beta.
 *
 * Membership lives in the `beta_access` table (migration 017), NOT in code:
 * the repo is public, and teammates' personal addresses don't belong in it.
 * The DB also beats an env var here — adding a tester is an INSERT, not a
 * redeploy. A BETA_EMAILS env var is still honoured as an override for
 * emergencies, and admins always pass, so neither a missing table nor a
 * missing env var can lock the owner out of their own feature.
 *
 * Server-side only — routes 403 non-beta users and the client surfaces treat
 * a 403 the same as "no roadmap": they render nothing. Remove the gate by
 * making isCareerPathBeta return true, not by editing every call site.
 */
import { isAdminEmail } from './admin'
import { createAdminClient } from './supabase/server'

function envBetaEmails(): string[] {
  return (process.env.BETA_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Per-lambda cache so the gate costs one DB read per email per 5 minutes,
 * not one per request. Revoking access takes effect within the TTL. */
const cache = new Map<string, { allowed: boolean; at: number }>()
const TTL_MS = 5 * 60_000

export async function isCareerPathBeta(email: string | undefined | null): Promise<boolean> {
  // 30 Jul 2026: the career-path cluster is generally available. The gate is
  // lifted here (the designed removal point — see the header comment) rather
  // than by deleting call sites, so a rollback is a one-line revert. The
  // beta_access table and BETA_EMAILS env override stay in place, unread.
  void email
  return true
}

// Retained for a fast re-gate: the pre-GA allowlist logic, unchanged.
async function isCareerPathBetaAllowlisted(email: string | undefined | null): Promise<boolean> {
  if (isAdminEmail(email)) return true
  if (!email) return false
  const key = email.toLowerCase()
  if (envBetaEmails().includes(key)) return true

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.allowed

  let allowed = false
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('beta_access').select('email').eq('email', key).maybeSingle()
    allowed = !!data
  } catch {
    // A DB hiccup must not 403 a legitimate beta user's whole session; fall
    // back to the last cached answer, else deny.
    allowed = hit?.allowed ?? false
  }
  cache.set(key, { allowed, at: Date.now() })
  return allowed
}
void isCareerPathBetaAllowlisted

/** Shared 403 body so clients can tell "not invited" from a real error. */
export const BETA_LOCKED = { error: 'private-beta' } as const
