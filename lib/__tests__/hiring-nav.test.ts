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

import { hiringNavFor, showsHiringRail } from "../../components/agency/hm-shared"

/** Which place is lit for a path — the question every assertion below asks. */
const lit = (path: string) => hiringNavFor(path).find((i) => i.on)?.label ?? null

describe("HiringNav — which place is lit", () => {
  /*
   * BEHAVIOURAL, NOT A SOURCE SCAN. This suite used to assert the literal
   * `["/hiring/roles"]` appeared in the component. When /hiring/roles became
   * its own place that string changed and the test failed while the
   * behaviour was right — a proxy breaking on a safe change. The rules are
   * now a pure function and these run against real paths.
   */
  it("lights exactly one place, on every workspace path", () => {
    for (const path of [
      "/hiring",
      "/hiring/roles",
      "/hiring/roles/abc",
      "/hiring/roles/abc/interviews",
      "/hiring/shortlist",
      "/hiring/interviews",
      "/hiring/decisions",
    ]) {
      expect(hiringNavFor(path).filter((i) => i.on)).toHaveLength(1)
    }
  })

  it("lights each place on its own path", () => {
    expect(lit("/hiring")).toBe("Tasks")
    expect(lit("/hiring/roles")).toBe("My roles")
    expect(lit("/hiring/shortlist")).toBe("Shortlist")
    expect(lit("/hiring/interviews")).toBe("Interviews")
    expect(lit("/hiring/decisions")).toBe("Decisions")
  })

  it("keeps Tasks lit on a role page, which is a door out of a task", () => {
    expect(lit("/hiring/roles/abc")).toBe("Tasks")
  })

  it("does NOT light Tasks on My roles", () => {
    // /hiring is a prefix of every path here. A startsWith would light Tasks
    // on all five and My roles would be unreachable-looking.
    expect(lit("/hiring/roles")).not.toBe("Tasks")
  })

  it("lights Interviews, not Tasks, on a role's own cohort screen", () => {
    // It lit "Home" while a nav item literally named Interviews pointed
    // somewhere else (found 11 Sep 2026).
    expect(lit("/hiring/roles/abc/interviews")).toBe("Interviews")
  })

  it("matches whole segments, never a prefix of a sibling", () => {
    expect(lit("/hiring/interviewsX")).not.toBe("Interviews")
    expect(lit("/hiring/rolesX")).not.toBe("My roles")
  })

  it("carries no door to the brief form", () => {
    const nav = code("components/agency/hm-shared.tsx")
    const fn = nav.slice(nav.indexOf("export function hiringNavFor"))
    expect(fn).not.toMatch(/hiring\/briefs/)
    expect(hiringNavFor("/hiring").map((i) => i.href)).not.toContain("/hiring/briefs/new")
  })
})

describe("the hiring manager cannot start a role", () => {
  /**
   * 22 Sep 2026: the whole client-brief flow was removed (Ose) — the form,
   * its API and the recruiter's inbox. Roles are created by the recruiter.
   */
  it("the dashboard offers no way to post one", () => {
    expect(code("app/hiring/page.tsx")).not.toMatch(/hiring\/briefs/)
  })

  it("and does not tell them to do it anyway", () => {
    // The empty state read "Post a brief to start one." — an instruction to
    // press something that no longer exists is worse than no instruction.
    expect(code("app/hiring/page.tsx")).not.toMatch(/Post a brief/)
  })

  it("the dashboard shows no Brief step (22 Sep 2026)", () => {
    const src = code("app/hiring/page.tsx")
    expect(src).not.toMatch(/"Brief agreed/)
    expect(src).not.toMatch(/STEP_LABELS = \["Brief"/)
  })

  it("and the brief form and its API are gone", () => {
    expect(existsSync(join(process.cwd(), "app/hiring/briefs/new/page.tsx"))).toBe(false)
    expect(existsSync(join(process.cwd(), "app/api/hiring/briefs/route.ts"))).toBe(false)
  })
})

describe("the rail lives in the shell, not in every page", () => {
  /*
   * This suite used to assert `<HiringNav />` appeared in each of seven page
   * files. That was the right rule protected the wrong way, and the wrong way
   * is what let the first build of the five places ship as a horizontal strip
   * inside <main>: adding chrome to a page was easier than adding it to the
   * shell, and nothing objected.
   *
   * The rail is mounted once in app/hiring/layout.tsx now, so the guard is
   * that the layout mounts it and that no page re-renders its own.
   */
  it("the layout mounts the rail", () => {
    expect(read("app/hiring/layout.tsx")).toMatch(/<HiringSidebar \/>/)
  })

  it("no page renders nav chrome of its own", () => {
    for (const path of [
      "app/hiring/page.tsx",
      "app/hiring/roles/page.tsx",
      "app/hiring/shortlist/page.tsx",
      "app/hiring/decisions/page.tsx",
      "app/hiring/interviews/page.tsx",
      "app/hiring/roles/[roleId]/page.tsx",
      "app/hiring/roles/[roleId]/interviews/page.tsx",
    ]) {
      expect(code(path)).not.toMatch(/<HiringNav \/>|<HiringSidebar \/>/)
    }
  })

  it("the retired strip is gone from the component and the stylesheet", () => {
    // Same words in two places is how the rail and the strip would drift.
    expect(code("components/agency/hm-shared.tsx")).not.toMatch(/export function HiringNav\b/)
    expect(read("app/hiring/hiring.css")).not.toMatch(/^\.hm-nav \{/m)
  })

  it("the invite doorway gets no rail", () => {
    // A doorway is not the workspace: five places somebody cannot reach yet
    // is five dead links.
    expect(showsHiringRail("/hiring/invite/abc123")).toBe(false)
    expect(showsHiringRail("/hiring/invite")).toBe(false)
  })

  it("every workspace path does get one", () => {
    for (const path of [
      "/hiring",
      "/hiring/roles",
      "/hiring/roles/abc",
      "/hiring/shortlist",
      "/hiring/interviews",
      "/hiring/decisions",
    ]) {
      expect(showsHiringRail(path)).toBe(true)
    }
  })
})
