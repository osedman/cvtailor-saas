import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  APEX_HOST,
  APP_HOST,
  MARKETING_HOST,
  getMarketingOrigin,
  getAppOrigin,
  isAppPath,
} from '@/lib/site-url'

/**
 * Next.js 16 proxy (replaces middleware.ts). Handles:
 * 1. www/app domain-split redirects (see docs/DOMAINS.md)
 * 2. Supabase session refresh for Auth
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? ''
  const { pathname, search } = request.nextUrl
  const splitEnabled = process.env.DOMAIN_SPLIT_ENABLED === 'true'

  // app.gettailr.com/ → marketing site owns the landing page
  if (host === APP_HOST && (pathname === '/' || pathname === '')) {
    return NextResponse.redirect(new URL(getMarketingOrigin()), 308)
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
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — required for Supabase Auth to work correctly
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon-|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
