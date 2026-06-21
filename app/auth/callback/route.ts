import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendEmail, welcomeEmailHtml } from '@/lib/email'

/**
 * Send a one-time welcome email the first time we see a user. The signup
 * trigger has already added them to mailing_list with welcomed_at = null;
 * we send, then stamp welcomed_at so it never fires twice (and existing
 * users, backfilled with welcomed_at set, are never emailed).
 */
async function maybeSendWelcome(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string,
) {
  if (!email) return
  try {
    const { data: row } = await admin
      .from('mailing_list')
      .select('welcomed_at, subscribed')
      .eq('user_id', userId)
      .maybeSingle()

    // Only welcome a brand-new, still-subscribed list member
    if (!row || row.welcomed_at || row.subscribed === false) return

    const result = await sendEmail({
      to: email,
      subject: 'Welcome to Tailr',
      html: welcomeEmailHtml(),
      replyTo: 'ose@lean-frame.com',
    })

    // Stamp welcomed_at only if it actually sent, so a missing API key just
    // defers the welcome rather than silently skipping it forever.
    if (result.sent) {
      await admin.from('mailing_list').update({ welcomed_at: new Date().toISOString() }).eq('user_id', userId)
    } else if (result.error) {
      console.error('[auth/callback] welcome email failed:', result.error)
    }
  } catch (e) {
    console.error('[auth/callback] welcome email error:', e)
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = data?.user
      if (user) {
        const admin = createAdminClient()
        // Record login event for the admin dashboard (best-effort)
        try {
          await admin.from('login_events').insert({
            user_id: user.id,
            email: user.email ?? '',
            ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
            user_agent: request.headers.get('user-agent') ?? '',
          })
        } catch (e) {
          console.error('[auth/callback] failed to log login event:', e)
        }
        // Send the one-time welcome email for brand-new users (best-effort)
        await maybeSendWelcome(admin, user.id, user.email ?? '')
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`)
}
