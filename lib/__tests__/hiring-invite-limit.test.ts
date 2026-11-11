/**
 * Colleagues in one office must each be able to open and accept their own
 * hiring-manager invite.
 *
 * 28 Sep 2026 ("fix the hiring invite acceptance limit too"): reproduced from
 * a TEST-NET address, /api/hiring/accept charged a per-network limit at the
 * sign-in tier — 3 a minute — so the fourth colleague on one network was
 * refused; /api/hiring/invite charged the "share" tier per network — 10 a
 * minute — so the eleventh colleague opening their invite page was refused,
 * and the page read that 429 as "This invite link isn't valid any more".
 *
 * Invite tokens are 24 random bytes. The per-network strict tiers guarded
 * nothing guessable; they only blocked people who share an office. The fix is
 * the one commit ce3efef made for booking, consent and reference: the doorway
 * limit (a loose per-network flood ceiling plus a per-link limit). Accept
 * keeps its per-user "auth" limit, which stops one throwaway account grinding
 * links.
 *
 * The scenarios run the real route handlers against an in-memory copy of
 * consume_rate_limit(), so they need no database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

/* ── an in-memory consume_rate_limit(), and a swappable session ─────────── */
const counters = new Map<string, number>()
let sessionUser: { id: string; email: string; email_confirmed_at?: string } | null = null
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
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
  }),
}))

/* ── the invite library: every token is a live invite, every accept binds ─ */
const peekInvite = vi.fn(async () => ({
  agencyName: "Test Agency",
  company: "Example Ltd",
  contactEmail: "invitee@example.test",
}))
const acceptInvite = vi.fn(async () => ({ ok: true as const, agencyName: "Test Agency" }))
vi.mock("@/lib/agency/client-auth", () => ({
  peekInvite: (...a: unknown[]) => (peekInvite as (...x: unknown[]) => unknown)(...a),
  acceptInvite: (...a: unknown[]) => (acceptInvite as (...x: unknown[]) => unknown)(...a),
}))

import { GET as PREVIEW } from "@/app/api/hiring/invite/route"
import { POST as ACCEPT } from "@/app/api/hiring/accept/route"
import { doorwayLoadState } from "@/lib/agency/doorway-messages"
import { tooManyAcceptsMessage } from "@/lib/agency/hiring-invite-messages"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

const PREVIEW_ROUTE = "app/api/hiring/invite/route.ts"
const ACCEPT_ROUTE = "app/api/hiring/accept/route.ts"
const PAGE = "app/hiring/invite/[token]/page.tsx"

describe("the hiring invite routes use the doorway limit, not a per-network strict tier", () => {
  it("the preview charges checkDoorwayLimit(\"hiring-invite\", ip, token) and no per-IP checkRateLimit", () => {
    const src = read(PREVIEW_ROUTE)
    expect(src).toMatch(/checkDoorwayLimit\("hiring-invite", ip, token\)/)
    expect(src).not.toMatch(/checkRateLimit\(/)
    expect(src).not.toMatch(/hiring-invite-ip/)
    expect(src).not.toMatch(/"share"/)
  })

  it("the preview reads the token, then limits, then looks the invite up", () => {
    const src = read(PREVIEW_ROUTE)
    const fn = src.slice(src.indexOf("async function GET"))
    const token = fn.indexOf('searchParams.get("token")')
    const limit = fn.indexOf("checkDoorwayLimit(")
    const empty = fn.indexOf("if (!token) return deadLink()")
    const lookup = fn.indexOf("await peekInvite(")
    expect(token).toBeGreaterThan(-1)
    expect(limit).toBeGreaterThan(token)
    expect(empty).toBeGreaterThan(limit)
    expect(lookup).toBeGreaterThan(limit)
  })

  it("accept keeps checkRateLimit(user.id, \"auth\") and swaps only the per-IP charge", () => {
    const src = read(ACCEPT_ROUTE)
    expect(src).toMatch(/checkRateLimit\(user\.id, "auth"\)/)
    expect(src).toMatch(/checkDoorwayLimit\("hiring-accept", ip, token\)/)
    expect(src.match(/checkRateLimit\(/g)?.length).toBe(1)
    expect(src).not.toMatch(/hiring-accept-ip/)
    expect(src).not.toMatch(/anonRateLimitId/)
  })

  it("accept checks the session, then both limits, then binds", () => {
    const src = read(ACCEPT_ROUTE)
    const fn = src.slice(src.indexOf("async function POST"))
    const session = fn.indexOf("auth.getUser()")
    const perUser = fn.indexOf('checkRateLimit(user.id, "auth")')
    const doorway = fn.indexOf("checkDoorwayLimit(")
    const bind = fn.indexOf("await acceptInvite(")
    expect(perUser).toBeGreaterThan(session)
    expect(doorway).toBeGreaterThan(perUser)
    expect(bind).toBeGreaterThan(doorway)
  })

  it("sign-in keeps its own limits: auth per email, auth_net per network, no doorway limit", () => {
    const otp = read("app/api/auth/request-otp/route.ts")
    expect(otp).toMatch(/checkRateLimit\(anonRateLimitId\(`email:\$\{door\}:\$\{email\}`\), "auth"\)/)
    expect(otp).toMatch(/checkRateLimit\(anonRateLimitId\(`ip:\$\{door\}:\$\{ip\}`\), "auth_net"\)/)
    expect(otp).not.toMatch(/checkDoorwayLimit/)
  })
})

/* ── the office scenario, against the real route handlers ───────────────── */

const IP = "203.0.113.60" // TEST-NET-3, never a real network
const headers = { "x-forwarded-for": `${IP}, 10.0.0.1`, "content-type": "application/json" }
const preview = (token: string) => {
  const url = `https://doorway.invalid/api/hiring/invite?token=${encodeURIComponent(token)}`
  const req = new Request(url, { headers }) as unknown as { nextUrl: URL }
  req.nextUrl = new URL(url)
  return PREVIEW(req as never)
}
const accept = (token: string, userId: string) => {
  sessionUser = { id: userId, email: "invitee@example.test", email_confirmed_at: "2026-09-01T00:00:00Z" }
  return ACCEPT(
    new Request("https://doorway.invalid/api/hiring/accept", {
      method: "POST",
      headers,
      body: JSON.stringify({ token }),
    }) as never
  )
}
const tok = (seed: string) => seed.padEnd(32, "x")

describe("colleagues on one network (the 28 Sep reproduction)", () => {
  beforeEach(() => {
    counters.clear()
    sessionUser = null
    peekInvite.mockClear()
    acceptInvite.mockClear()
  })

  it("ten colleagues each open (and reload) and accept their own invite — none refused", async () => {
    for (let i = 0; i < 10; i++) {
      const t = tok(`colleague-${i}-`)
      // Twenty previews and ten accepts from one network: before the fix the
      // eleventh preview and the fourth accept were 429.
      expect((await preview(t)).status).toBe(200)
      expect((await preview(t)).status).toBe(200)
      expect((await accept(t, `user-${i}`)).status).toBe(200)
    }
    expect(acceptInvite).toHaveBeenCalledTimes(10)
  })

  it("the preview still masks the address", async () => {
    const res = await preview(tok("masked"))
    const body = (await res.json()) as { invite: { maskedEmail: string } }
    expect(body.invite.maskedEmail).toBe("i•••@example.test")
  })

  it("one invite link previewed past 20 a minute is refused with Retry-After; a neighbour's is not", async () => {
    const t = tok("hammered-preview")
    for (let i = 0; i < 20; i++) expect((await preview(t)).status).toBe(200)
    const refused = await preview(t)
    expect(refused.status).toBe(429)
    expect(refused.headers.get("Retry-After")).toBe("42")
    expect(peekInvite).toHaveBeenCalledTimes(20)
    expect((await preview(tok("neighbour"))).status).toBe(200)
  })

  it("one invite link accepted past 20 a minute across many accounts is refused before acceptInvite", async () => {
    const t = tok("hammered-accept")
    for (let i = 0; i < 20; i++) expect((await accept(t, `grinder-${i}`)).status).toBe(200)
    const refused = await accept(t, "grinder-final")
    expect(refused.status).toBe(429)
    expect(refused.headers.get("Retry-After")).toBe("42")
    expect(acceptInvite).toHaveBeenCalledTimes(20)
  })

  it("one account still cannot grind: the fourth accept by one user in a minute is refused", async () => {
    for (let i = 0; i < 3; i++) expect((await accept(tok(`grind-${i}`), "one-user")).status).toBe(200)
    expect((await accept(tok("grind-3"), "one-user")).status).toBe(429)
  })

  it("the network ceiling still stops a flood of previews across many links", async () => {
    for (let i = 0; i < 120; i++) expect((await preview(tok(`flood-${i}-`))).status).toBe(200)
    expect((await preview(tok("flood-final"))).status).toBe(429)
  })

  it("an empty token is still charged, then answered with the one dead-link 404", async () => {
    const res = await preview("")
    expect(res.status).toBe(404)
    expect(peekInvite).not.toHaveBeenCalled()
    expect([...counters.keys()].some((k) => k.endsWith(":doorway_net:min"))).toBe(true)
  })
})

/* ── the accept page: only a 404 is the dead link ───────────────────────── */

describe("the invite page's load and accept states", () => {
  it("a 429 on load is the busy card, a 5xx or network error is retry, only a 404 is dead", () => {
    expect(doorwayLoadState({ status: 429, retryAfter: 42, what: "this invitation" })?.kind).toBe("busy")
    const failed = doorwayLoadState({ status: 503, retryAfter: null, what: "this invitation" })
    expect(failed).toEqual({
      kind: "retry",
      title: "We could not load this invitation just now.",
      body: "This is usually brief. Please try again.",
    })
    expect(doorwayLoadState({ status: null, retryAfter: null, what: "this invitation" })?.kind).toBe("retry")
    expect(doorwayLoadState({ status: 404, retryAfter: null })).toEqual({ kind: "dead" })
  })

  it("the page maps its load through doorwayLoadState and shows DoorwayLoadIssue", () => {
    const src = read(PAGE)
    expect(src).not.toMatch(/if \(!res\.ok\) return setLookup\("dead"\)/)
    expect(src).toMatch(/doorwayLoadState\(\{\s*status: res\.status/)
    expect(src).toMatch(/issue\?\.kind === "dead"\) return setLookup\("dead"\)/)
    expect(src).toMatch(/if \(issue\) return setLoadIssue\(issue\)/)
    expect(src).toMatch(/<DoorwayLoadIssue issue=\{loadIssue\} onRetry=\{reload\}/)
    // A network failure is our failure, never the dead link.
    const catchBlock = src.slice(src.indexOf("} catch {", src.indexOf("async function peek")))
    expect(catchBlock.slice(0, 200)).toMatch(/setLoadIssue\(doorwayLoadState\(\{ status: null/)
    expect(catchBlock.slice(0, 200)).not.toMatch(/setLookup\("dead"\)/)
  })

  it("the busy/retry card follows the hiring shell's theme, not consent's fixed light tokens", () => {
    const src = read(PAGE)
    // Every cs- token the card reads is re-pointed at the shell's --ag-* token,
    // which the dark block in agencies.css swaps under .ag-app.ag-themed.
    for (const [cs, ag] of [
      ["ink", "ink"],
      ["ink-2", "ink-2"],
      ["ink-3", "ink-3"],
      ["paper", "paper"],
      ["cream", "cream"],
      ["border", "border"],
      ["line", "line-2"],
      ["coral", "coral"],
      ["coral-text", "coral-text"],
      ["tint", "tint-1"],
    ]) {
      expect(src).toContain(`"--cs-${cs}": "var(--ag-${ag})"`)
    }
    // The header comment no longer claims the page is light on purpose.
    expect(readFileSync(join(process.cwd(), PAGE), "utf8")).not.toMatch(/Light theme on purpose/)
  })

  it("a 429 on accept says how long to wait", () => {
    expect(tooManyAcceptsMessage(42)).toBe(
      "Too many tries just now. Wait 42 seconds, then accept again."
    )
    expect(tooManyAcceptsMessage(80_000)).toMatch(/Wait about 23 hours, then accept again\.$/)
    expect(tooManyAcceptsMessage(null)).toMatch(/Wait 60 seconds/)
    const src = read(PAGE)
    expect(src).toMatch(
      /res\.status === 429[\s\S]{0,200}tooManyAcceptsMessage\(retryAfterSeconds\(res\.headers\.get\("Retry-After"\)\)\)/
    )
  })

  it("403 email_mismatch keeps its own state and copy", () => {
    const src = read(PAGE)
    expect(src).toMatch(/res\.status === 403 && body\.reason === "email_mismatch"\) \{\s*setPhase\("mismatch"\)/)
    expect(src).toMatch(/This invitation is for a different address/)
    const route = read(ACCEPT_ROUTE)
    expect(route).toMatch(
      /This invitation was issued to a different email address\. Sign out and sign back in with that address to accept it\./
    )
  })
})
