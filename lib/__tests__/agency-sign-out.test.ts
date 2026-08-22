/**
 * Every agency screen offers a way out.
 *
 * Found in Ose's walk-through, 22 Aug: `signOut()` had existed all along and
 * did exactly the right thing — clears the Supabase session AND the httpOnly
 * agency cookie, so one person's working context does not outlive them in a
 * shared browser — but nothing in /agencies or /hiring ever called it. The
 * only way out was clearing cookies by hand.
 *
 * That matters past tidiness: agency desks are shared, and a recruiter who
 * cannot hand the machine over is a recruiter whose session the next person
 * inherits. It also made the walk-through itself harder than it needed to be
 * — switching hats meant an incognito window.
 *
 * This test derives its requirement from the code rather than a list: every
 * page that renders the agency rail must render the control, so a NEW screen
 * fails until it does.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import path from "path"

function pages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) pages(full, out)
    else if (entry === "page.tsx") out.push(full)
  }
  return out
}

const AGENCY = pages(path.join(process.cwd(), "app/agencies"))

describe("sign out", () => {
  it("finds the agency screens", () => {
    expect(AGENCY.length).toBeGreaterThan(8)
  })

  it("every screen with the rail also offers the way out", () => {
    const offenders: string[] = []
    for (const file of AGENCY) {
      const src = readFileSync(file, "utf8")
      // The rail is the marker: a screen with a sidebar is a screen somebody
      // works in, and every one of those needs an exit. The sign-in page has
      // no rail and is correctly exempt.
      if (!src.includes("ag-sidebar-foot")) continue
      if (!src.includes("<SignOut")) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }
    expect(
      offenders,
      `these agency screens have a rail but no sign out:\n${offenders.join("\n")}`
    ).toEqual([])
  })

  it("the hiring manager's dashboard offers it too, on their own door", () => {
    const hm = readFileSync(path.join(process.cwd(), "app/hiring/page.tsx"), "utf8")
    expect(hm).toContain("<SignOut")
    // A hiring manager is a client, not staff: signing out returns them to the
    // consumer login, not the agency one.
    expect(hm).toMatch(/<SignOut[^>]*door="consumer"/)
  })

  it("clears the agency cookie as well as the session", () => {
    // signOut() alone leaves the httpOnly agency preference behind, which is
    // one account's working context in the next account's browser.
    const provider = readFileSync(path.join(process.cwd(), "components/auth/auth-provider.tsx"), "utf8")
    const fn = provider.slice(provider.indexOf("async function signOut"))
    const body = fn.slice(0, fn.indexOf("\n  }"))
    expect(body).toContain("supabase.auth.signOut()")
    expect(body).toMatch(/\/api\/agency\/session["'][\s\S]*DELETE|DELETE[\s\S]*\/api\/agency\/session/)
  })

  it("confirms before signing out", () => {
    // An accidental sign-out costs a magic-link round trip through an inbox.
    const c = readFileSync(path.join(process.cwd(), "components/agency/sign-out.tsx"), "utf8")
    expect(c).toContain("confirming")
  })
})
