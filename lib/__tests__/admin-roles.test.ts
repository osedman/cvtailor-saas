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
  it("read-only stats accepts viewers", () => {
    expect(read("app/api/admin/stats/route.ts")).toContain("isAdminViewer(user.email)")
  })

  // The boundary that matters: anything that CHANGES state — approving courses
  // into the live catalog, triggering syncs, market checks — stays full-admin.
  const writeRoutes = [
    "app/api/admin/course-catalog/route.ts",
    "app/api/admin/course-candidates/route.ts",
    "app/api/admin/course-sync/route.ts",
    "app/api/admin/market-check/route.ts",
  ]
  for (const route of writeRoutes) {
    it(`${route} stays admin-only`, () => {
      const src = read(route)
      expect(src).toContain("isAdminEmail")
      expect(src).not.toContain("isAdminViewer")
    })
  }

  it("viewer access does not imply career-path beta", () => {
    const gate = read("lib/feature-gate.ts")
    expect(gate).toContain("isAdminEmail(email)")
    expect(gate).not.toContain("isAdminViewer")
  })
})
