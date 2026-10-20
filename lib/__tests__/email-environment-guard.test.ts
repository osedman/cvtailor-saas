/**
 * The non-production email guard (lib/email.ts).
 *
 * Staging holds real people's CVs as fixtures and the Art 14 notice cron has
 * no switch to skip a due notice, so on 23 Aug 2026 twenty-three notices sat
 * queued against real addresses, sixteen of them already overdue. The data was
 * suppressed; this guard is what stops the NEXT one, and it must fail closed.
 *
 * Every case asserts the network was never touched, because a guard that
 * blocks after the fetch has already sent the email.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const ORIGINAL_ENV = { ...process.env }

async function send(to: string) {
  vi.resetModules()
  const fetchSpy = vi.fn()
  vi.stubGlobal("fetch", fetchSpy)
  const { sendEmail } = await import("../email")
  const result = await sendEmail({ to, subject: "s", html: "<p>h</p>" })
  return { result, fetchCalls: fetchSpy.mock.calls.length }
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: "test-key" }
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
})

describe("non-production email guard", () => {
  it("blocks a stranger when the allowlist is unset, without calling Resend", async () => {
    delete process.env.VERCEL_ENV
    delete process.env.EMAIL_ALLOWLIST
    const { result, fetchCalls } = await send("stranger@example.com")
    expect(result.sent).toBe(false)
    expect(result.skipped).toMatch(/EMAIL_ALLOWLIST/)
    expect(fetchCalls).toBe(0)
  })

  it("still reaches the founder when the variable is unset — deploying the guard must not kill staging sign-in", async () => {
    delete process.env.VERCEL_ENV
    delete process.env.EMAIL_ALLOWLIST
    expect((await send("o.oifoh@gmail.com")).fetchCalls).toBeGreaterThan(0)
    expect((await send("ose@lean-frame.com")).fetchCalls).toBeGreaterThan(0)
    expect((await send("anyone@lean-frame.com")).fetchCalls).toBeGreaterThan(0)
  })

  it("folds gmail plus-aliases so test candidates reach the founder's inbox", async () => {
    delete process.env.VERCEL_ENV
    delete process.env.EMAIL_ALLOWLIST
    expect((await send("o.oifoh+can01@gmail.com")).fetchCalls).toBeGreaterThan(0)
    // The fold is gmail-only: a plus-alias of a non-allowed gmail is still a stranger.
    expect((await send("stranger+tag@gmail.com")).fetchCalls).toBe(0)
  })

  it("a populated variable replaces the default list rather than extending strangers in", async () => {
    process.env.VERCEL_ENV = "preview"
    process.env.EMAIL_ALLOWLIST = "only@example.com"
    // The default entries are no longer implied once the operator has spoken.
    expect((await send("ose@lean-frame.com")).fetchCalls).toBe(0)
  })

  it("blocks a recipient who is not on a populated allowlist", async () => {
    process.env.VERCEL_ENV = "preview"
    process.env.EMAIL_ALLOWLIST = "allowed@example.com"
    const { result, fetchCalls } = await send("stranger@example.com")
    expect(result.sent).toBe(false)
    expect(fetchCalls).toBe(0)
  })

  it("allows an exact allowlist match through to the sender", async () => {
    process.env.VERCEL_ENV = "preview"
    process.env.EMAIL_ALLOWLIST = "allowed@example.com"
    const { result, fetchCalls } = await send("allowed@example.com")
    expect(result.skipped).toBeUndefined()
    expect(fetchCalls).toBeGreaterThan(0)
  })

  it("matches case-insensitively and ignores surrounding whitespace", async () => {
    process.env.VERCEL_ENV = "preview"
    process.env.EMAIL_ALLOWLIST = " Allowed@Example.com , other@example.com "
    const { fetchCalls } = await send("ALLOWED@example.com")
    expect(fetchCalls).toBeGreaterThan(0)
  })

  it("honours a leading @ as a domain rule", async () => {
    process.env.VERCEL_ENV = "preview"
    process.env.EMAIL_ALLOWLIST = "@gettailr.com"
    expect((await send("anyone@gettailr.com")).fetchCalls).toBeGreaterThan(0)
    expect((await send("anyone@elsewhere.com")).fetchCalls).toBe(0)
  })

  it("does not let a domain rule match a lookalike suffix", async () => {
    process.env.VERCEL_ENV = "preview"
    process.env.EMAIL_ALLOWLIST = "@tailr.com"
    const { fetchCalls } = await send("someone@nottailr.com")
    expect(fetchCalls).toBe(0)
  })

  it("leaves production entirely unguarded", async () => {
    process.env.VERCEL_ENV = "production"
    delete process.env.EMAIL_ALLOWLIST
    const { fetchCalls } = await send("anyone@example.com")
    expect(fetchCalls).toBeGreaterThan(0)
  })
})
