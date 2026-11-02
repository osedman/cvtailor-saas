/**
 * The sign-in code route must never hand an upstream error's own words to an
 * unauthenticated caller.
 *
 * 28 Sep 2026 ("fix the generateLink error message too"). The route returned
 * generateLink's error.message verbatim on a 400 and Resend's error text on a
 * 500. Supabase's words are facts about the ACCOUNT: "Signups not allowed for
 * this instance" says an address has no account (once sign-ups are off),
 * "User is banned" says one exists and is banned. Resend's words are facts
 * about our mail setup. None of it is the caller's business, and all of it
 * turns the form into a lookup.
 *
 * One upstream refusal is worth passing on, in our own words: Supabase's own
 * per-account wait ("you can only request this after N seconds"). It becomes
 * a 429 with Retry-After in the same shape as the app's own rate limit, so the
 * sign-in surfaces already show it correctly.
 *
 * Nothing here creates a user or sends an email: generateLink and sendEmail
 * are mocked, and the rate limiter always allows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

type LinkResult = { data: unknown; error: null | { message: string; status: number; code?: string } }
let nextLink: LinkResult = { data: { properties: { hashed_token: "h", email_otp: "00000000" } }, error: null }

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: { allowed: true, reset_seconds: 60 }, error: null }),
    auth: { admin: { generateLink: async () => nextLink } },
  }),
}))

let nextSend: { sent: boolean; error?: string; skipped?: string } = { sent: true }
const sendEmail = vi.fn(async (_opts: { to: string }) => nextSend)
vi.mock("@/lib/email", () => ({ sendEmail: (opts: { to: string }) => sendEmail(opts) }))

import { POST } from "@/app/api/auth/request-otp/route"

const ask = () =>
  POST(
    new Request("https://signin.invalid/api/auth/request-otp", {
      method: "POST",
      headers: { host: "signin.invalid", origin: "https://signin.invalid", "x-forwarded-for": "203.0.113.71", "content-type": "application/json" },
      body: JSON.stringify({ email: "someone@office.invalid" }),
    }),
  )

const refuse = (message: string, status: number, code?: string) => {
  nextLink = { data: null, error: { message, status, code } }
}

beforeEach(() => {
  nextLink = { data: { properties: { hashed_token: "h", email_otp: "00000000" } }, error: null }
  nextSend = { sent: true }
  sendEmail.mockClear()
})

describe("generateLink refusals reach the caller in our words, never Supabase's", () => {
  it("sign-ups off: the reply does not say the address has no account", async () => {
    refuse("Signups not allowed for this instance", 422, "signup_disabled")
    const res = await ask()
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(JSON.stringify(body)).not.toMatch(/signup|not allowed|instance/i)
    expect(body.error).toBe("We couldn't start sign-in for that address. Check it and try again.")
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("a banned account gets the same reply as any other refusal", async () => {
    refuse("User is banned", 400, "user_banned")
    const res = await ask()
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(JSON.stringify(body)).not.toMatch(/banned|user/i)
    expect(body.error).toBe("We couldn't start sign-in for that address. Check it and try again.")
  })

  it("an address Supabase rejects gets the same reply, without the address echoed back", async () => {
    refuse('Email address "someone@office.invalid" is invalid', 400, "email_address_invalid")
    const body = await (await ask()).json()
    expect(JSON.stringify(body)).not.toContain("someone@office.invalid")
    expect(body.error).toBe("We couldn't start sign-in for that address. Check it and try again.")
  })

  it("Supabase's own wait becomes a 429 with Retry-After, in the app's rate-limit words", async () => {
    refuse("For security purposes, you can only request this after 37 seconds.", 429, "over_request_rate_limit")
    const res = await ask()
    const body = await res.json()
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("37")
    expect(body.error).toBe("You're doing that a lot — please wait 37 second(s) and try again.")
    expect(JSON.stringify(body)).not.toMatch(/security purposes/i)
  })

  it("a wait with no number in it still becomes a 429, waiting a minute", async () => {
    refuse("Email rate limit exceeded", 429, "over_email_send_rate_limit")
    const res = await ask()
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("60")
  })
})

describe("a failed send reaches the caller in our words, never Resend's", () => {
  it("Resend's text stays on the server", async () => {
    nextSend = { sent: false, error: "You can only send testing emails to your own email address (owner@example.invalid)." }
    const res = await ask()
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toMatch(/testing emails|owner@/i)
    expect(body.error).toBe("We couldn't send the sign-in email just now. Try again in a minute.")
  })
})

describe("the route itself", () => {
  const src = tsCode(readFileSync(join(process.cwd(), "app/api/auth/request-otp/route.ts"), "utf8"))
  it("never returns an upstream error's message or Resend's error text", () => {
    expect(src).not.toMatch(/error\.message \|\|/)
    expect(src).not.toMatch(/sent\.error \|\|/)
  })
  it("never logs the upstream message, which can quote the address", () => {
    expect(src).not.toMatch(/console\.error\([^)]*error\.message/)
  })
})

describe("the other unauthenticated doorways answer failures in their own words", () => {
  // Same flaw, found while fixing the sign-in route (28 Sep 2026): the rights
  // and portal doorways returned errorMessage(error) — the database's words —
  // to whoever held the link. Every token doorway now answers a failure with
  // one plain sentence and logs only the error's name and code.
  const doorways = [
    "app/api/booking/[token]/route.ts",
    "app/api/consent/[token]/route.ts",
    "app/api/reference/[token]/route.ts",
    "app/api/rights/[token]/route.ts",
    "app/api/portal/[token]/route.ts",
    "app/api/hiring/invite/route.ts",
    "app/api/auth/request-otp/route.ts",
  ]
  for (const path of doorways) {
    it(`${path} never returns errorMessage(error) or an upstream message`, () => {
      const src = tsCode(readFileSync(join(process.cwd(), path), "utf8"))
      expect(src).not.toMatch(/errorMessage\(/)
      expect(src).not.toMatch(/error:\s*\w+\.message\b/)
    })
  }
})
