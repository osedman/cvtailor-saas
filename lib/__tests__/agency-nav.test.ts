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
  ["app/agencies/candidates/page.tsx", "candidates"],
  ["app/agencies/candidates/[candidateId]/page.tsx", "candidates"],
]

/**
 * Screens INSIDE a role. They render the same global nav with no current
 * item (nothing global is current inside a role) and the role's own rail
 * underneath. Seven of these hand-rolled a "Navigate" list each until
 * 3 Sep 2026, and two offered no route navigation at all.
 */
const ROLE_SCREENS = [
  "app/agencies/roles/[roleId]/page.tsx",
  "app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx",
  "app/agencies/roles/[roleId]/interviews/page.tsx",
  "app/agencies/roles/[roleId]/close-out/page.tsx",
  "app/agencies/roles/[roleId]/candidates/[candidateId]/dossier/page.tsx",
]

describe("every agency screen uses the shared nav", () => {
  it.each(SCREENS)("%s renders AgencyNav for its own key", (path, key) => {
    // Props may be inline or multi-line (the dashboard passes sections), so
    // match the tag and the key rather than one exact formatting.
    const s = read(path)
    expect(s).toMatch(/<AgencyNav[\s\n]/)
    expect(s).toMatch(new RegExp(`<AgencyNav[\\s\\S]{0,80}current="${key}"`))
  })

  it("no screen hand-rolls its own route list any more", () => {
    // The drift was five copies of the same buttons. One definition or none.
    for (const [path] of SCREENS) {
      const s = read(path)
      const rolled = /className="ag-step[^"]*"\s+onClick=\{\(\) => router\.push\("\/agencies/.test(s)
      expect(rolled, `${path} still hand-rolls nav buttons`).toBe(false)
    }
  })

  it("there is exactly ONE nav list per screen", () => {
    // The first fix added routes ALONGSIDE the dashboard's scroll anchors,
    // leaving two navigations in one rail — with "Roles" and "Clients" in
    // both, meaning different things in each. A page's sections now nest
    // under its own nav item instead.
    for (const [path] of SCREENS) {
      const s = read(path)
      const railLabels = (s.match(/ag-rail-label">(Navigate|On this page)</g) ?? []).length
      expect(railLabels, `${path} has ${railLabels} nav rails`).toBe(0)
      const strayNav = /<nav className="agd-nav"/.test(s)
      expect(strayNav, `${path} still renders its own agd-nav list`).toBe(false)
    }
  })

  it.each(ROLE_SCREENS)("%s renders the global nav, with no current item", (path) => {
    const s = read(path)
    expect(s).toMatch(/<AgencyNav \/>/)
    expect(s).toMatch(/<AgencySwitcher \/>/)
    // The role header carries the phase rail, the owner and the next action.
    expect(s).toMatch(/<RoleHeader roleId=\{roleId\} hat="recruiter" \/>/)
    expect(s).not.toMatch(/<PhaseRail/)
    expect(/ag-rail-label">Navigate</.test(s), `${path} still hand-rolls a Navigate rail`).toBe(false)
    const rolled = /className="ag-step[^"]*"\s+onClick=\{\(\) => router\.push\("\/agencies/.test(s)
    expect(rolled, `${path} still hand-rolls nav buttons`).toBe(false)
  })

  it.each(ROLE_SCREENS)("%s never links the role bare", (path) => {
    // The bare role URL forwards past the workflow once a submission exists.
    // A crumb, rail or button inside a role that links it bare bounces the
    // reader straight back to where they clicked from — "This role" on
    // close-out was inert for every role in close-out. workflowHref is the
    // only way to link the workflow from inside a role.
    const s = read(path)
    const bare = [...s.matchAll(/`\/agencies\/roles\/\$\{roleId\}`/g)]
    // The workflow page compares its own URL to the landing path; that is a
    // comparison, not a link.
    const isWorkflow = path === "app/agencies/roles/[roleId]/page.tsx"
    expect(bare.length, `${path} links the role bare`).toBe(isWorkflow ? 1 : 0)
    // The workflow page IS the destination; every other role screen reaches
    // it through the role rail (which builds its href with workflowHref) or
    // through the helper directly.
    if (!isWorkflow) expect(/workflowHref\(|<RoleRail /.test(s), `${path} has no way into the workflow`).toBe(true)
  })

  it("the dashboard's sections are passed to the nav, not rendered beside it", () => {
    const s = read("app/agencies/page.tsx")
    expect(s).toMatch(/sections=\{\[/)
    expect(s).toMatch(/id: "agd-roles"/)
    expect(s).toMatch(/onSection=/)
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
