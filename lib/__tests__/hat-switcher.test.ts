/**
 * The two surfaces must be tellable apart, and reachable from each other —
 * but only by someone who genuinely holds both hats.
 *
 * The bug this was written for: the recruiter dashboard and the hiring-manager
 * dashboard are both dark and share the `agd-` chrome, membership is checked
 * first at sign-in, and NOTHING in the recruiter surface linked to /hiring. So
 * a person holding both hats landed on /agencies, believed they were on the
 * client side, clicked a role, and got the recruiter workflow. The routing was
 * correct; the product was unreadable.
 *
 * §5.4.1 had already decided on a "switcher for multi-hat users". It was never
 * built. These tests keep it built, and keep it narrow.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/**
 * Frame 44 (approved 13 Oct 2026, Ose) replaced the home-screen band and the
 * two cross-links with one "Viewing as" switch on every screen of both
 * sides. The rules the band carried still hold, and are pinned here.
 */
describe("the Viewing as switch (frame 44)", () => {
  const sw = read("components/agency/hat-switch.tsx")
  const nav = read("components/agency/agency-nav.tsx")
  const frame = read("components/agency/hm-room.tsx")
  const api = read("app/api/me/hats/route.ts")

  it("renders only for someone who holds BOTH sides", () => {
    expect(sw).toMatch(/if \(!hats \|\| !\(hats\.recruiter && hats\.hiringManager\)\) return <>\{fallback\}<\/>/)
  })

  it("is on every recruiter screen and every client screen", () => {
    // AgencyNav is the shared nav every agency screen renders (agency-nav.test);
    // both of its branches carry the switch. HmFrame wraps every client screen.
    expect(nav.match(/<HatSwitch current="recruiter" \/>/g)?.length).toBe(2)
    expect(frame).toMatch(/<HatSwitch current="hiring" inline fallback=\{<span className="ag-pill hm-role-chip">Hiring manager<\/span>\} \/>/)
  })

  it("a failure hides the switch rather than erroring, and never defaults true", () => {
    // A failed or signed-out ask resolves to NONE (both false) and is never
    // cached — hat-switch-cache.test.ts covers the not-cached half.
    expect(sw).toContain("const NONE: Hats = { recruiter: false, hiringManager: false }")
    expect(sw).toMatch(/if \(!r\.ok\) return NONE/)
    expect(sw).toMatch(/\.catch\(\(\) => NONE\)/)
    expect(api).toMatch(/catch \{[\s\S]*recruiter: false, hiringManager: false/)
  })

  it("the hats route leaks nothing but two booleans", () => {
    const body = api.slice(api.indexOf("async function GET_handler"), api.indexOf("export const GET"))
    expect(body).toMatch(/NextResponse\.json\(\{ recruiter: hats\.recruiter, hiringManager: hats\.hiringManager \}\)/)
    expect(body).not.toMatch(/email|agency_id|contact/i)
  })

  it("the old band and cross-links are gone", () => {
    expect(read("app/hiring/page.tsx")).not.toMatch(/hm-side-band|You are on the client side|Back to your agency/)
    expect(read("app/agencies/page.tsx")).not.toMatch(/Client view →/)
  })

  it("the client side still says the recruiter's working notes are not shown", () => {
    // The band carried this; frame 44 moved it into the one promise.
    expect(frame).toMatch(/recruiter&apos;s working notes are not shown here/)
  })
})

describe("getHatsHeld", () => {
  const lib = read("lib/hat-routing.ts")

  it("resolves both hats without throwing", () => {
    // Chrome must not be able to break a page: every failure path returns
    // "holds neither", which hides the switcher rather than erroring.
    const fn = lib.slice(lib.indexOf("export async function getHatsHeld"))
    expect(fn).toMatch(/catch \{[\s\S]*return none/)
    expect(fn).toMatch(/const none: HatsHeld = \{ recruiter: false, hiringManager: false \}/)
  })

  it("does not include a consumer hat", () => {
    // Everyone has one; it is not what the switcher moves between.
    const iface = lib.slice(lib.indexOf("export interface HatsHeld"))
    expect(iface.slice(0, iface.indexOf("}"))).not.toMatch(/consumer/i)
  })

  it("only reports which doors exist, never agency data", () => {
    const fn = lib.slice(lib.indexOf("export async function getHatsHeld"))
    const scope = fn.slice(0, fn.indexOf("\n}"))
    // Selects ids only — a name or an email here would be a leak into chrome.
    expect(scope).not.toMatch(/select\("[^"]*name/)
    expect(scope).not.toMatch(/select\("[^"]*email/)
  })
})
