import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { withAuthCookieOptions } from '@/lib/supabase/cookie-options'

export async function createClient() {
  const cookieStore = await cookies()
  // Which product this request is for decides the cookie's scope — the
  // business host keeps its session to itself. x-forwarded-host first: behind
  // Vercel, `host` is the internal one.
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withAuthCookieOptions(options, host) as Parameters<typeof cookieStore.set>[2])
            )
          } catch {
            // Ignored in Server Components; proxy handles session refresh
          }
        },
      },
    }
  )
}

/** Supabase client with service role — only for server-side trusted operations */
export function createAdminClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
