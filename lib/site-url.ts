/**
 * Canonical origins for the www (marketing) / app (product) domain split.
 *
 * Defaults keep apex gettailr.com working until DNS + Vercel env are flipped
 * (see docs/DOMAINS.md). Set NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_MARKETING_URL
 * in Vercel when the new hosts are live.
 */

const APEX = "https://gettailr.com"

export function getAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    APEX
  )
}

export function getMarketingOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_MARKETING_URL?.replace(/\/$/, "") ||
    "https://www.gettailr.com"
  )
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
] as const

export function isAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}
