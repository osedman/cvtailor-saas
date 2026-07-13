import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { runPostAuth } from '@/lib/post-auth'
import { getAppOrigin } from '@/lib/site-url'
import { withAuthCookieOptions } from '@/lib/supabase/cookie-options'

/**
 * Stateless magic-link verification via token_hash. Also accepts ?code= (PKCE).
 *
 * Session cookies are set on the redirect response so they survive the hop to
 * /tailor. Always redirects to the product origin (app.gettailr.com).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const token_hash = searchParams.get('token_hash')
  const code = searchParams.get('code')
  const type = (searchParams.get('type') as EmailOtpType | null) ?? 'email'
  const nextRaw = searchParams.get('next') ?? '/tailor'
  const next = nextRaw.startsWith('/') ? nextRaw : `/${nextRaw}`
  const app = getAppOrigin()

  const fail = (description: string) =>
    NextResponse.redirect(
      `${app}/tailor?error=auth&error_description=${encodeURIComponent(description)}`,
    )

  if (!token_hash && !code) {
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

  if (token_hash) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (error) {
      console.error('[auth/confirm] verifyOtp failed:', error.message)
      return fail(error.message || 'link expired or already used')
    }
    await runPostAuth(data?.user, request)
    return redirect
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code!)
  if (error) {
    console.error('[auth/confirm] code exchange failed:', error.message)
    return fail(error.message || 'link expired or already used')
  }
  await runPostAuth(data?.user, request)
  return redirect
}
