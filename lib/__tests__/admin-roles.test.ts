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
  const routes: Array<[string, "viewer" | "support" | "admin"]> = [
    ["app/api/admin/stats/route.ts", "viewer"],
    ["app/api/admin/insights/route.ts", "viewer"],
    ["app/api/admin/activity/route.ts", "support"],
    // The boundary that matters: anything that CHANGES state — approving
    // courses into the live catalog, triggering syncs, market checks,
    // managing admins — stays full-admin.
    ["app/api/admin/course-catalog/route.ts", "admin"],
    ["app/api/admin/course-candidates/route.ts", "admin"],
    ["app/api/admin/course-sync/route.ts", "admin"],
    ["app/api/admin/market-check/route.ts", "admin"],
    ["app/api/admin/admins/route.ts", "admin"],
  ]
  for (const [route, level] of routes) {
    it(`${route} requires ${level}`, () => {
      const src = read(route)
      const levels = [...src.matchAll(/requireAdmin\(["'](\w+)["']/g)].map((m) => m[1])
      expect(levels.length).toBeGreaterThan(0)
      expect(new Set(levels)).toEqual(new Set([level]))
      expect(src).not.toContain("isAdminEmail(")
      expect(src).not.toContain("isAdminViewer(")
      expect(src).not.toContain("sessionUser(")
    })
  }

  it("every route under app/api/admin is in the list above", () => {
    const { readdirSync } = require("fs") as typeof import("fs")
    const found = readdirSync(join(root, "app/api/admin")).map((d) => `app/api/admin/${d}/route.ts`).sort()
    // /me answers "what access do I have" for any admin, so it has no level.
    const listed = [...routes.map(([r]) => r), "app/api/admin/me/route.ts"].sort()
    expect(found).toEqual(listed)
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
