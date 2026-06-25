import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { runPostAuth } from '@/lib/post-auth'

/**
 * Stateless magic-link verification via token_hash. Unlike the PKCE code flow
 * (/auth/callback), this does NOT need a verifier cookie, so it works when the
 * link is opened on a different device/browser than the one that requested it,
 * and survives email link scanners. This is the primary sign-in path.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = (searchParams.get('type') as EmailOtpType | null) ?? 'email'
  const next = searchParams.get('next') ?? '/tailor'

  if (token_hash) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      await runPostAuth(data?.user, request)
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/confirm] verifyOtp failed:', error.message)
  }

  return NextResponse.redirect(`${origin}/?error=auth&error_description=${encodeURIComponent('link expired or already used')}`)
}
