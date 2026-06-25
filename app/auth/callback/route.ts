import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runPostAuth } from '@/lib/post-auth'

/**
 * PKCE code-exchange flow. Kept for backward compatibility and any link still
 * pointing here; the primary, more reliable path is /auth/confirm (token_hash),
 * which does not depend on the verifier cookie.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/tailor'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await runPostAuth(data?.user, request)
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] code exchange failed:', error.message)
  }

  return NextResponse.redirect(`${origin}/?error=auth`)
}
