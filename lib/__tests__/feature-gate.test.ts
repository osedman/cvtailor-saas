/**
 * The career-path cluster went GA on 30 Jul 2026: isCareerPathBeta is the
 * designed lift point and now admits everyone. These tests pin the GA
 * contract — every caller passes, and the gate never touches the DB — so a
 * regression that quietly re-locks the feature (or reintroduces a per-request
 * query) fails loudly. The pre-GA allowlist logic is retained in the module
 * for a fast re-gate; if it is ever wired back in, restore the allowlist
 * tests from git history alongside it.
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

beforeEach(() => {
  maybeSingle.mockReset()
  delete process.env.BETA_EMAILS
})

describe('isCareerPathBeta (GA — gate lifted)', () => {
  it('admits any signed-in user', async () => {
    expect(await isCareerPathBeta('anyone@example.com')).toBe(true)
  })

  it('admits the admin', async () => {
    expect(await isCareerPathBeta('o.oifoh@gmail.com')).toBe(true)
  })

  it('admits even a missing email — client surfaces gate on auth, not here', async () => {
    expect(await isCareerPathBeta(null)).toBe(true)
    expect(await isCareerPathBeta(undefined)).toBe(true)
    expect(await isCareerPathBeta('')).toBe(true)
  })

  it('never queries the DB', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    await isCareerPathBeta('anyone@example.com')
    await isCareerPathBeta(null)
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('stays open when the DB would have thrown', async () => {
    maybeSingle.mockRejectedValue(new Error('connection reset'))
    expect(await isCareerPathBeta('anyone@example.com')).toBe(true)
  })
})
