import { afterEach, describe, expect, it, vi } from 'vitest'
import { appPath, getAppOrigin, getMarketingOrigin, isAppPath } from '@/lib/site-url'

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
})
