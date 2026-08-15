/**
 * Canonical origins for the three surfaces Tailr serves from one deployment:
 *
 *   marketing  www.gettailr.com      the landing site
 *   app        app.gettailr.com      the CONSUMER product + the token doorways
 *   business   agencies.gettailr.com Tailr for Agencies + the hiring managers
 *
 * Defaults keep apex gettailr.com working until DNS + Vercel env are flipped
 * (see docs/DOMAINS.md). Set NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_MARKETING_URL /
 * NEXT_PUBLIC_BUSINESS_URL in Vercel when the new hosts are live.
 *
 * The business origin is env-configured with no hardcoded host constant, so
 * moving the B2B product to a bought domain is a config + DNS change and not a
 * code change.
 *
 * WHICH SURFACE OWNS THE DOORWAYS. /portal, /rights, /consent and /reference
 * are candidate- and referee-facing, and belong to the APP origin, not the
 * business one: a candidate exercising a right, or a referee declining to
 * comment, should not be sent to a domain branded for the agency they are
 * answering. They were previously in neither list, which is why www happily
 * served them.
 */

import type { AuthDoor } from "@/lib/auth-paths"

const APEX = "https://gettailr.com"

/**
 * Turn a configured value into something `new URL()` will accept as a base,
 * or return null so the caller falls through to its default.
 *
 * A scheme-less value like `localhost:3000` is the failure this exists for:
 * the proxy uses these origins as redirect bases and threw ERR_INVALID_URL on
 * one, 500ing the exact path an auth error travels — so a user whose magic
 * link failed got a server error instead of the toast explaining why. The
 * same value in an email builds a link that silently goes nowhere.
 *
 * Localhost gets http, everything else https: nobody runs a dev server behind
 * TLS here, and guessing https for localhost would break every local link.
 */
function normaliseOrigin(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  const withScheme = /^https?:\/\//i.test(value)
    ? value
    : `${/^(localhost|127\.0\.0\.1)(:|$)/i.test(value) ? "http" : "https"}://${value}`
  try {
    // .origin does the normalising — it drops any path and trailing slash. A
    // manual strip first would eat the scheme's own `//` and turn `http://`
    // into the hostname `http`, which parses and is completely wrong.
    const url = new URL(withScheme)
    return url.hostname ? url.origin : null
  } catch {
    return null
  }
}

export function getAppOrigin(): string {
  return (
    normaliseOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normaliseOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    APEX
  )
}

export function getMarketingOrigin(): string {
  return normaliseOrigin(process.env.NEXT_PUBLIC_MARKETING_URL) ?? "https://www.gettailr.com"
}

export function getBusinessOrigin(): string {
  return normaliseOrigin(process.env.NEXT_PUBLIC_BUSINESS_URL) ?? "https://agencies.gettailr.com"
}

/** Absolute B2B URL, e.g. businessPath('/agencies') → https://agencies.gettailr.com/agencies */
export function businessPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  return `${getBusinessOrigin()}${p}`
}

/** Hostname of an origin, lowercased and port-stripped, for host comparisons. */
export function originHost(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return ""
  }
}

/** Derived, never a constant — the business domain is expected to change. */
export function getBusinessHost(): string {
  return originHost(getBusinessOrigin())
}

/** Absolute product URL, e.g. appPath('/tailor') → https://app.gettailr.com/tailor */
export function appPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  return `${getAppOrigin()}${p}`
}

export function marketingPath(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`
  if (p === "/") return getMarketingOrigin()
  return `${getMarketingOrigin()}${p}`
}

/** Hostnames used by middleware redirects once the split is live. */
export const APP_HOST = "app.gettailr.com"
export const MARKETING_HOST = "www.gettailr.com"
export const APEX_HOST = "gettailr.com"

/**
 * Path prefixes that belong on the BUSINESS host.
 *
 * Checked before the app list, and subtracted from it below, because `/api` is
 * an app prefix and `/api/agency` starts with `/api` — so isAppPath() would
 * otherwise claim every agency API route. Encoding that here rather than
 * relying on every caller to test in the right order: one guard, not two.
 */
export const BUSINESS_PATH_PREFIXES = [
  "/agencies",
  "/hiring",
  "/api/agency",
  "/api/hiring",
] as const

const startsWithPrefix = (pathname: string, prefixes: readonly string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))

export function isBusinessPath(pathname: string): boolean {
  return startsWithPrefix(pathname, BUSINESS_PATH_PREFIXES)
}

/** Product path prefixes that belong on the app host (not marketing). */
export const APP_PATH_PREFIXES = [
  "/tailor",
  "/tracker",
  "/history",
  "/career-path",
  "/career-arc",
  "/arc",
  "/admin",
  "/login",
  "/pricing",
  "/privacy",
  "/auth",
  "/api",
  // The token doorways. Candidate- and referee-facing, so they live with the
  // consumer app rather than the agency that sent them.
  "/portal",
  "/rights",
  "/consent",
  "/reference",
] as const

export function isAppPath(pathname: string): boolean {
  if (isBusinessPath(pathname)) return false
  return startsWithPrefix(pathname, APP_PATH_PREFIXES)
}

/**
 * Paths served identically on EVERY host and never host-redirected.
 *
 * `/auth` — the shared sign-in engine. Both doors post to the same OTP route
 * and complete on the same /auth/confirm, and that completion must finish on
 * the host it started on: confirm-sign-in.tsx navigates relatively on purpose,
 * because an absolute origin yanks a staging magic-link onto production and
 * drops the session it just minted.
 *
 * `/api` — redirecting an API call cross-origin turns a working same-origin
 * POST into a CORS failure. Every page is already on the right host by the
 * time it calls its own API, so there is nothing to correct and a redirect can
 * only break it.
 */
export const HOST_NEUTRAL_PREFIXES = ["/auth", "/api"] as const

export function isHostNeutralPath(pathname: string): boolean {
  return startsWithPrefix(pathname, HOST_NEUTRAL_PREFIXES)
}

/**
 * Which front door a request came through, from its Host header.
 *
 * Host, not a query parameter: a `?door=business` would be a claim the visitor
 * could make about themselves. This only decides where someone lands — it
 * grants nothing, and every hat is re-checked against the database.
 */
export function doorFromHost(host: string | null | undefined): AuthDoor {
  const h = host?.split(":")[0]?.toLowerCase() ?? ""
  const business = getBusinessHost()
  return business && h === business ? "business" : "consumer"
}
