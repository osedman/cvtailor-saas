/**
 * Where a request's time goes (30 Sep 2026). See lib/server-timing.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { readFileSync } from "fs"
import { globSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { withTiming, timedFetch, timeStep, SLOW_REQUEST_MS } from "@/lib/server-timing"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

afterEach(() => vi.restoreAllMocks())

describe("withTiming", () => {
  it("counts database and auth round trips into Server-Timing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("[]"))
    const handler = withTiming("/api/x", "GET", async () => {
      await timedFetch("https://p.supabase.co/rest/v1/members?select=*")
      await timedFetch("https://p.supabase.co/rest/v1/agencies?select=*")
      await timedFetch("https://p.supabase.co/auth/v1/user")
      await timeStep("ai", async () => 1)
      return new Response("ok")
    })
    const res = await handler()
    const h = res.headers.get("Server-Timing") ?? ""
    expect(h).toMatch(/db;desc="2 calls, summed";dur=/)
    expect(h).toMatch(/auth;desc="1 call";dur=/)
    expect(h).toMatch(/ai;desc="1 call";dur=/)
    expect(h).toMatch(/total;dur=\d/)
    // Counts and durations only: no URL, query or id reaches the header.
    expect(h).not.toMatch(/supabase|members|select/)
  })

  it("logs one [slow] line past the threshold, naming the route", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const now = vi.spyOn(performance, "now")
    now.mockReturnValueOnce(0).mockReturnValueOnce(SLOW_REQUEST_MS + 250)
    await withTiming("/api/agency/roles/[roleId]", "PATCH", async () => new Response("ok"))()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[slow\] PATCH \/api\/agency\/roles\/\[roleId\] 1250ms/)
  })

  it("outside a wrapped route, timedFetch is plain fetch", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("x"))
    await timedFetch("https://example.test/")
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe("the wiring stays in place", () => {
  const routes = globSync("app/api/**/route.ts", { cwd: process.cwd() })

  it("finds the routes (guards a broken glob)", () => {
    expect(routes.length).toBeGreaterThan(100)
  })

  it("every route handler is exported through withTiming", () => {
    const bare = routes.filter((r) => /export async function (GET|POST|PATCH|PUT|DELETE)\b/.test(read(r)))
    expect(bare, bare.join("\n")).toEqual([])
  })

  it("every Supabase client factory counts its calls", () => {
    expect(read("lib/supabase/server.ts").match(/fetch: timedFetch/g)?.length).toBe(2)
    expect(read("lib/agency/db.ts").match(/fetch: timedFetch/g)?.length).toBe(2)
    expect(read("lib/agency/client-auth.ts")).toMatch(/fetch: timedFetch/)
  })

  it("only the sign-in routes still pay for getUser()", () => {
    const allowed = new Set([
      "app/api/auth/post-login/route.ts",
      "app/api/auth/landing/route.ts",
      "app/api/hiring/accept/route.ts",
    ])
    const paying = routes.filter((r) => !allowed.has(r) && /auth\.getUser\(\)/.test(read(r)))
    expect(paying, paying.join("\n")).toEqual([])
  })
})
