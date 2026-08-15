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

describe("the client-side band", () => {
  const page = read("app/hiring/page.tsx")

  it("states whose side of the wall this is", () => {
    expect(page).toMatch(/You are on the client side/)
  })

  it("renders only once the server has confirmed the relationship", () => {
    // Over a signed-out or unlinked screen, a band naming an agency would be
    // asserting a relationship that has not been established.
    const band = page.slice(page.indexOf("hm-side-band") - 400, page.indexOf("hm-side-band") + 200)
    expect(band).toMatch(/screen === "ready"/)
  })

  it("is styled, and survives a narrow screen", () => {
    const css = read("app/hiring/hiring.css")
    expect(css).toMatch(/\.hm-side-band/)
    // Two stacked sticky bars eat a phone screen.
    expect(css).toMatch(/@media \(max-width: 700px\)[\s\S]*hm-side-band[\s\S]*position: static/)
  })
})

describe("the way between the two surfaces", () => {
  const hiring = read("app/hiring/page.tsx")
  const agencies = read("app/agencies/page.tsx")

  it("the hiring side offers a way back only to someone who is also a recruiter", () => {
    expect(hiring).toMatch(/alsoRecruiter && \(/)
    const link = hiring.slice(hiring.indexOf("alsoRecruiter && ("))
    expect(link.slice(0, 260)).toMatch(/href="\/agencies"/)
  })

  it("the recruiter side offers the client view only to someone who is also an HM", () => {
    // A recruiter who is not a client contact anywhere must not be offered a
    // client view — it is not theirs, and offering it would imply it might be.
    expect(agencies).toMatch(/data\?\.also_hiring_manager && \(/)
    const link = agencies.slice(agencies.indexOf("data?.also_hiring_manager && ("))
    expect(link.slice(0, 320)).toMatch(/href="\/hiring"/)
  })

  it("neither flag is defaulted true", () => {
    // Defaulting on would show every recruiter a door into a client workspace.
    expect(hiring).toMatch(/useState\(false\)[\s\S]{0,80}?/)
    expect(hiring).toMatch(/setAlsoRecruiter\(Boolean\(/)
    expect(agencies).toMatch(/also_hiring_manager\?: boolean/)
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
