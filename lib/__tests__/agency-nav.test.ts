/**
 * One nav, every screen — and briefs reachable from all of them.
 *
 * The list was hand-rolled five times and had drifted: the briefs page
 * offered Roles / Client access / Audit log while its siblings also offered
 * Settings and Notifications, and the DASHBOARD offered no route navigation
 * at all (its "Navigate" list was in-page scroll anchors). So the only way to
 * a client brief was knowing the URL, which is most of why four sat unseen
 * for a week.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SCREENS: Array<[string, string]> = [
  ["app/agencies/page.tsx", "roles"],
  ["app/agencies/briefs/page.tsx", "briefs"],
  ["app/agencies/clients/page.tsx", "clients"],
  ["app/agencies/audit/page.tsx", "audit"],
  ["app/agencies/settings/page.tsx", "settings"],
  ["app/agencies/notifications/page.tsx", "notifications"],
]

describe("every agency screen uses the shared nav", () => {
  it.each(SCREENS)("%s renders AgencyNav", (path, key) => {
    const s = read(path)
    expect(s).toMatch(/<AgencyNav current="/)
    expect(s).toContain(`<AgencyNav current="${key}"`)
  })

  it("no screen hand-rolls its own route list any more", () => {
    // The drift was five copies of the same buttons. One definition or none.
    for (const [path] of SCREENS) {
      const s = read(path)
      const rolled = /className="ag-step[^"]*"\s+onClick=\{\(\) => router\.push\("\/agencies/.test(s)
      expect(rolled, `${path} still hand-rolls nav buttons`).toBe(false)
    }
  })

  it("the dashboard's in-page anchors are labelled as such, not as Navigate", () => {
    // Both lists live in that sidebar; calling them both "Navigate" is what
    // disguised the absence of any route out of the dashboard.
    const s = read("app/agencies/page.tsx")
    expect(s).toMatch(/ag-rail-label">On this page</)
  })
})

describe("the nav itself", () => {
  const nav = read("components/agency/agency-nav.tsx")

  it("offers briefs to every screen", () => {
    expect(nav).toMatch(/key: "briefs"[^\n]*href: "\/agencies\/briefs"/)
  })

  it("points every item at a route that exists", () => {
    const hrefs = [...nav.matchAll(/href: "(\/agencies[^"]*)"/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(4)
    for (const href of hrefs) {
      const sub = href.replace(/^\/agencies\/?/, "")
      const path = sub ? `app/agencies/${sub}/page.tsx` : "app/agencies/page.tsx"
      expect(existsSync(join(process.cwd(), path)), `${href} has no page`).toBe(true)
    }
  })

  it("shows the current screen rather than hiding it", () => {
    // Omitting the current item made the list a different length on every
    // screen, which is half of how the drift went unnoticed.
    expect(nav).toMatch(/aria-current=\{isCurrent \? "page" : undefined\}/)
  })

  it("a failed count renders no badge rather than breaking the page", () => {
    expect(nav).toMatch(/\.catch\(\(\) => \{\}\)/)
    expect(nav).toMatch(/waiting > 0 &&/)
  })
})

describe("briefs are not scoped to the active agency", () => {
  const listRoute = read("app/api/agency/briefs/route.ts")
  const actRoute = read("app/api/agency/briefs/[briefId]/route.ts")
  const db = read("lib/agency/db.ts")

  it("the inbox lists every membership's briefs", () => {
    expect(listRoute).toMatch(/memberships\.map\(async \(m\)/)
    expect(listRoute).toMatch(/contextForAgency\(auth\.ctx, m\.agencyId\)/)
  })

  it("acting on a brief resolves its agency from the BRIEF, not the cookie", () => {
    // Otherwise accepting a brief from your other agency throws "not found",
    // which is both wrong and unexplainable to the recruiter.
    expect(actRoute).toMatch(/from\("role_briefs"\)[\s\S]{0,80}select\("agency_id"\)/)
    expect(actRoute).toMatch(/contextForAgency\(auth\.ctx, owner\.agency_id/)
    expect(actRoute).toMatch(/acceptBrief\(ctx, briefId\)/)
    expect(actRoute).toMatch(/declineBrief\(ctx, briefId/)
  })

  it("the viewer check happens after the tenant is resolved", () => {
    // The role that matters is the one held in the BRIEF's agency, which can
    // differ from the active one.
    const resolveAt = actRoute.indexOf("contextForAgency(auth.ctx, owner.agency_id")
    const viewerAt = actRoute.indexOf('ctx.role === "viewer"')
    expect(resolveAt).toBeGreaterThan(-1)
    expect(viewerAt).toBeGreaterThan(resolveAt)
  })

  it("contextForAgency re-proves membership and never falls back silently", () => {
    const fn = db.slice(db.indexOf("export function contextForAgency"))
    const body = fn.slice(0, fn.indexOf("\n}"))
    expect(body).toMatch(/memberships \?\? \[\]\)\.find/)
    expect(body).toMatch(/throw new AgencyAccessError/)
  })
})
