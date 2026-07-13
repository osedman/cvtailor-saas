import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { runPostAuth } from '@/lib/post-auth'
import { getAppOrigin } from '@/lib/site-url'
import { withAuthCookieOptions } from '@/lib/supabase/cookie-options'

/**
 * PKCE code-exchange flow. Kept for backward compatibility.
 * Cookies are written onto the redirect response so the session sticks.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const nextRaw = searchParams.get('next') ?? '/tailor'
  const next = nextRaw.startsWith('/') ? nextRaw : `/${nextRaw}`
  const app = getAppOrigin()

  const fail = (description: string) =>
    NextResponse.redirect(
      `${app}/tailor?error=auth&error_description=${encodeURIComponent(description)}`,
    )

  if (!code) {
    return fail('link expired or already used')
  }

  let redirect = NextResponse.redirect(`${app}${next}`)

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
  return redirect
}
