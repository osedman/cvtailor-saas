import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runPostAuth } from '@/lib/post-auth'
import { getAppOrigin } from '@/lib/site-url'

/**
 * PKCE code-exchange flow. Kept for backward compatibility and any link still
 * pointing here; the primary path is /auth/confirm (token_hash).
 * Redirects always use the product origin so the www/app split can't swallow
 * auth errors on the marketing homepage.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const nextRaw = searchParams.get('next') ?? '/tailor'
  const next = nextRaw.startsWith('/') ? nextRaw : `/${nextRaw}`
  const app = getAppOrigin()

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await runPostAuth(data?.user, request)
      return NextResponse.redirect(`${app}${next}`)
    }
    console.error('[auth/callback] code exchange failed:', error.message)
    return NextResponse.redirect(
      `${app}/tailor?error=auth&error_description=${encodeURIComponent(error.message || 'link expired or already used')}`,
    )
  }

  return NextResponse.redirect(
    `${app}/tailor?error=auth&error_description=${encodeURIComponent('link expired or already used')}`,
  )
}
