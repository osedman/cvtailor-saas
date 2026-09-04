/**
 * The hiring manager's nav lights the place you are in. Before 3 Sep 2026 it
 * highlighted nothing on /hiring/roles/:id (a door opened from the
 * dashboard) or on the brief form, and the brief form had no nav at all.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("HiringNav", () => {
  const nav = read("components/agency/hm-shared.tsx")
  const fn = nav.slice(nav.indexOf("export function HiringNav"))

  it("keeps the dashboard lit on a role page", () => {
    expect(fn).toMatch(/also: \["\/hiring\/roles"\]/)
  })

  it("marks the brief CTA current on the brief form", () => {
    expect(fn).toMatch(/pathname\.startsWith\("\/hiring\/briefs"\)/)
    expect(fn).toMatch(/aria-current=\{briefOn \? "page" : undefined\}/)
  })

  it("matches whole path segments, never a prefix of a sibling", () => {
    // "/hiring/interviews" must not light for "/hiring/interviewsX".
    expect(fn).toMatch(/pathname\.startsWith\(`\$\{it\.href\}\/`\)/)
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
