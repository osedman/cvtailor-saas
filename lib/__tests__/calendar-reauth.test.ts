/**
 * What happens when a calendar's refresh token dies.
 *
 * The bug, 20 Sep 2026: a hiring manager's Google refresh token was revoked,
 * `busyBetween` surfaced Google's "Token has been expired or revoked." and
 * left the row in place. `getConnection` reports connected whenever a row
 * exists, and the "Connect Google Calendar" link renders only when there is
 * none — so the screen showed a connected pill above a Scan button that could
 * only ever fail, with no way back through the UI. A failed state reading as
 * a healthy one, the same shape as the briefs inbox saying "Nothing waiting
 * on you" above an Unauthorised banner.
 *
 * The fix has a sharp edge the tests below exist to hold: the row is deleted
 * ONLY on a definitive revocation. Deleting a working connection because the
 * provider had a bad minute would be a worse bug than the dead end.
 *
 * Postgres is mocked; these tests are about the DECISION, not the database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// vi.mock factories are hoisted above every const in this file, so the spies
// they close over have to be hoisted too.
const { maybeSingle, del, upsert, refresh, busy } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  del: vi.fn(),
  upsert: vi.fn(),
  refresh: vi.fn(),
  busy: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      delete: () => ({ eq: (...args: unknown[]) => { del(...args); return Promise.resolve({ error: null }) } }),
      upsert: (...args: unknown[]) => { upsert(...args); return Promise.resolve({ error: null }) },
    }),
  }),
}))

// Tokens are sealed in the real table; the seal is not what is under test.
vi.mock("@/lib/calendar/tokens", () => ({
  seal: (v: string) => `sealed:${v}`,
  open: (v: string) => String(v).replace(/^sealed:/, ""),
  tokenStorageConfigured: () => true,
}))

vi.mock("@/lib/calendar/providers", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    PROVIDERS: {
      google: { label: "Google Calendar", refresh, busy },
      microsoft: { label: "Microsoft Outlook", refresh, busy },
    },
  }
})

import { busyBetween, CalendarReauthRequired } from "@/lib/calendar/connections"
import { TokenRequestError, isRevoked } from "@/lib/calendar/providers"

const EXPIRED = new Date(Date.now() - 60_000).toISOString()
const LIVE = new Date(Date.now() + 600_000).toISOString()

function row(over: Record<string, unknown> = {}) {
  return {
    data: {
      provider: "google",
      access_token: "sealed:access-old",
      refresh_token: "sealed:refresh-1",
      expires_at: EXPIRED,
      ...over,
    },
    error: null,
  }
}

beforeEach(() => {
  maybeSingle.mockReset()
  del.mockReset()
  upsert.mockReset()
  refresh.mockReset()
  busy.mockReset()
  busy.mockResolvedValue([])
})

describe("isRevoked", () => {
  it("is true only for invalid_grant", () => {
    expect(isRevoked(new TokenRequestError("Token has been expired or revoked.", "invalid_grant", 400))).toBe(true)
    expect(isRevoked(new TokenRequestError("backend error", "internal_failure", 500))).toBe(false)
    expect(isRevoked(new TokenRequestError("slow down", "rate_limit_exceeded", 429))).toBe(false)
    expect(isRevoked(new Error("Token has been expired or revoked."))).toBe(false)
  })

  it("does not decide from the human-readable message", () => {
    // The description is the part that varies by provider and by locale. If
    // the guard ever starts matching on it, this fails.
    expect(isRevoked(new TokenRequestError("Token has been expired or revoked.", "internal_failure", 500))).toBe(false)
  })
})

describe("a revoked refresh token", () => {
  it("deletes the stale row and asks for reconnection", async () => {
    maybeSingle.mockResolvedValue(row())
    refresh.mockRejectedValue(new TokenRequestError("Token has been expired or revoked.", "invalid_grant", 400))

    await expect(busyBetween("user-1", LIVE, LIVE)).rejects.toBeInstanceOf(CalendarReauthRequired)
    expect(del).toHaveBeenCalledWith("user_id", "user-1")
    expect(upsert).not.toHaveBeenCalled()
  })

  it("names the provider in words a hiring manager can act on", async () => {
    maybeSingle.mockResolvedValue(row())
    refresh.mockRejectedValue(new TokenRequestError("Token has been expired or revoked.", "invalid_grant", 400))

    await expect(busyBetween("user-1", LIVE, LIVE)).rejects.toThrow(/Google Calendar access has lapsed\. Connect it again\./)
  })

  it("does the same when there is no refresh token at all", async () => {
    maybeSingle.mockResolvedValue(row({ refresh_token: null }))

    await expect(busyBetween("user-1", LIVE, LIVE)).rejects.toBeInstanceOf(CalendarReauthRequired)
    expect(del).toHaveBeenCalledWith("user_id", "user-1")
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe("a transient provider failure", () => {
  it("KEEPS the connection when the token endpoint 500s", async () => {
    maybeSingle.mockResolvedValue(row())
    refresh.mockRejectedValue(new TokenRequestError("backend error", "internal_failure", 500))

    await expect(busyBetween("user-1", LIVE, LIVE)).rejects.toThrow("backend error")
    expect(del).not.toHaveBeenCalled()
  })

  it("KEEPS the connection when the network throws", async () => {
    maybeSingle.mockResolvedValue(row())
    refresh.mockRejectedValue(new Error("fetch failed"))

    await expect(busyBetween("user-1", LIVE, LIVE)).rejects.toThrow("fetch failed")
    expect(del).not.toHaveBeenCalled()
  })

  it("does not raise reauth for a transient failure", async () => {
    maybeSingle.mockResolvedValue(row())
    refresh.mockRejectedValue(new TokenRequestError("slow down", "rate_limit_exceeded", 429))

    await expect(busyBetween("user-1", LIVE, LIVE)).rejects.not.toBeInstanceOf(CalendarReauthRequired)
  })
})

describe("the happy paths still work", () => {
  it("refreshes an expired token in place and keeps the row", async () => {
    maybeSingle.mockResolvedValue(row())
    refresh.mockResolvedValue({ accessToken: "access-new", refreshToken: null, expiresAt: LIVE })

    await busyBetween("user-1", LIVE, LIVE)
    expect(del).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalled()
    // A provider that returns no new refresh token must not wipe the old one.
    expect(upsert.mock.calls[0][0]).toMatchObject({ refresh_token: "sealed:refresh-1" })
    expect(busy).toHaveBeenCalledWith("access-new", LIVE, LIVE)
  })

  it("does not refresh at all while the token is still live", async () => {
    maybeSingle.mockResolvedValue(row({ expires_at: LIVE }))

    await busyBetween("user-1", LIVE, LIVE)
    expect(refresh).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
    expect(busy).toHaveBeenCalledWith("access-old", LIVE, LIVE)
  })

  it("still refuses plainly when nothing is connected, without deleting", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(busyBetween("user-1", LIVE, LIVE)).rejects.toThrow("no calendar connected")
    expect(del).not.toHaveBeenCalled()
  })
})

describe("the screen can recover", () => {
  it("the busy route answers 409 with reconnect:true, not a bare 500", async () => {
    const src = (await import("fs")).readFileSync(
      (await import("path")).join(process.cwd(), "app/api/hiring/calendar/busy/route.ts"),
      "utf8"
    )
    expect(src).toContain("CalendarReauthRequired")
    expect(src).toContain("reconnect: true")
    expect(src).toContain("status: 409")
  })

  it("the availability screen re-reads status on reconnect so the connect link returns", async () => {
    const src = (await import("fs")).readFileSync(
      (await import("path")).join(process.cwd(), "app/hiring/roles/[roleId]/interviews/page.tsx"),
      "utf8"
    )
    // Without this the pill stays and the only button left can never succeed.
    expect(src).toContain("body?.reconnect === true")
    expect(src).toContain('fetch("/api/hiring/calendar/status")')
  })
})
