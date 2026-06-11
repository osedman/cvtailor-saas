import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Record login event for the admin dashboard (non-blocking, best-effort)
      const user = data?.user
      if (user) {
        try {
          const admin = createAdminClient()
          await admin.from('login_events').insert({
            user_id: user.id,
            email: user.email ?? '',
            ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
            user_agent: request.headers.get('user-agent') ?? '',
          })
        } catch (e) {
          console.error('[auth/callback] failed to log login event:', e)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`)
}
