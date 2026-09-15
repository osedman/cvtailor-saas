/**
 * The hiring manager's nav lights the place you are in. Before 3 Sep 2026 it
 * highlighted nothing on /hiring/roles/:id (a door opened from the
 * dashboard) or on the brief form, and the brief form had no nav at all.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

import { tsCode } from "./helpers/source-scan"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Comments stripped: a "no door" guard must not match the comment that
 *  explains why the door was closed. That trap has bitten seven times now. */
const code = (p: string) => tsCode(read(p))

describe("HiringNav", () => {
  const nav = code("components/agency/hm-shared.tsx")
  const fn = nav.slice(nav.indexOf("export function HiringNav"))

  it("keeps the dashboard lit on a role page", () => {
    expect(fn).toMatch(/\["\/hiring\/roles"\]/)
  })

  it("lights Interviews, not Home, on a role's own cohort screen", () => {
    // It lit "Home" while a nav item literally named Interviews pointed
    // somewhere else (found 11 Sep 2026).
    expect(fn).toMatch(/const onCohort = /)
    expect(fn).toMatch(/hiring\\\/roles\\\/\[\^\/\]\+\\\/interviews/)
  })

  /**
   * THE BRIEF DOOR IS CLOSED (15 Sep 2026).
   *
   * This used to assert the opposite — that the nav carried a brief CTA and
   * lit it on the brief form. Wave 5a had already decided the brief was the
   * recruiter's job description and no longer the primary act, but the nav
   * kept its link while the dashboard rendered "Post a brief" as its PRIMARY
   * button. The two surfaces disagreed and the louder one was winning.
   * Opening a role is the recruiter's act now, so both doors are gone and
   * this guard keeps them gone.
   */
  it("carries no door to the brief form", () => {
    expect(fn).not.toMatch(/hiring\/briefs/)
    expect(fn).not.toMatch(/briefOn/)
  })

  it("matches whole path segments, never a prefix of a sibling", () => {
    // "/hiring/interviews" must not light for "/hiring/interviewsX".
    expect(fn).toMatch(/pathname\.startsWith\(`\$\{it\.href\}\/`\)/)
  })
})

describe("the hiring manager cannot start a role", () => {
  /**
   * The ROUTE deliberately survives: deleting it would leave the recruiter's
   * briefs inbox unable to ever receive a new brief, which is a separate
   * decision. What is gone is every door to it from the workspace.
   */
  it("the dashboard offers no way to post one", () => {
    expect(code("app/hiring/page.tsx")).not.toMatch(/hiring\/briefs/)
  })

  it("and does not tell them to do it anyway", () => {
    // The empty state read "Post a brief to start one." — an instruction to
    // press something that no longer exists is worse than no instruction.
    expect(code("app/hiring/page.tsx")).not.toMatch(/Post a brief/)
  })

  it("but the route itself still answers", () => {
    expect(existsSync(join(process.cwd(), "app/hiring/briefs/new/page.tsx"))).toBe(true)
    expect(existsSync(join(process.cwd(), "app/api/hiring/briefs/route.ts"))).toBe(true)
  })
})

describe("every hiring workspace screen renders the nav", () => {
  it.each([
    "app/hiring/page.tsx",
    "app/hiring/interviews/page.tsx",
    "app/hiring/roles/[roleId]/page.tsx",
    "app/hiring/briefs/new/page.tsx",
  ])("%s", (path) => {
    expect(read(path)).toMatch(/<HiringNav \/>/)
  })

  it("the invite doorway does not", () => {
    expect(read("app/hiring/invite/[token]/page.tsx")).not.toMatch(/HiringNav/)
  })
})
