import { describe, expect, it, afterEach, vi } from 'vitest'
import { authCookieOptions, withAuthCookieOptions } from '@/lib/supabase/cookie-options'

describe('authCookieOptions', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses host-only cookies outside production', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '')
    expect(authCookieOptions()).toEqual({ path: '/', sameSite: 'lax' })
  })

  it('shares .gettailr.com in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '')
    expect(authCookieOptions()).toEqual({
      domain: '.gettailr.com',
      path: '/',
      sameSite: 'lax',
    })
  })

  it('allows explicit domain override', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '.example.com')
    expect(authCookieOptions().domain).toBe('.example.com')
  })

  it('merges onto supabase cookie options', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '')
    const merged = withAuthCookieOptions({ httpOnly: true, maxAge: 100 })
    expect(merged.domain).toBe('.gettailr.com')
    expect(merged.httpOnly).toBe(true)
    expect(merged.path).toBe('/')
  })
})
