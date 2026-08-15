/**
 * Shared cookie options for Supabase Auth sessions.
 *
 * Cookie Max-Age is left to @supabase/ssr (very long) so the browser keeps
 * sending refresh tokens; Supabase Auth still controls when the session dies.
 *
 * Domain `.gettailr.com` lets a session survive across app / www / apex —
 * without it, signing in on one host looks "logged out" on another and users
 * keep requesting magic links.
 *
 * THE BUSINESS HOST IS THE EXCEPTION, and it is the reason this file takes a
 * host at all (14 Aug, the product split). The business domain is a
 * `gettailr.com` subdomain today, so a parent-domain cookie would silently
 * hand the agency product the consumer session and vice versa — the two
 * products would share a login through a DNS coincidence, which is exactly
 * what "separate" was meant to stop. Business hosts are therefore always
 * host-only: one auth pool underneath, two sessions above it. A person with
 * both hats signs in to each side once, which is the honest behaviour and
 * also what happens automatically if the business domain later moves off
 * gettailr.com entirely.
 *
 * The host is passed in on the server (where it comes from the request) and
 * read from `window.location` in the browser. When it is unknown, the
 * consumer default applies — the business surface is the narrower case, so
 * an unknown host should never silently widen a session's scope.
 */

import { getBusinessHost } from "@/lib/site-url"

const PRODUCT_COOKIE_DOMAIN = ".gettailr.com"

type AuthCookieOptions = { domain?: string; path: string; sameSite: "lax" }

const HOST_ONLY: AuthCookieOptions = { path: "/", sameSite: "lax" }

/** Strip the port and lowercase, so `Agencies.gettailr.com:443` compares. */
function bareHost(host: string | null | undefined): string | null {
  const value = host?.trim().toLowerCase().split(":")[0]
  return value || null
}

/**
 * True when this host serves the business product. Matches the configured
 * business host and anything beneath it, so a preview or regional subdomain
 * does not accidentally fall back to the shared consumer cookie.
 */
export function isBusinessHost(host: string | null | undefined): boolean {
  const hostname = bareHost(host)
  const business = bareHost(getBusinessHost())
  if (!hostname || !business) return false
  return hostname === business || hostname.endsWith(`.${business}`)
}

function currentHost(host?: string | null): string | null {
  if (host !== undefined) return bareHost(host)
  if (typeof window !== "undefined") return bareHost(window.location.hostname)
  return null
}

export function authCookieOptions(host?: string | null): AuthCookieOptions {
  // Checked before the explicit override: the override exists to widen the
  // consumer session across hosts, and widening it onto the business product
  // is the one thing it must never do.
  if (isBusinessHost(currentHost(host))) return HOST_ONLY

  const explicit = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim()
  if (explicit) {
    return { domain: explicit, path: "/", sameSite: "lax" }
  }

  // Only apply the shared parent domain in production-like hosts. Localhost
  // and Vercel preview URLs must stay host-only or cookies won't set at all.
  if (typeof process !== "undefined" && process.env.VERCEL_ENV === "production") {
    return { domain: PRODUCT_COOKIE_DOMAIN, path: "/", sameSite: "lax" }
  }

  return HOST_ONLY
}

/** Merge Supabase-provided cookie options with our domain/path defaults. */
export function withAuthCookieOptions(
  options?: Record<string, unknown>,
  host?: string | null,
): Record<string, unknown> {
  return { ...options, ...authCookieOptions(host) }
}
