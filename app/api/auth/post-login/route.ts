import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runPostAuth } from '@/lib/post-auth'
import { withTiming } from "@/lib/server-timing"

/**
 * Best-effort post-login side effects after client-side magic-link / OTP verify.
 * Auth cookies must already be set by the browser client.
 */
async function POST_handler(request: Request) {
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

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const POST = withTiming("/api/auth/post-login", "POST", POST_handler)
