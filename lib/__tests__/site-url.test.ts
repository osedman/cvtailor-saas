import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appPath,
  businessPath,
  getAppOrigin,
  getBusinessHost,
  getBusinessOrigin,
  getMarketingOrigin,
  isAppPath,
  isBusinessPath,
} from '@/lib/site-url'

describe('site-url', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falls back to apex for app origin when env unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(getAppOrigin()).toBe('https://gettailr.com')
  })

  it('prefers NEXT_PUBLIC_APP_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.gettailr.com/')
    expect(getAppOrigin()).toBe('https://app.gettailr.com')
    expect(appPath('/tailor')).toBe('https://app.gettailr.com/tailor')
  })

  it('defaults marketing to www', () => {
    vi.stubEnv('NEXT_PUBLIC_MARKETING_URL', '')
    expect(getMarketingOrigin()).toBe('https://www.gettailr.com')
  })

  it('recognises product path prefixes', () => {
    expect(isAppPath('/tailor')).toBe(true)
    expect(isAppPath('/auth/confirm')).toBe(true)
    expect(isAppPath('/api/tailor')).toBe(true)
    expect(isAppPath('/')).toBe(false)
    expect(isAppPath('/about')).toBe(false)
  })

  it('makes a scheme-less origin usable as a URL base', () => {
    // The real failure: a local NEXT_PUBLIC_APP_URL of `localhost:3000` made
    // the proxy throw ERR_INVALID_URL and return 500 on the one path an auth
    // error travels — the user saw a server error instead of the toast.
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'localhost:3000')
    expect(getAppOrigin()).toBe('http://localhost:3000')
    expect(() => new URL('/tailor?error=x', getAppOrigin())).not.toThrow()

    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'app.gettailr.com')
    expect(getAppOrigin()).toBe('https://app.gettailr.com')
  })

  it('falls through to the default when a configured origin is unusable', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(getAppOrigin()).toBe('https://gettailr.com')
  })

  it('strips paths and trailing slashes down to the origin', () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_URL', 'https://agencies.gettailr.com/agencies/')
    expect(getBusinessOrigin()).toBe('https://agencies.gettailr.com')
  })

  it('defaults business to the agencies subdomain', () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_URL', '')
    expect(getBusinessOrigin()).toBe('https://agencies.gettailr.com')
    expect(getBusinessHost()).toBe('agencies.gettailr.com')
  })

  it('prefers NEXT_PUBLIC_BUSINESS_URL, so a bought domain is config not code', () => {
    vi.stubEnv('NEXT_PUBLIC_BUSINESS_URL', 'https://tailrhire.com/')
    expect(getBusinessOrigin()).toBe('https://tailrhire.com')
    expect(businessPath('/agencies')).toBe('https://tailrhire.com/agencies')
    // The host follows the origin — a constant here would silently stop the
    // proxy matching the moment the domain moved.
    expect(getBusinessHost()).toBe('tailrhire.com')
  })

  it('recognises business path prefixes', () => {
    expect(isBusinessPath('/agencies')).toBe(true)
    expect(isBusinessPath('/agencies/roles/abc')).toBe(true)
    expect(isBusinessPath('/hiring')).toBe(true)
    expect(isBusinessPath('/api/agency/dashboard')).toBe(true)
    expect(isBusinessPath('/api/hiring/accept')).toBe(true)
    expect(isBusinessPath('/tailor')).toBe(false)
    expect(isBusinessPath('/api/tailor')).toBe(false)
  })

  it('never claims a business path as an app path', () => {
    // /api is an app prefix and /api/agency starts with it. Before the
    // subtraction below, isAppPath('/api/agency/...') was true and the proxy
    // would have redirected every agency API call onto the consumer host.
    expect(isAppPath('/api/agency/dashboard')).toBe(false)
    expect(isAppPath('/api/hiring/accept')).toBe(false)
    expect(isAppPath('/agencies')).toBe(false)
    expect(isAppPath('/hiring')).toBe(false)
  })

  it('keeps the token doorways on the consumer app, not the agency domain', () => {
    // A candidate exercising a right should not be sent to a domain branded
    // for the agency they are answering. These were in neither list before.
    for (const p of ['/portal/tok', '/rights/tok', '/consent/tok', '/reference/tok']) {
      expect(isAppPath(p)).toBe(true)
      expect(isBusinessPath(p)).toBe(false)
    }
  })
})
