import { createBrowserClient } from '@supabase/ssr'
import { authCookieOptions } from '@/lib/supabase/cookie-options'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions(),
      auth: {
        // Keep refreshing the access token in the background so the user
        // stays signed in across long visits without another magic link.
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    },
  )
}
