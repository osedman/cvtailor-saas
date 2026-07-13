import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { runPostAuth } from '@/lib/post-auth'
import { getAppOrigin } from '@/lib/site-url'

/**
 * Stateless magic-link verification via token_hash. Unlike the PKCE code flow
 * (/auth/callback), this does NOT need a verifier cookie, so it works when the
 * link is opened on a different device/browser than the one that requested it.
 *
 * Also accepts ?code= (PKCE) for links still minted that way — exchanges the
 * code here so users aren't bounced with a false "expired" error.
 *
 * Always redirects to the product origin (app.gettailr.com), never the request
 * origin — after the www/app split, failing back to app/?error= was stripped by
 * the proxy into a silent www homepage.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
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

  const supabase = await createClient()

  if (token_hash) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      await runPostAuth(data?.user, request)
      return NextResponse.redirect(`${app}${next}`)
    }
    console.error('[auth/confirm] verifyOtp failed:', error.message)
    return fail(error.message || 'link expired or already used')
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await runPostAuth(data?.user, request)
      return NextResponse.redirect(`${app}${next}`)
    }
    console.error('[auth/confirm] code exchange failed:', error.message)
    return fail(error.message || 'link expired or already used')
  }

  return fail('link expired or already used')
}
