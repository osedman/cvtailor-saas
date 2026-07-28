/**
 * Feature gates for staged rollouts.
 *
 * The career-path cluster (North Star path, quick wins, live market, Career
 * Arc) ships to production behind a small email allowlist first — the 28 Jul
 * beta. The list lives in the BETA_EMAILS env var (comma-separated), NOT in
 * this file: the repo is public, and teammates' personal addresses don't
 * belong in it. Admins always pass, so a missing env var can never lock the
 * owner out of their own feature.
 *
 * Server-side only — routes 403 non-beta users and the client surfaces treat
 * a 403 the same as "no roadmap": they render nothing. Remove the gate by
 * deleting the env var check, not by editing every call site.
 */
import { isAdminEmail } from './admin'

function betaEmails(): string[] {
  return (process.env.BETA_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isCareerPathBeta(email: string | undefined | null): boolean {
  if (isAdminEmail(email)) return true
  return !!email && betaEmails().includes(email.toLowerCase())
}

/** Shared 403 body so clients can tell "not invited" from a real error. */
export const BETA_LOCKED = { error: 'private-beta' } as const
