/**
 * Which agency does a request resolve to?
 *
 * The AGENCY_COOKIE is a preference the caller controls, so the property that
 * matters is that it can only ever *select between* agencies they already
 * belong to — never add one. Everything downstream (52 call sites) trusts
 * ctx.agencyId completely, so a forged cookie widening it would be a
 * cross-tenant hole rather than a cosmetic bug.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const cookieGet = vi.fn()
const authGetUser = vi.fn()
const membersRows = { data: [] as unknown[], error: null as unknown }
const agencyRows = { data: [] as unknown[], error: null as unknown }

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}))

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: authGetUser },
    from(table: string) {
      const result = table === "members" ? membersRows : agencyRows
      const chain: Record<string, unknown> = {}
      for (const m of ["select", "eq", "order", "in"]) chain[m] = () => chain
      // members resolves on .order(); agencies resolves on .in()
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
      return chain
    },
  }),
}))

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }))

import { requireAgencyContext, AGENCY_COOKIE } from "../agency/db"

const ALPHA = "11111111-1111-1111-1111-111111111111"
const BETA = "22222222-2222-2222-2222-222222222222"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
  authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
  membersRows.data = [
    { agency_id: ALPHA, role: "owner", created_at: "2025-01-01T00:00:00Z" },
    { agency_id: BETA, role: "recruiter", created_at: "2026-01-01T00:00:00Z" },
  ]
  membersRows.error = null
  agencyRows.data = [
    { id: ALPHA, name: "Alpha Search" },
    { id: BETA, name: "Beta Talent" },
  ]
  agencyRows.error = null
  cookieGet.mockReturnValue(undefined)
})

describe("requireAgencyContext", () => {
  it("defaults to the oldest membership when no preference is set", async () => {
    const res = await requireAgencyContext()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.ctx.agencyId).toBe(ALPHA)
    expect(res.ctx.agencyName).toBe("Alpha Search")
  })

  it("honours a cookie naming another agency the caller belongs to", async () => {
    cookieGet.mockImplementation((name: string) =>
      name === AGENCY_COOKIE ? { value: BETA } : undefined
    )
    const res = await requireAgencyContext()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.ctx.agencyId).toBe(BETA)
    expect(res.ctx.role).toBe("recruiter")
  })

  // The security property: a preference cannot widen access.
  it("ignores a cookie naming an agency the caller does NOT belong to", async () => {
    cookieGet.mockImplementation((name: string) =>
      name === AGENCY_COOKIE ? { value: "99999999-9999-9999-9999-999999999999" } : undefined
    )
    const res = await requireAgencyContext()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.ctx.agencyId).toBe(ALPHA)
  })

  it("ignores a junk cookie without throwing", async () => {
    cookieGet.mockImplementation(() => ({ value: "'; drop table members; --" }))
    const res = await requireAgencyContext()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.ctx.agencyId).toBe(ALPHA)
  })

  it("returns every active membership so the chrome can name the current one", async () => {
    const res = await requireAgencyContext()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.ctx.memberships).toHaveLength(2)
    expect(res.ctx.memberships?.map((m) => m.agencyName)).toEqual(["Alpha Search", "Beta Talent"])
  })

  it("fails closed when the caller has no active membership", async () => {
    membersRows.data = []
    const res = await requireAgencyContext()
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.failure).toBe("no_agency")
  })

  it("fails closed when there is no session", async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const res = await requireAgencyContext()
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.failure).toBe("unauthenticated")
  })
})

/**
 * The preference must not outlive the person who set it.
 *
 * A source scan, in the manner of typography-consistency.test.ts: the cookie
 * is httpOnly with a year on it, and supabase.auth.signOut() does not touch
 * it, so without this wiring one recruiter's working context sits in the next
 * account's browser on a shared machine. It grants nothing — the resolution
 * tests above prove a stale id is ignored — but the selected agency's NAME is
 * visible in the switcher, and that is somebody else's client list.
 */
describe("the agency preference is cleared on sign-out", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("exposes a DELETE that expires the cookie without needing a session", () => {
    const source = read("app/api/agency/session/route.ts")
    expect(source).toMatch(/export async function DELETE/)
    const handler = source.slice(source.indexOf("export async function DELETE"))
    expect(handler).toMatch(/maxAge:\s*0/)
    // No auth gate inside DELETE: clearing state when the session is already
    // gone is the entire point, so requiring one would make it a no-op.
    const body = handler.slice(0, handler.indexOf("export async function GET"))
    expect(body).not.toMatch(/requireAgencyContext/)
  })

  it("is actually called by signOut", () => {
    const source = read("components/auth/auth-provider.tsx")
    const signOut = source.slice(source.indexOf("async function signOut"))
    expect(signOut).toMatch(/\/api\/agency\/session/)
    expect(signOut).toMatch(/DELETE/)
  })
})
