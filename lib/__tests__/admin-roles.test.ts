import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { isAdminEmail, isAdminViewer, ADMIN_EMAILS, ADMIN_VIEWER_EMAILS } from "@/lib/admin"

const root = join(__dirname, "../..")
const read = (p: string) => readFileSync(join(root, p), "utf-8")

describe("admin roles", () => {
  it("full admins pass both checks", () => {
    for (const email of ADMIN_EMAILS) {
      expect(isAdminEmail(email)).toBe(true)
      expect(isAdminViewer(email)).toBe(true)
    }
  })

  it("viewers can view but are NOT admins", () => {
    for (const email of ADMIN_VIEWER_EMAILS) {
      expect(isAdminViewer(email)).toBe(true)
      expect(isAdminEmail(email)).toBe(false)
    }
  })

  it("is case-insensitive and rejects everyone else", () => {
    expect(isAdminViewer("O.OIFOH@GMAIL.COM")).toBe(true)
    expect(isAdminViewer("stranger@example.com")).toBe(false)
    expect(isAdminViewer(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
  })
})

describe("admin route gating", () => {
  // Every admin route goes through the one gate (lib/admin-access.ts); none
  // does its own email check any more.
  type Level = "viewer" | "support" | "admin"
  // Route → the levels its handlers ask for (reads first, then writes).
  const routes: Array<[string, Level[]]> = [
    ["app/api/admin/stats/route.ts", ["viewer"]],
    ["app/api/admin/insights/route.ts", ["viewer"]],
    ["app/api/admin/activity/route.ts", ["support"]],
    // The boundary that matters: anything that CHANGES state — approving
    // courses into the live catalog, triggering syncs, market checks,
    // managing admins — stays full-admin.
    ["app/api/admin/course-catalog/route.ts", ["admin"]],
    ["app/api/admin/course-candidates/route.ts", ["admin"]],
    ["app/api/admin/course-sync/route.ts", ["admin"]],
    ["app/api/admin/market-check/route.ts", ["admin"]],
    ["app/api/admin/admins/route.ts", ["admin"]],
    // Agencies: support reads and fixes team access; creating an agency and
    // changing its retention settings is admin.
    ["app/api/admin/agencies/route.ts", ["support", "admin"]],
    ["app/api/admin/agencies/[id]/route.ts", ["support", "admin"]],
    ["app/api/admin/agencies/[id]/members/route.ts", ["support"]],
    ["app/api/admin/agencies/[id]/clients/route.ts", ["support"]],
    ["app/api/admin/agencies/[id]/jobs/route.ts", ["support"]],
    // Consumer accounts: support finds a person and fixes their account.
    ["app/api/admin/users/route.ts", ["support"]],
    ["app/api/admin/users/[id]/route.ts", ["support"]],
  ]
  for (const [route, levels] of routes) {
    it(`${route} requires ${levels.join(" / ")}`, () => {
      const src = read(route)
      const found = [...src.matchAll(/requireAdmin\(["'](\w+)["']/g)].map((m) => m[1])
      expect(found.length).toBeGreaterThan(0)
      expect(new Set(found)).toEqual(new Set(levels))
      expect(src).not.toContain("isAdminEmail(")
      expect(src).not.toContain("isAdminViewer(")
      expect(src).not.toContain("sessionUser(")
    })
  }

  it("every route file under app/api/admin is in the list above", () => {
    const { readdirSync, statSync } = require("fs") as typeof import("fs")
    const walk = (dir: string): string[] =>
      readdirSync(join(root, dir)).flatMap((name: string) => {
        const rel = `${dir}/${name}`
        return statSync(join(root, rel)).isDirectory() ? walk(rel) : name === "route.ts" ? [rel] : []
      })
    // /me answers "what access do I have" for any admin, so it has no level.
    const listed = [...routes.map(([r]) => r), "app/api/admin/me/route.ts"].sort()
    expect(walk("app/api/admin").sort()).toEqual(listed)
  })

  it("changing the admin list needs two-step verification; reading it does not", () => {
    const src = read("app/api/admin/admins/route.ts")
    expect(src).toContain('requireAdmin("admin", { twoStep: true })')
    expect(src.match(/requireAdmin\("admin"\)/g)?.length).toBe(1) // GET only
    expect(src).toContain('admin.rpc("admin_set_platform_admin"')
  })

  it("course writes need two-step verification; reading the queue does not", () => {
    for (const route of ["app/api/admin/course-catalog/route.ts", "app/api/admin/course-candidates/route.ts"]) {
      const src = read(route)
      const [get, post] = [src.slice(0, src.indexOf("async function POST_handler")), src.slice(src.indexOf("async function POST_handler"))]
      expect(get).toContain("requireAdmin('admin')")
      expect(get).not.toContain("twoStep: true")
      expect(post).toContain("requireAdmin('admin', { twoStep: true })")
    }
    // The manual sync is a GET that writes.
    expect(read("app/api/admin/course-sync/route.ts")).toContain("requireAdmin('admin', { twoStep: true })")
  })

  it("the activity log has no write handler", () => {
    const src = read("app/api/admin/activity/route.ts")
    expect(src).not.toMatch(/export const (POST|PATCH|PUT|DELETE)/)
  })

  it("viewer access does not imply career-path beta", () => {
    const gate = read("lib/feature-gate.ts")
    expect(gate).toContain("isAdminEmail(email)")
    expect(gate).not.toContain("isAdminViewer")
  })
})
