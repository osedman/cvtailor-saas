/**
 * One model, said the same way everywhere.
 *
 * The build shipped with round one self-booked and round two still booked by
 * the recruiter, and with a dozen screens saying the recruiter books —
 * found in the 11 Sep 2026 audit. Nothing about that was broken code; it was
 * the product telling two stories. These scans keep the one story.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const ROOT = process.cwd()
const read = (p: string) => tsCode(readFileSync(join(ROOT, p), "utf8"))

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel)
  }
  return out
}

describe("every round is self-booked, not just the first", () => {
  it("an invitation is blocked by an OPEN round, never by a finished one", () => {
    // `live` (not cancelled) meant a completed round blocked the next
    // invitation, so round two silently fell back to the recruiter.
    const src = read("lib/agency/cohort.ts")
    expect(src).toMatch(/const open = \(existing \?\? \[\]\)\.find\(\(r\) => r\.status === "scheduled"\)/)
    expect(src).not.toMatch(/find\(\(r\) => r\.status !== "cancelled"\)/)
  })

  it("the reserve counts open rounds, so an advanced candidate is due another invitation", () => {
    const src = read("lib/agency/waves.ts")
    expect(src).toMatch(/rounds \?\? \[\]\)\.filter\(\(r\) => r\.status === "scheduled"\)/)
  })

  it("the ladder never tells either hat that the recruiter books a round", () => {
    const src = read("lib/agency/next-action.ts")
    expect(src).toMatch(/ROUND \$\{nextRound\} GOING OUT/)
    expect(src).not.toMatch(/Book round \$\{/)
    expect(src).not.toMatch(/recruiter is booking/)
  })
})

describe("no screen still says the recruiter books", () => {
  const surfaces = [...walk("app/agencies"), ...walk("app/hiring"), "components/agency/hm-shared.tsx"]

  it.each([
    /recruiter books/i,
    /you book who meets/i,
    /recruiter will book/i,
    /your recruiter is booking/i,
  ])("no surface matches %s", (pattern) => {
    const offenders = surfaces.filter((p) => pattern.test(read(p)))
    expect(offenders, offenders.join(", ")).toEqual([])
  })

  it("booking on somebody's behalf survives, but only as the stated exception", () => {
    const src = read("app/agencies/roles/[roleId]/interviews/page.tsx")
    // Folded away and labelled, rather than presented as the flow.
    expect(src).toMatch(/className="ag-fallback"/)
    expect(src).toMatch(/Book somebody in yourself/)
    expect(src).toMatch(/cannot use their own link/)
  })
})

describe("the hiring manager's screens count honestly", () => {
  it("an invitation with no time is not an interview coming up", () => {
    // It rendered as "No time set · Scheduled" under "Coming up".
    const src = read("app/hiring/interviews/page.tsx")
    expect(src).toMatch(/r\.status === "scheduled" && r\.scheduled_at/)
    expect(src).toMatch(/stillChoosing/)
  })

  it("windows are offered from the role, where the rules apply", () => {
    // Offering them here attached them to no role, so they obeyed no rule.
    const src = read("app/hiring/interviews/page.tsx")
    expect(src).not.toMatch(/<OfferTimes/)
    expect(read("components/agency/hm-shared.tsx")).not.toMatch(/export function OfferTimes/)
  })
})

describe("no role screen is a dead end", () => {
  it.each([
    "app/agencies/roles/[roleId]/page.tsx",
    "app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx",
    "app/agencies/roles/[roleId]/interviews/page.tsx",
    "app/agencies/roles/[roleId]/close-out/page.tsx",
  ])("%s can reach the role's other phases", (p) => {
    expect(read(p)).toMatch(/<RoleRail/)
  })

  it("the step rail never claims progress the page cannot know about", () => {
    const src = read("app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx")
    expect(src).not.toMatch(/st\.key !== "detail" && st\.key !== "submission" \? "✓"/)
  })
})
