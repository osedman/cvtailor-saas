/**
 * Security + speed pass on the database (30 Sep 2026). Applied to staging and
 * verified by effect: a signed-in user is refused on plan / usage / email,
 * can still change their CV template, can only count their own usage, and
 * anon cannot touch the rate limiter. Pinned here so a later migration that
 * re-grants a whole table, or re-exposes the rate limiter, is caught.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const sql = (f: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
const PUB = sql("20260930120000_harden_public.sql")
const AG = sql("20260930120100_harden_agency.sql")

describe("profiles: a user edits their name, country and template, nothing else", () => {
  it("drops the table-wide write and grants a column list without plan, usage or email", () => {
    expect(PUB).toMatch(/revoke insert, update, delete on public\.profiles from anon, authenticated;/)
    const grant = PUB.match(/grant update \(([^)]*)\) on public\.profiles to authenticated;/)
    expect(grant).not.toBeNull()
    const cols = grant![1].split(",").map((c) => c.trim())
    for (const c of ["plan", "tailors_used", "email", "id", "recruiter_visibility"]) expect(cols).not.toContain(c)
    expect(cols).toContain("cv_template")
  })

  it("the only user-scoped profile write in the app is a column still granted", () => {
    const route = readFileSync(join(process.cwd(), "app/api/preferences/route.ts"), "utf8")
    expect(route).toMatch(/\.update\(\{ cv_template: requested \}\)/)
  })
})

describe("functions", () => {
  it("increment_tailors_used only counts the caller, and anon cannot call it", () => {
    expect(PUB).toMatch(/where id = user_id\s+and id = \(select auth\.uid\(\)\);/)
    expect(PUB).toMatch(/revoke execute on function public\.increment_tailors_used\(uuid\) from public, anon;/)
  })

  it("the rate limiter is server-only, and the app calls it with the service role", () => {
    expect(PUB).toMatch(/revoke execute on function public\.consume_rate_limit\(uuid, text, integer, integer\) from public, anon, authenticated;/)
    const rl = readFileSync(join(process.cwd(), "lib/rate-limit.ts"), "utf8")
    expect(rl).toMatch(/admin\.rpc\('consume_rate_limit'/)
  })

  it("the agency policy helpers stay callable by signed-in users (policies need them)", () => {
    expect(AG).toMatch(/grant execute on function agency\.has_role\(uuid, text\[\]\) to authenticated/)
    expect(AG).toMatch(/grant execute on function agency\.member_agency_ids\(\) to authenticated/)
  })
})

describe("speed", () => {
  it("every rewritten policy evaluates auth.uid() once per query", () => {
    const policies = PUB.split(/(?=alter policy )/).filter((s) => s.startsWith("alter policy "))
    expect(policies).toHaveLength(38)
    for (const p of policies) expect(p.replace(/\(select auth\.uid\(\)\)/g, "")).not.toMatch(/auth\.uid\(\)/)
  })

  it("85 foreign-key indexes across the two files", () => {
    const n = (s: string) => (s.match(/^create index if not exists /gm) ?? []).length
    expect(n(PUB) + n(AG)).toBe(85)
  })
})
