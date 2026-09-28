/**
 * Two people on one network must both be able to open their own link.
 *
 * On 28 Sep 2026 Ose tested interview booking links: the first person picked
 * a time and it worked; the second got "That link is not valid" or "That did
 * not save". The booking route rate-limited every GET and POST by internet
 * address at the "auth" preset — 3 a minute, the tier built for sign-in email
 * sends — BEFORE the token was looked up, so the second person on the same
 * network was refused with 429, and the page read any non-OK answer as a dead
 * link. Staging's rate_limits showed one caller's auth:min bucket at count 6
 * (three refused) three seconds before a candidate self-booked.
 *
 * The strict tier bought nothing: a booking token is 192 random bits
 * (randomBytes(24)), stored hashed, which no request rate can guess. It only
 * ever blocked people who share a network — an office, a family Wi-Fi, a
 * carrier's NAT. The consent and reference doorways had the identical shape.
 *
 * The fix limits per LINK (one person's generous allowance) plus a high
 * per-NETWORK flood ceiling. The scenario below runs the real booking route
 * against an in-memory copy of consume_rate_limit(), so it needs no database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

/* ── an in-memory consume_rate_limit(): fixed windows, like the SQL ─────── */
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
  }),
}))

/* ── the booking library: every token in the scenario is a live link ───── */
vi.mock("@/lib/agency/booking", () => ({
  peekBooking: async () => ({ state: "invited", needsChoice: true, openWindows: [] }),
  claimBookingSlot: async () => "claimed",
  rescheduleBooking: async () => "claimed",
  respondToBooking: async () => "confirmed",
}))

/* ── the consent library: every token is a live link, every answer saves ── */
vi.mock("@/lib/agency/consent", () => ({
  peekConsent: async () => ({ status: "pending" }),
  recordDecision: async (_t: string, decision: string) => ({
    ok: true,
    decision,
    recordingPaths: [],
    rescoreCandidateId: null,
  }),
}))

import { doorwayLimitIds } from "@/lib/rate-limit"
import { GET, POST } from "@/app/api/booking/[token]/route"
import { POST as CONSENT_POST } from "@/app/api/consent/[token]/route"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

const DOORWAYS = [
  "app/api/booking/[token]/route.ts",
  "app/api/consent/[token]/route.ts",
  "app/api/reference/[token]/route.ts",
]

describe("doorwayLimitIds", () => {
  it("two links on one network get different link ids and the same network id", () => {
    const a = doorwayLimitIds("booking", "203.0.113.7", "a".repeat(32))
    const b = doorwayLimitIds("booking", "203.0.113.7", "b".repeat(32))
    expect(a.link).not.toBe(b.link)
    expect(a.net).toBe(b.net)
  })

  it("one link on two networks keeps the same link id", () => {
    const home = doorwayLimitIds("booking", "203.0.113.7", "tok-1")
    const phone = doorwayLimitIds("booking", "198.51.100.4", "tok-1")
    expect(home.link).toBe(phone.link)
    expect(home.net).not.toBe(phone.net)
  })

  it("keeps doorways apart, and never folds a token's case", () => {
    expect(doorwayLimitIds("booking", "ip", "t").link).not.toBe(doorwayLimitIds("consent", "ip", "t").link)
    // base64url tokens are case-sensitive: "Ab" and "aB" are different links.
    expect(doorwayLimitIds("booking", "ip", "Ab").link).not.toBe(doorwayLimitIds("booking", "ip", "aB").link)
  })

  it("returns counter ids shaped like UUIDs (rate_limits.user_id is uuid)", () => {
    const { net, link } = doorwayLimitIds("booking", "ip", "t")
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
    expect(net).toMatch(uuid)
    expect(link).toMatch(uuid)
  })

  it("seeds the link id from a hash of the token, never the raw token", () => {
    const src = read("lib/rate-limit.ts")
    const fn = src.slice(src.indexOf("export function doorwayLimitIds"))
    const body = fn.slice(0, fn.indexOf("\n}\n"))
    expect(body).toMatch(/createHash\('sha256'\)\.update\(token\)/)
    expect(body).not.toMatch(/:link:\$\{token\}/)
  })
})

describe("the token doorways use the doorway limit, not the sign-in tier", () => {
  for (const file of DOORWAYS) {
    const src = read(file)
    it(`${file} calls checkDoorwayLimit on both verbs`, () => {
      expect(src.match(/checkDoorwayLimit\(/g)?.length).toBe(2)
    })
    it(`${file} no longer calls checkRateLimit(…, "auth")`, () => {
      expect(src).not.toMatch(/checkRateLimit\(/)
      expect(src).not.toMatch(/"auth"/)
    })
    it(`${file} limits with the token it is about to look up`, () => {
      // The limit needs the token, so params are read first — and the limit
      // still runs before any lookup.
      for (const verb of ["GET", "POST"]) {
        const fn = src.slice(src.indexOf(`export async function ${verb}`))
        const params = fn.indexOf("await params")
        const limit = fn.indexOf("checkDoorwayLimit(")
        const lookup = fn.search(/await (peek|claim|record|respond|reschedule)\w*\(/)
        expect(params).toBeGreaterThan(-1)
        expect(limit).toBeGreaterThan(params)
        expect(lookup).toBeGreaterThan(limit)
      }
    })
  }

  it("sign-in uses the strict auth tier per email and the auth_net ceiling per network", () => {
    // 28 Sep 2026: the per-network charge moved from "auth" to "auth_net"
    // (signin-code-limit.test.ts); the per-address charge is unchanged.
    const otp = read("app/api/auth/request-otp/route.ts")
    expect(otp).toMatch(/checkRateLimit\(anonRateLimitId\(`email:\$\{door\}:\$\{email\}`\), "auth"\)/)
    expect(otp).toMatch(/checkRateLimit\(anonRateLimitId\(`ip:\$\{door\}:\$\{ip\}`\), "auth_net"\)/)
    expect(otp).not.toMatch(/checkDoorwayLimit/)
  })

  it("the doorway presets are the decided numbers", () => {
    const src = read("lib/rate-limit.ts")
    expect(src).toMatch(/key: 'doorway_link:min', limit: 20,\s+windowSeconds: 60/)
    expect(src).toMatch(/key: 'doorway_link:day', limit: 200,\s+windowSeconds: DAY/)
    expect(src).toMatch(/key: 'doorway_net:min', limit: 120,\s+windowSeconds: 60/)
    expect(src).toMatch(/key: 'doorway_net:day', limit: 3000,\s+windowSeconds: DAY/)
    expect(src).toMatch(/key: 'doorway_write:min', limit: 5,\s+windowSeconds: 60/)
    expect(src).toMatch(/key: 'doorway_write:day', limit: 20,\s+windowSeconds: DAY/)
  })

  it("the consent answer (it emails recruiters) also takes the per-link write ceiling", () => {
    const src = read("app/api/consent/[token]/route.ts")
    const post = src.slice(src.indexOf("export async function POST"))
    const doorway = post.indexOf("checkDoorwayLimit(")
    const write = post.indexOf('checkDoorwayWriteLimit("consent", token)')
    const record = post.indexOf("await recordDecision(")
    expect(write).toBeGreaterThan(doorway)
    expect(record).toBeGreaterThan(write)
    // Reads are not writes: GET never spends the write allowance.
    const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function POST"))
    expect(get).not.toMatch(/checkDoorwayWriteLimit/)
  })
})

/* ── the 28 Sep scenario, against the real route handler ────────────────── */

const IP = "203.0.113.50" // TEST-NET-3, never a real network
const req = (token: string, init?: { method?: string; body?: unknown }) =>
  new Request(`https://doorway.invalid/api/booking/${token}`, {
    method: init?.method ?? "GET",
    headers: { "x-forwarded-for": `${IP}, 10.0.0.1`, "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  }) as never
const ctx = (token: string) => ({ params: Promise.resolve({ token }) })
const open = (t: string) => GET(req(t), ctx(t))
const pick = (t: string) => POST(req(t, { method: "POST", body: { slotId: "slot-1" } }), ctx(t))

describe("candidates on one network (the 28 Sep reproduction)", () => {
  beforeEach(() => counters.clear())

  it("A opens and picks, then B opens and picks — all four succeed", async () => {
    const a = "A".repeat(32)
    const b = "B".repeat(32)
    const statuses = [
      (await open(a)).status,
      (await pick(a)).status,
      (await open(b)).status,
      (await pick(b)).status,
    ]
    // Before the fix the fourth was 429 and the page said the link was dead.
    expect(statuses).toEqual([200, 200, 200, 200])
  })

  it("a whole office of ten candidates can each open, reload and pick", async () => {
    for (let i = 0; i < 10; i++) {
      const t = `office-candidate-${i}-`.padEnd(32, "x")
      for (const res of [await open(t), await open(t), await pick(t)]) expect(res.status).toBe(200)
    }
  })

  it("one link hammered past 20 a minute is refused with Retry-After", async () => {
    const t = "hammered".padEnd(32, "x")
    for (let i = 0; i < 20; i++) expect((await open(t)).status).toBe(200)
    const refused = await open(t)
    expect(refused.status).toBe(429)
    expect(refused.headers.get("Retry-After")).toBe("42")
    // …and the next person's link on the same network is untouched.
    expect((await open("neighbour".padEnd(32, "x"))).status).toBe(200)
  })

  it("the network ceiling still stops a flood across many links", async () => {
    for (let i = 0; i < 120; i++) expect((await open(`flood-${i}`.padEnd(32, "x"))).status).toBe(200)
    expect((await open("flood-final".padEnd(32, "x"))).status).toBe(429)
  })
})

/* ── consent answers: each one emails the agency's recruiters ───────────── */

const consentReq = (token: string, decision: string) =>
  new Request(`https://doorway.invalid/api/consent/${token}`, {
    method: "POST",
    headers: { "x-forwarded-for": `${IP}, 10.0.0.1`, "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  }) as never
const answer = (t: string, decision: string) => CONSENT_POST(consentReq(t, decision), ctx(t))

describe("consent answers are capped per link, not per network", () => {
  beforeEach(() => counters.clear())

  it("a sixth answer on one link within a minute is refused; a neighbour's link still saves", async () => {
    const t = "toggler".padEnd(32, "x")
    const decisions = ["granted", "withdrawn", "granted", "withdrawn", "granted"]
    for (const d of decisions) expect((await answer(t, d)).status).toBe(200)
    const refused = await answer(t, "withdrawn")
    expect(refused.status).toBe(429)
    expect(refused.headers.get("Retry-After")).toBe("42")
    // A second candidate on the same Wi-Fi answers their own link untouched.
    expect((await answer("neighbour".padEnd(32, "x"), "granted")).status).toBe(200)
  })

  it("an office of ten candidates can each answer on one network", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await answer(`consent-office-${i}-`.padEnd(32, "x"), "granted")).status).toBe(200)
    }
  })
})
