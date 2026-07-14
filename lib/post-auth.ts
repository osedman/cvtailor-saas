import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail, welcomeEmailHtml } from '@/lib/email'

type AuthedUser = { id: string; email?: string | null }

/**
 * Side-effects to run once a user has successfully authenticated, regardless of
 * which flow they came through (PKCE code exchange or token_hash verification):
 *   1. Record a login event for the admin dashboard.
 *   2. Send the one-time welcome email to brand-new, still-subscribed users.
 * Best-effort: never throws, so it can't break the redirect.
 */
export async function runPostAuth(user: AuthedUser | null | undefined, request: Request) {
  if (!user) return
  const email = user.email ?? ''
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('[post-auth] admin client unavailable:', e)
    return
  }

  // 1. Login event (best-effort)
  try {
    await admin.from('login_events').insert({
      user_id: user.id,
      email,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
      user_agent: request.headers.get('user-agent') ?? '',
    })
  } catch (e) {
    console.error('[post-auth] login event failed:', e)
  }

  // 2. One-time welcome email (best-effort)
  if (!email) return
  try {
    const { data: row } = await admin
      .from('mailing_list')
      .select('welcomed_at, subscribed')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!row || row.welcomed_at || row.subscribed === false) return

    const result = await sendEmail({
      to: email,
      subject: 'Welcome to Tailr',
      html: welcomeEmailHtml(),
      replyTo: 'ose@lean-frame.com',
    })
    if (result.sent) {
      await admin.from('mailing_list').update({ welcomed_at: new Date().toISOString() }).eq('user_id', user.id)
    } else if (result.error) {
      console.error('[post-auth] welcome email failed:', result.error)
    }
  } catch (e) {
    console.error('[post-auth] welcome email error:', e)
  }
}
