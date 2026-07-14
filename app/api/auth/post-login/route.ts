import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runPostAuth } from '@/lib/post-auth'

/** Best-effort post-login side effects after client-side magic-link / OTP verify. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await runPostAuth(user, request)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[auth/post-login] failed:', e)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
