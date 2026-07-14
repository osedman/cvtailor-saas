import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runPostAuth } from '@/lib/post-auth'

/**
 * PKCE code-exchange flow. Kept for backward compatibility.
 * Prefer /auth/confirm (token_hash) for magic links.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextRaw = searchParams.get('next') ?? '/tailor'
  const next = nextRaw.startsWith('/') ? nextRaw : `/${nextRaw}`

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await runPostAuth(data?.user, request)
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] code exchange failed:', error.message)
    return NextResponse.redirect(
      `${origin}/tailor?error=auth&error_description=${encodeURIComponent(error.message || 'link expired or already used')}`,
    )
  }

  return NextResponse.redirect(
    `${origin}/tailor?error=auth&error_description=${encodeURIComponent('link expired or already used')}`,
  )
}
