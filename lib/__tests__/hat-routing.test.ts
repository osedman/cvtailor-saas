/**
 * Hat-aware landing + the open-redirect guard.
 *
 * safeNextPath is the check standing between a freshly-minted session and an
 * attacker-chosen destination, and it is now shared by the magic-link sender
 * and both auth entry points — so it gets tested rather than assumed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const maybeSingle = vi.fn()
const from = vi.fn()

vi.mock("@/lib/agency/db", () => ({
  agencyAdmin: () => ({ from }),
}))

import { safeNextPath, resolveLandingPath, DEFAULT_LANDING, HIRING_LANDING } from "../hat-routing"

/** Chainable stub matching the supabase-js builder surface used by the module. */
function queryStub() {
  const chain: Record<string, unknown> = {}
  for (const method of ["select", "eq", "limit"]) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = maybeSingle
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  from.mockImplementation(() => queryStub())
})

describe("safeNextPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeNextPath("/hiring")).toBe("/hiring")
    expect(safeNextPath("/hiring/invite/abc123")).toBe("/hiring/invite/abc123")
    expect(safeNextPath("  /agencies  ")).toBe("/agencies")
  })

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeNextPath("//evil.example.com")).toBeNull()
    expect(safeNextPath("https://evil.example.com")).toBeNull()
    expect(safeNextPath("http://evil.example.com/hiring")).toBeNull()
  })

  // Browsers normalise backslashes to forward slashes, so these navigate
  // off-origin exactly like "//evil.example.com" despite the leading "/".
  it("rejects backslash protocol-relative smuggling", () => {
    expect(safeNextPath("/\\evil.example.com")).toBeNull()
    expect(safeNextPath("/\\/evil.example.com")).toBeNull()
    expect(safeNextPath("/hiring\\..\\..\\evil")).toBeNull()
  })

  it("rejects anything carrying a scheme, wherever it sits", () => {
    expect(safeNextPath("/redirect?to=https://evil.example.com")).toBeNull()
    expect(safeNextPath("javascript:alert(1)")).toBeNull()
  })

  it("rejects non-strings, empties and absurd lengths", () => {
    expect(safeNextPath(undefined)).toBeNull()
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath(42)).toBeNull()
    expect(safeNextPath("")).toBeNull()
    expect(safeNextPath("tailor")).toBeNull()
    expect(safeNextPath("/" + "a".repeat(600))).toBeNull()
  })
})

describe("resolveLandingPath", () => {
  it("honours an explicit safe next without touching the database", async () => {
    expect(await resolveLandingPath("user-1", "/hiring/invite/tok")).toBe("/hiring/invite/tok")
    expect(from).not.toHaveBeenCalled()
  })

  it("ignores an unsafe next and falls back to hat resolution", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: null })
    expect(await resolveLandingPath("user-1", "https://evil.example.com")).toBe(DEFAULT_LANDING)
  })

  it("sends a linked client contact who is not a member to the hiring workspace", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: null }) // members: not a recruiter
      .mockResolvedValueOnce({ data: { id: "contact-1" } }) // linked contact
    expect(await resolveLandingPath("hm-user")).toBe(HIRING_LANDING)
  })

  it("leaves recruiters on the existing default, even when also a linked contact", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { agency_id: "agency-1" } })
    expect(await resolveLandingPath("recruiter-user")).toBe(DEFAULT_LANDING)
    // Membership short-circuits: the contact lookup never runs.
    expect(from).toHaveBeenCalledTimes(1)
  })

  it("leaves a plain consumer on the existing default", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: null })
    expect(await resolveLandingPath("consumer-user")).toBe(DEFAULT_LANDING)
  })

  it("never breaks the redirect when the lookup throws", async () => {
    from.mockImplementation(() => {
      throw new Error("service role key missing")
    })
    expect(await resolveLandingPath("user-1")).toBe(DEFAULT_LANDING)
  })

  it("defaults when there is no user", async () => {
    expect(await resolveLandingPath(null)).toBe(DEFAULT_LANDING)
    expect(await resolveLandingPath(undefined)).toBe(DEFAULT_LANDING)
  })
})

/**
 * ONE guard, not three.
 *
 * safeNextPath was extracted because a second copy of a security check is how
 * one of them quietly drifts permissive — and that is exactly what happened:
 * app/auth/confirm/page.tsx kept a hand-rolled `next` guard that checked the
 * leading slash and the scheme but NOT the backslash, so `next=/\evil.com`
 * passed it and the browser resolved the redirect off-origin, immediately
 * after a session was minted.
 *
 * Unit-testing safeNextPath cannot catch that, because the bug was a caller
 * not using it. So this reads the entry points themselves. A source scan in
 * the manner of typography-consistency.test.ts: crude, and it fails the build
 * the moment somebody re-derives the check by hand.
 */
describe("the `next` guard has exactly one implementation", () => {
  const ENTRY_POINTS = [
    "app/auth/confirm/page.tsx",
    "app/auth/callback/route.ts",
    "app/api/auth/request-otp/route.ts",
    // Added 14 Aug: this one had drifted too — it checked the leading slash
    // and the scheme but not the backslash, the identical bug, in the door
    // both B2B surfaces link into with ?next=. It could not import the shared
    // guard while that guard lived alongside agencyAdmin, so the guard moved
    // to lib/auth-paths.ts (no server imports) and this file now delegates.
    "app/login/page.tsx",
    // The business door. Same engine, same guard — a second door is exactly
    // the moment a second copy of the check would have appeared.
    "app/agencies/sign-in/page.tsx",
  ]

  /** A hand-rolled guard always starts here — the leading-slash test. */
  const REDERIVED = /\.startsWith\(\s*["'`]\/\/?["'`]\s*\)/

  it.each(ENTRY_POINTS)("%s delegates to safeNextPath", async (relative) => {
    const { readFileSync } = await import("fs")
    const { resolve } = await import("path")
    const source = readFileSync(resolve(__dirname, "../..", relative), "utf8")

    expect(source).toMatch(/\bsafeNextPath\b/)
    expect(source).not.toMatch(REDERIVED)
  })
})
