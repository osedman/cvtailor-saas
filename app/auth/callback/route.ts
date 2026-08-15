import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { runPostAuth } from '@/lib/post-auth'
import { doorFromHost, getAppOrigin, getBusinessOrigin } from '@/lib/site-url'
import { withAuthCookieOptions } from '@/lib/supabase/cookie-options'
import { DOOR_FALLBACK } from '@/lib/auth-paths'
import { resolveLandingPath, safeNextPath } from '@/lib/hat-routing'

/**
 * PKCE code-exchange flow. Kept for backward compatibility.
 * Cookies are written onto the redirect response so the session sticks.
 *
 * Every redirect below stays on the origin the exchange arrived at. Pinning
 * them to the consumer origin — which is what this did before the product
 * split — sends a recruiter who signed in at the business domain into the
 * consumer app, and on a non-subdomain business host it also strips the
 * session cookies written during the exchange, landing them signed out.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  // An explicit next wins; without one the destination depends on which hats
  // this person wears, which we only know once the session exists.
  const requestedNext = safeNextPath(searchParams.get('next'))
  const door = doorFromHost(request.headers.get('host'))
  const origin = door === 'business' ? getBusinessOrigin() : getAppOrigin()

  const fail = (description: string) =>
    NextResponse.redirect(
      `${origin}${DOOR_FALLBACK[door]}?error=auth&error_description=${encodeURIComponent(description)}`,
    )

  if (!code) {
    return fail('link expired or already used')
  }

  // Provisional target; rewritten below once the user is known. Cookies are
  // set on this response, so it has to exist before the exchange.
  let redirect = NextResponse.redirect(`${origin}${requestedNext ?? DOOR_FALLBACK[door]}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            redirect.cookies.set(name, value, withAuthCookieOptions(options))
          })
        },
      },
    },
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/callback] code exchange failed:', error.message)
    return fail(error.message || 'link expired or already used')
  }

  await runPostAuth(data?.user, request)

  // Rewrite the Location rather than building a new response: the session
  // cookies were written onto `redirect` during the exchange above, and a
  // fresh NextResponse would drop them and land the user signed out.
  const landing = await resolveLandingPath(data?.user?.id, requestedNext, door)
  redirect.headers.set('location', `${origin}${landing}`)
  return redirect
}
