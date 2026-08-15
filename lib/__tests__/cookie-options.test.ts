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

/**
 * The business host must never join the consumer session. Today the business
 * domain is a gettailr.com subdomain, so `.gettailr.com` would hand the agency
 * product the consumer login through nothing but a DNS coincidence — the exact
 * sharing the product split exists to stop.
 */
describe('authCookieOptions across the product split', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps the business host to its own session in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '')
    expect(authCookieOptions('agencies.gettailr.com')).toEqual({ path: '/', sameSite: 'lax' })
    // The consumer hosts are untouched — they still share.
    expect(authCookieOptions('app.gettailr.com').domain).toBe('.gettailr.com')
    expect(authCookieOptions('www.gettailr.com').domain).toBe('.gettailr.com')
  })

  it('beats the explicit override, which exists to widen the consumer session', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '.gettailr.com')
    expect(authCookieOptions('agencies.gettailr.com').domain).toBeUndefined()
    expect(authCookieOptions('app.gettailr.com').domain).toBe('.gettailr.com')
  })

  it('follows the configured business host, and covers anything beneath it', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '')
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_URL', 'https://hire.example.com')
    expect(authCookieOptions('hire.example.com')).toEqual({ path: '/', sameSite: 'lax' })
    expect(authCookieOptions('eu.hire.example.com')).toEqual({ path: '/', sameSite: 'lax' })
    // A host that merely ends with the same letters is not beneath it.
    expect(authCookieOptions('nothire.example.com').domain).toBe('.gettailr.com')
    // And the old business subdomain stops being special once it moves.
    expect(authCookieOptions('agencies.gettailr.com').domain).toBe('.gettailr.com')
  })

  it('ignores port and case when comparing hosts', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '')
    expect(authCookieOptions('Agencies.GetTailr.com:443')).toEqual({ path: '/', sameSite: 'lax' })
  })

  it('falls back to the consumer default when the host is unknown', () => {
    // An unknown host must never silently WIDEN scope onto the business
    // product, but it must also not break the consumer session it serves.
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '')
    expect(authCookieOptions(null).domain).toBe('.gettailr.com')
  })
})
