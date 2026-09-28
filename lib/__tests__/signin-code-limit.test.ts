/**
 * Colleagues in one office must each be able to ask for a sign-in code for
 * their own address.
 *
 * 28 Sep 2026 ("fix the sign-in code limit too"): reproduced from a TEST-NET
 * address, /api/auth/request-otp charged the caller's network at the "auth"
 * tier — 3 a minute, 15 a day, a number set for one person — so colleagues
 * 1–3 on one network got their codes and colleague 4 was refused with 429.
 * The fourth shared-network fix of the day (booking/consent/reference in
 * ce3efef, the hiring invite in 2a2af21).
 *
 * The per-ADDRESS "auth" charge is right and stays exactly as it was: it is
 * what stops anyone flooding an inbox. The per-NETWORK charge moves to
 * "auth_net", a flood ceiling on the Resend quota (20 a minute, 200 a day per
 * door) that an office signing in together never meets.
 *
 * The scenarios run the real route handler against an in-memory copy of
 * consume_rate_limit(). generateLink and sendEmail are mocked: nothing here
 * creates a user or sends an email.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

/* ── an in-memory consume_rate_limit(), and a generateLink that sends nothing */
const counters = new Map<string, number>()
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    rpc: async (
      _fn: string,
      args: { p_user_id: string; p_key: string; p_limit: number; p_window_seconds: number }
    ) => {
      const id = `${args.p_user_id}:${args.p_key}`
      const count = (counters.get(id) ?? 0) + 1
      counters.set(id, count)
      return {
        data: { allowed: count <= args.p_limit, reset_seconds: args.p_window_seconds === 60 ? 42 : 80_000 },
        error: null,
      }
    },
    auth: {
      admin: {
        generateLink: async () => ({
          data: { properties: { hashed_token: "test-hash", email_otp: "00000000" } },
          error: null,
        }),
      },
    },
  }),
}))

const sendEmail = vi.fn(async (_opts: { to: string }) => ({ sent: true }))
vi.mock("@/lib/email", () => ({ sendEmail: (opts: { to: string }) => sendEmail(opts) }))

import { POST } from "@/app/api/auth/request-otp/route"
import { getBusinessHost } from "@/lib/site-url"

const ROUTE = "app/api/auth/request-otp/route.ts"
const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

const IP = "203.0.113.70" // TEST-NET-3, never a real network
const CONSUMER_HOST = "signin.invalid"
// .invalid addresses: reserved, never deliverable, never a real person.
const address = (name: string) => `${name}@office.invalid`

const ask = (email: string, host = CONSUMER_HOST) =>
  POST(
    new Request(`https://${host}/api/auth/request-otp`, {
      method: "POST",
      headers: {
        host,
        origin: `https://${host}`,
        "x-forwarded-for": `${IP}, 10.0.0.1`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email }),
    }),
  )

describe("colleagues asking for sign-in codes on one network (the 28 Sep reproduction)", () => {
  beforeEach(() => {
    counters.clear()
    sendEmail.mockClear()
  })

  it("ten colleagues, each their own address, each asking once — none refused", async () => {
    for (let i = 0; i < 10; i++) {
      // Before the fix the fourth was 429.
      expect((await ask(address(`colleague-${i}`))).status).toBe(200)
    }
    expect(sendEmail).toHaveBeenCalledTimes(10)
  })

  it("one address asking a fourth time in a minute is refused (per-address limit intact)", async () => {
    const me = address("impatient")
    for (let i = 0; i < 3; i++) expect((await ask(me)).status).toBe(200)
    const refused = await ask(me)
    expect(refused.status).toBe(429)
    expect(refused.headers.get("Retry-After")).toBe("42")
    const body = (await refused.json()) as { error: string }
    expect(body.error).toMatch(/^You're doing that a lot — please wait \d+ second\(s\) and try again\.$/)
    expect(sendEmail).toHaveBeenCalledTimes(3)
    // …and a colleague on the same network is untouched.
    expect((await ask(address("neighbour"))).status).toBe(200)
  })

  it("21 different addresses from one network in a minute — the 21st refused (network ceiling)", async () => {
    for (let i = 0; i < 20; i++) expect((await ask(address(`flood-${i}`))).status).toBe(200)
    const refused = await ask(address("flood-final"))
    expect(refused.status).toBe(429)
    expect(refused.headers.get("Retry-After")).toBe("42")
    expect(sendEmail).toHaveBeenCalledTimes(20)
  })

  it("the same address on the other front door is counted separately", async () => {
    const business = getBusinessHost()
    expect(business).not.toBe(CONSUMER_HOST)
    const me = address("two-hats")
    for (let i = 0; i < 3; i++) expect((await ask(me)).status).toBe(200)
    expect((await ask(me)).status).toBe(429)
    // The recruiter door has its own per-address and per-network counters.
    for (let i = 0; i < 3; i++) expect((await ask(me, business)).status).toBe(200)
    expect((await ask(me, business)).status).toBe(429)
  })
})

describe("request-otp charges the right presets, in the right order", () => {
  const src = read(ROUTE)
  const perAddress = 'checkRateLimit(anonRateLimitId(`email:${door}:${email}`), "auth")'
  const perNetwork = 'checkRateLimit(anonRateLimitId(`ip:${door}:${ip}`), "auth_net")'

  it("the per-address charge still uses \"auth\" and comes first", () => {
    expect(src).toContain(perAddress)
    expect(src.indexOf(perAddress)).toBeLessThan(src.indexOf(perNetwork))
  })

  it("the per-network charge uses \"auth_net\", and nothing else in the route uses \"auth\" per network", () => {
    expect(src).toContain(perNetwork)
    expect(src).not.toMatch(/`ip:\$\{door\}:\$\{ip\}`\), "auth"\)/)
    expect(src.match(/checkRateLimit\(/g)?.length).toBe(2)
  })

  it("the auth_net preset is the decided numbers", () => {
    const lib = read("lib/rate-limit.ts")
    expect(lib).toMatch(/key: 'auth_net:min', limit: 20,\s+windowSeconds: 60/)
    expect(lib).toMatch(/key: 'auth_net:day', limit: 200,\s+windowSeconds: DAY/)
    // The per-address tier is unchanged.
    expect(lib).toMatch(/key: 'auth:min', limit: 3,\s+windowSeconds: 60/)
    expect(lib).toMatch(/key: 'auth:day', limit: 15,\s+windowSeconds: DAY/)
  })

  it("request-otp is the only user of \"auth_net\"", () => {
    const users: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(join(process.cwd(), dir))) {
        const rel = `${dir}/${name}`
        if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue
        if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(name) && /["']auth_net["']/.test(read(rel))) users.push(rel)
      }
    }
    for (const dir of ["app", "components", "lib"]) walk(dir)
    expect(users).toEqual([ROUTE])
  })
})
