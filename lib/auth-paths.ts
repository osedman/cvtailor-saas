/**
 * The `next` guard and the landing constants — in a module with NO server
 * imports, so client components can use them.
 *
 * These lived in lib/hat-routing.ts, which imports agencyAdmin and therefore
 * drags next/headers plus the service-role key into anything that touches it.
 * A client component importing the guard from there fails the build (types are
 * erased and travel fine; runtime values are not and do not — the same reason
 * settings-limits.ts and round-delta.ts exist).
 *
 * That mattered in practice: app/login/page.tsx could not import the shared
 * guard, so it grew its own copy, and the copy drifted permissive — it checked
 * the leading slash and the scheme but not the backslash. Splitting the module
 * is what makes "one guard, not four" actually available to every caller.
 *
 * hat-routing.ts re-exports all of this, so existing importers are unchanged.
 */

/** Where a consumer lands when nobody asked for anywhere else. */
export const DEFAULT_LANDING = "/tailor"
/** Where a hiring manager lands. */
export const HIRING_LANDING = "/hiring"
/** Where a recruiter lands when they came through the business door. */
export const AGENCY_LANDING = "/agencies"

/**
 * Which front door a sign-in came through.
 *
 * Derived from the request host, never from a query parameter, so a shared or
 * doctored link cannot claim a door the visitor did not actually use. The door
 * changes only where someone LANDS — it grants nothing, and every hat is still
 * checked against the database afterwards.
 */
export type AuthDoor = "consumer" | "business"

/** The consumer door's own landing, for a person with no B2B hat at all. */
export const DOOR_FALLBACK: Record<AuthDoor, string> = {
  consumer: DEFAULT_LANDING,
  // Someone who reached the business door without a hat sees the agency
  // product's own "you are not in an agency" state. Dropping them into the
  // consumer app instead answers a question they did not ask.
  business: AGENCY_LANDING,
}

/**
 * Same-origin relative paths only — an open redirect here would be handed a
 * freshly-minted session, so this is the strictest check in the flow.
 *
 * The backslash cases are not paranoia: browsers normalise `\` to `/` in URLs,
 * so `/\evil.example.com` and `/\/evil.example.com` are read as
 * protocol-relative and navigate off-origin exactly like `//evil.example.com`.
 * Any backslash is rejected outright — no legitimate route in this app has one.
 *
 * Returns null rather than a default so each caller states its own landing.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const next = raw.trim()
  if (!next.startsWith("/") || next.startsWith("//")) return null
  if (next.includes("\\")) return null
  if (next.includes("://")) return null
  if (next.length > 512) return null
  return next
}
