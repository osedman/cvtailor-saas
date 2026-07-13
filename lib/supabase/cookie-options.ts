/**
 * Shared cookie options for Supabase Auth sessions.
 *
 * Cookie Max-Age is left to @supabase/ssr (very long) so the browser keeps
 * sending refresh tokens; Supabase Auth still controls when the session dies.
 *
 * Domain `.gettailr.com` lets a session survive across app / www / apex after
 * the domain split — without it, signing in on one host looks "logged out"
 * on another and users keep requesting magic links.
 */

const PRODUCT_COOKIE_DOMAIN = ".gettailr.com"

export function authCookieOptions(): { domain?: string; path: string; sameSite: "lax" } {
  const explicit = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim()
  if (explicit) {
    return { domain: explicit, path: "/", sameSite: "lax" }
  }

  // Only apply the shared parent domain in production-like hosts. Localhost
  // and Vercel preview URLs must stay host-only or cookies won't set at all.
  if (typeof process !== "undefined" && process.env.VERCEL_ENV === "production") {
    return { domain: PRODUCT_COOKIE_DOMAIN, path: "/", sameSite: "lax" }
  }

  return { path: "/", sameSite: "lax" }
}

/** Merge Supabase-provided cookie options with our domain/path defaults. */
export function withAuthCookieOptions(
  options?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...options, ...authCookieOptions() }
}
