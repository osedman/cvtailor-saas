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
import { tsCode, screenSource } from "./helpers/source-scan"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
// A screen is what renders, not what its route file contains — candidate
// detail is a shell plus an extracted component since 14 Sep 2026.
const screen = (p: string) => screenSource(p)

const SCREENS: Array<[string, string]> = [
  ["app/agencies/page.tsx", "today"],
  ["app/agencies/briefs/page.tsx", "briefs"],
  ["app/agencies/clients/page.tsx", "clients"],
  ["app/agencies/audit/page.tsx", "audit"],
  ["app/agencies/settings/page.tsx", "settings"],
  ["app/agencies/notifications/page.tsx", "notifications"],
  ["app/agencies/candidates/page.tsx", "candidates"],
  ["app/agencies/roles/page.tsx", "roles"],
  ["app/agencies/candidates/[candidateId]/page.tsx", "candidates"],
]

/**
 * Screens INSIDE a role. They render the global nav in ROLE SCOPE: the eight
 * desk destinations collapse to a single link up, because a role is a level
 * below the desk and does not need every level listed while you are in one.
 *
 * Seven of these hand-rolled a "Navigate" list each until 3 Sep 2026, and two
 * offered no route navigation at all — which is why the nav arrived here in
 * the first place. Nothing about that is reverted: every global destination
 * is still one click from the link up, which points at the level directly
 * above a role.
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

  it.each(ROLE_SCREENS)("%s collapses the desk to a single link up", (path) => {
    const s = screen(path)
    expect(s).toMatch(/<AgencyNav inRole \/>/)
    // The desk-scope call renders eight destinations in two labelled groups.
    // Inside a role that is the pile-up this rule exists to prevent.
    expect(s).not.toMatch(/<AgencyNav \/>/)
    expect(s).toMatch(/<AgencySwitcher \/>/)
    // The role header carries the phase rail, the owner and the next action.
    expect(s).toMatch(/<RoleHeader roleId=\{roleId\} hat="recruiter" \/>/)
    expect(s).not.toMatch(/<PhaseRail/)
    // The role's own sidebar rail is GONE (13 Sep 2026). It carried the same
    // three destinations as the header's phase rail, built from the same
    // phaseHref — and the header also says which phase the role is IN, and
    // is the only one of the two that survives below 900px, where
    // .ag-sidebar is display:none. Two rails, one job; the header kept it.
    expect(s).not.toMatch(/<RoleRail/)
    expect(/ag-rail-label">Navigate</.test(s), `${path} still hand-rolls a Navigate rail`).toBe(false)
    const rolled = /className="ag-step[^"]*"\s+onClick=\{\(\) => router\.push\("\/agencies/.test(s)
    expect(rolled, `${path} still hand-rolls nav buttons`).toBe(false)
  })

  it.each(ROLE_SCREENS)("%s shows at most one labelled group of its own", (path) => {
    // NEVER MORE THAN TWO LABELLED GROUPS AT ONCE. Desk screens spend both on
    // Navigate + Your desk; inside a role the desk is one unlabelled link, so
    // the only group a role screen may render is the seven steps. The
    // workflow screen carried four at once, which is the whole bug.
    const s = tsCode(read(path))
    const labels = [...s.matchAll(/className="ag-rail-label"/g)].length
    expect(labels, `${path} renders ${labels} labelled groups of its own`).toBeLessThanOrEqual(1)
  })

  it("the dossier is not stranded: it names the path the sidebar stopped naming", () => {
    // Reported by Ose on 13 Sep 2026, the day the desk collapsed to one link:
    // the dossier hangs off a candidate which hangs off a role, and it was
    // the one role screen with no crumb of its own, so it had no way back to
    // either. The header names the role; the crumb names the path.
    const s = read("app/agencies/roles/[roleId]/candidates/[candidateId]/dossier/page.tsx")
    expect(s).toMatch(/className="ag-crumbbar"/)
    expect(s).toMatch(/workflowHref\(roleId\)/)
    expect(s).toMatch(/\/agencies\/roles\/\$\{roleId\}\/candidates\/\$\{candidateId\}/)
    expect(s).toMatch(/<b>Dossier<\/b>/)
  })

  it("the dossier crumb survives a dossier that will not load", () => {
    // The crumb is built from the route params, never from the payload: a
    // failed load is exactly when being stranded costs something, and the
    // labels degrade to "Role" / "Candidate" rather than the links vanishing.
    const s = read("app/agencies/roles/[roleId]/candidates/[candidateId]/dossier/page.tsx")
    const crumb = s.slice(s.indexOf('className="ag-crumbbar"'), s.indexOf("<b>Dossier</b>"))
    expect(crumb).toMatch(/d\?\.role\.ref \|\| "Role"/)
    expect(crumb).toMatch(/d\?\.candidate\.ref \|\| "Candidate"/)
    // Not wrapped in a truthiness gate on the payload.
    expect(crumb).not.toMatch(/\{d && /)
  })

  it("the seven steps render only where they are still the work", () => {
    // On Interviews, Close-out and the dossier the steps describe work that
    // is finished. They have never rendered there and must not start.
    const FLOW = [
      "app/agencies/roles/[roleId]/page.tsx",
      "app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx",
    ]
    for (const path of ROLE_SCREENS) {
      const s = tsCode(read(path))
      const hasSteps = /ag-rail-label">Shortlist workflow</.test(s)
      expect(hasSteps, `${path} steps present`).toBe(FLOW.includes(path))
    }
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
    // RoleRail was the third way in and is gone. What is left is the page's
    // own helper (candidate detail's step rail) or the header's phase rail,
    // whose shortlist chip is phaseHref -> workflowHref — pinned by value in
    // agency-phases.test.ts, so the chain holds end to end.
    if (!isWorkflow) expect(/workflowHref\(|<RoleHeader /.test(screen(path)), `${path} has no way into the workflow`).toBe(true)
  })

  it("the dashboard has no expanding sections at all (10 Sep 2026)", () => {
    // It used to nest four scroll anchors under its own nav item, which
    // opened four more bands. For MVP the dashboard is live roles and
    // nothing else, so there is nothing to expand into.
    const s = read("app/agencies/page.tsx")
    expect(s).toMatch(/<AgencyNav current="today" \/>/)
    expect(s).not.toMatch(/sections=\{\[/)
    expect(s).not.toMatch(/onSection=/)
  })

  it("the dashboard renders one band, and it is the roles", () => {
    // Comments stripped: the removed band names survive in the note that
    // explains why they went, and a scan of raw source would match those.
    const s = tsCode(read("app/agencies/page.tsx"))
    const bands = [...s.matchAll(/className="agd-eyebrow"/g)]
    expect(bands).toHaveLength(1)
    expect(s).toMatch(/id="agd-roles-h">Live roles</)
    for (const gone of ["Also needs you", "Briefs from your clients", ">Queue<", ">Desk health<"]) {
      expect(s, gone).not.toContain(gone)
    }
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

  it("the role scope is a way up, and nothing from the desk", () => {
    const roleScope = nav.slice(nav.indexOf("if (inRole)"), nav.indexOf("const groups"))
    expect(roleScope).toMatch(/ag-nav-up/)
    expect(roleScope).toMatch(/UP\.href/)
    // Client access, Audit log, Settings and Notifications are desk-level and
    // have no business on a role screen.
    for (const desk of ["clients", "audit", "settings", "notifications", "today", "candidates"]) {
      expect(roleScope, `${desk} leaked into the role scope`).not.toContain(`"${desk}"`)
    }
  })

  it("the way up needs no data, because the header's does", () => {
    // RoleHeader renders nothing until its facts load and nothing at all if
    // they fail. So the phase rail can be absent — and the way OUT of a role
    // must therefore never sit behind a fetch or a truthiness check.
    const roleScope = nav.slice(nav.indexOf("if (inRole)"), nav.indexOf("const groups"))
    const up = roleScope.slice(roleScope.indexOf("ag-nav-up"))
    expect(up.slice(0, 200)).not.toMatch(/waiting|loading|\?\?/)
  })

  it("the briefs count survives the collapse, on the terms that make it honest", () => {
    // The badge is the only thing that surfaces a brief waiting in ANOTHER of
    // your agencies — four sat unseen for a week. Inside a role it renders
    // only when the count is above zero: the guarantee without a row that
    // mostly says nothing sitting beside a single link up.
    const roleScope = nav.slice(nav.indexOf("if (inRole)"), nav.indexOf("const groups"))
    expect(roleScope).toMatch(/waiting > 0 &&/)
    expect(roleScope).toMatch(/BRIEFS\.href/)
    // One fetch, one component, both scopes — there is no second copy to drift.
    expect([...nav.matchAll(/fetch\("\/api\/agency\/briefs/g)]).toHaveLength(1)
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
