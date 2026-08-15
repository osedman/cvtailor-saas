import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  APEX_HOST,
  APP_HOST,
  MARKETING_HOST,
  getBusinessHost,
  getBusinessOrigin,
  getMarketingOrigin,
  getAppOrigin,
  isAppPath,
  isBusinessPath,
  isHostNeutralPath,
} from '@/lib/site-url'
import { withAuthCookieOptions } from '@/lib/supabase/cookie-options'

/**
 * Next.js 16 proxy (replaces middleware.ts). Handles:
 * 1. www/app domain-split redirects (see docs/DOMAINS.md)
 * 2. consumer/business product-split redirects (see docs/DOMAINS.md)
 * 3. Supabase session refresh for Auth (keeps long-lived refresh cookies fresh)
 *
 * The product split keeps Tailr for Agencies (/agencies, /hiring) on its own
 * host and the consumer product on the app host. Both are served by this one
 * deployment, so there is one env-var set — the 28 Jul lesson about
 * Preview-scoped variables applies to every alternative to this.
 *
 * The token doorways (/portal, /rights, /consent, /reference) count as app
 * paths: see the note in lib/site-url.ts for why they belong with the
 * consumer app rather than the agency that sent them.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? ''
  const { pathname, search } = request.nextUrl
  const splitEnabled = process.env.DOMAIN_SPLIT_ENABLED === 'true'
  const businessHost = getBusinessHost()

  // The shared auth engine and the API are served on every host and are never
  // host-redirected — see isHostNeutralPath. Short-circuited before any rule
  // below so no later condition can accidentally claim them.
  const hostNeutral = isHostNeutralPath(pathname)

  // app.gettailr.com/ → marketing site owns the landing page.
  // Exception: auth error/success query params belong on /tailor (where the
  // toast lives). Never strip them into a silent www homepage.
  if (host === APP_HOST && (pathname === '/' || pathname === '')) {
    const params = request.nextUrl.searchParams
    if (params.has('error') || params.has('error_description') || params.has('code')) {
      return NextResponse.redirect(new URL(`/tailor${search}`, getAppOrigin()), 308)
    }
    return NextResponse.redirect(new URL(getMarketingOrigin()), 308)
  }

  // The business host's front page is the recruiter product, not marketing.
  if (splitEnabled && businessHost && host === businessHost) {
    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect(new URL('/agencies', getBusinessOrigin()), 308)
    }
    // A consumer path reached on the business host belongs on the app host.
    if (!hostNeutral && isAppPath(pathname)) {
      return NextResponse.redirect(new URL(`${getAppOrigin()}${pathname}${search}`), 308)
    }
  }

  // A business path reached on a consumer-facing host belongs on the business
  // host. isAppPath already subtracts business paths, but this is stated
  // explicitly so the ordering below is not load-bearing.
  if (
    splitEnabled &&
    businessHost &&
    !hostNeutral &&
    (host === APEX_HOST || host === APP_HOST || host === MARKETING_HOST) &&
    isBusinessPath(pathname)
  ) {
    return NextResponse.redirect(new URL(`${getBusinessOrigin()}${pathname}${search}`), 308)
  }

  // Apex product routes → app subdomain (only once split is flipped on)
  if (splitEnabled && host === APEX_HOST && isAppPath(pathname)) {
    return NextResponse.redirect(new URL(`${getAppOrigin()}${pathname}${search}`), 308)
  }

  // Apex marketing (home) → www (only once split is flipped on)
  if (splitEnabled && host === APEX_HOST && (pathname === '/' || pathname === '')) {
    return NextResponse.redirect(new URL(getMarketingOrigin()), 308)
  }

  // www should not serve the product app — send app paths to app host
  if (host === MARKETING_HOST && isAppPath(pathname)) {
    return NextResponse.redirect(new URL(`${getAppOrigin()}${pathname}${search}`), 308)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, withAuthCookieOptions(options, host))
          )
        },
      },
    }
  )

  // Refresh session — rotates the refresh token and writes new cookies so the
  // user stays signed in across visits without another magic link.
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
