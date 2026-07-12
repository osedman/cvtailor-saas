import { NextResponse, type NextRequest } from "next/server"
import {
  APEX_HOST,
  APP_HOST,
  MARKETING_HOST,
  getMarketingOrigin,
  getAppOrigin,
  isAppPath,
} from "@/lib/site-url"

/**
 * Domain-split redirects for www (marketing) vs app (product).
 *
 * Safe by default: only rewrites traffic that is already on the new hostnames,
 * or apex traffic when DOMAIN_SPLIT_ENABLED=true (set in Vercel after DNS is live).
 * See docs/DOMAINS.md.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? ""
  const { pathname, search } = request.nextUrl
  const splitEnabled = process.env.DOMAIN_SPLIT_ENABLED === "true"

  // app.gettailr.com/ → marketing site owns the landing page
  if (host === APP_HOST && (pathname === "/" || pathname === "")) {
    const dest = new URL(getMarketingOrigin())
    return NextResponse.redirect(dest, 308)
  }

  // Apex product routes → app subdomain (only once split is flipped on)
  if (splitEnabled && host === APEX_HOST && isAppPath(pathname)) {
    const dest = new URL(`${getAppOrigin()}${pathname}${search}`)
    return NextResponse.redirect(dest, 308)
  }

  // Apex marketing (home) → www (only once split is flipped on)
  if (splitEnabled && host === APEX_HOST && (pathname === "/" || pathname === "")) {
    const dest = new URL(getMarketingOrigin())
    return NextResponse.redirect(dest, 308)
  }

  // www should not serve the product app — send app paths to app host
  if (host === MARKETING_HOST && isAppPath(pathname)) {
    // If www is this same Next deploy during transition, bounce product paths to app.
    // When www is Framer/Webflow, those paths simply won't exist there.
    const dest = new URL(`${getAppOrigin()}${pathname}${search}`)
    return NextResponse.redirect(dest, 308)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Skip Next internals and static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon-|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
