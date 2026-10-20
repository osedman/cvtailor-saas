"use client"

/**
 * Product analytics that does not measure the token doorways.
 *
 * `/consent`, `/reference`, `/rights`, `/portal` and the consumer `/arc` share
 * are opened by candidates, referees, clients and strangers — people
 * exercising a right or answering a request, not users of a product. Their
 * visits are not ours to count. Every one of those paths also carries a secret
 * in the URL, so measuring them risks writing a live token into an analytics
 * record we do not control and cannot purge.
 *
 * Splitting consumer from business needs nothing here: the two products are on
 * different hosts and events carry the full URL, so the domain already
 * separates them.
 *
 * The check runs in `beforeSend` as well as at render. Render alone is not
 * enough — a client-side navigation into a doorway can fire an event before
 * this component re-renders, and "usually caught" is not a property worth
 * having when the thing not caught is a live token.
 */

import { Analytics } from "@vercel/analytics/next"
import { usePathname } from "next/navigation"

/**
 * Paths whose URLs contain a secret. Deliberately NOT imported from
 * lib/site-url: those lists answer "which host serves this", a question that
 * will keep changing, and this one answers "is there a token in this URL",
 * which must not change as a side effect of editing a routing list.
 */
const TOKEN_BEARING = ["/consent", "/reference", "/rights", "/portal", "/arc"] as const

function isTokenBearing(pathname: string): boolean {
  return TOKEN_BEARING.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function pathnameOf(url: string): string {
  // Events carry an absolute URL. Parse defensively — a throw inside the
  // analytics callback would be an exception on every page.
  try {
    return new URL(url, "http://localhost").pathname
  } catch {
    return url
  }
}

export function ProductAnalytics() {
  const pathname = usePathname() ?? ""
  if (isTokenBearing(pathname)) return null

  return <Analytics beforeSend={(event) => (isTokenBearing(pathnameOf(event.url)) ? null : event)} />
}

/** Exported for the test — the doorway list is the whole point of this file. */
export const __TOKEN_BEARING = TOKEN_BEARING
export { isTokenBearing }
