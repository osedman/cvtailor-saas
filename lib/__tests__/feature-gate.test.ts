/**
 * The beta gate decides who sees the whole career-path cluster in production,
 * so its logic is pinned here rather than trusted to a one-off manual check.
 * The Supabase admin client is mocked: these tests are about the DECISION,
 * not about Postgres.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const maybeSingle = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}))

// vi.mock is hoisted above this import, so the gate gets the mocked client.
import { isCareerPathBeta } from '@/lib/feature-gate'

/** Each test needs a fresh email — the gate caches per email for 5 minutes. */
let n = 0
const fresh = () => `user${n++}.${Date.now()}@example.com`

beforeEach(() => {
  maybeSingle.mockReset()
  delete process.env.BETA_EMAILS
})

describe('isCareerPathBeta', () => {
  it('lets a listed member through', async () => {
    maybeSingle.mockResolvedValue({ data: { email: 'x' }, error: null })
    expect(await isCareerPathBeta(fresh())).toBe(true)
  })

  it('keeps an unlisted user out', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await isCareerPathBeta(fresh())).toBe(false)
  })

  it('always admits the admin, even with no row and no env var', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    // A missing table or a wiped allowlist must never lock the owner out.
    expect(await isCareerPathBeta('o.oifoh@gmail.com')).toBe(true)
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('honours the BETA_EMAILS env override without touching the DB', async () => {
    const email = fresh()
    process.env.BETA_EMAILS = ` ${email.toUpperCase()} , someone@else.com `
    expect(await isCareerPathBeta(email)).toBe(true)
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('is case-insensitive about the address', async () => {
    maybeSingle.mockResolvedValue({ data: { email: 'x' }, error: null })
    const email = fresh()
    expect(await isCareerPathBeta(email.toUpperCase())).toBe(true)
  })

  it('denies a missing email without querying', async () => {
    expect(await isCareerPathBeta(null)).toBe(false)
    expect(await isCareerPathBeta(undefined)).toBe(false)
    expect(await isCareerPathBeta('')).toBe(false)
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('caches, so a repeat check costs no second query', async () => {
    maybeSingle.mockResolvedValue({ data: { email: 'x' }, error: null })
    const email = fresh()
    expect(await isCareerPathBeta(email)).toBe(true)
    expect(await isCareerPathBeta(email)).toBe(true)
    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('does not 403 a known member when the DB throws', async () => {
    const email = fresh()
    maybeSingle.mockResolvedValueOnce({ data: { email: 'x' }, error: null })
    expect(await isCareerPathBeta(email)).toBe(true) // warms the cache

    // Force a real miss by advancing past the 5-minute TTL, then fail the query.
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 6 * 60_000)
    maybeSingle.mockRejectedValue(new Error('connection reset'))
    expect(await isCareerPathBeta(email)).toBe(true) // falls back to last answer
    vi.useRealTimers()
  })

  it('denies on a DB error when nothing was ever cached', async () => {
    maybeSingle.mockRejectedValue(new Error('connection reset'))
    expect(await isCareerPathBeta(fresh())).toBe(false)
  })
})
