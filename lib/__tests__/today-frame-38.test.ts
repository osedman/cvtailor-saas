/**
 * Today, frame 38 (approved 5 Oct 2026, Ose): one typeface, one list of live
 * roles with the ones that need you first, a quieter step bar in the
 * workflow's own words, and no "waiting on others" anywhere.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const PAGE = tsCode(readFileSync(join(process.cwd(), "app/agencies/page.tsx"), "utf8"))
const CSS = readFileSync(join(process.cwd(), "app/agencies/agencies.css"), "utf8")
const BLOCK = CSS.slice(CSS.indexOf("Today, frame 38"))

describe("Today (frame 38)", () => {
  it("has no 'waiting on' group, label or column", () => {
    expect(PAGE).not.toMatch(/Waiting on others/i)
    expect(PAGE).not.toMatch(/waitingOn/)
  })

  it("is one list: roles that need you first, then the longest-standing", () => {
    expect(PAGE).toMatch(/const rank = \(r: TodayRow\) => \(r\.next\.mode === "act" \? 0 : 1\)/)
    expect(PAGE).toMatch(/rank\(a\) - rank\(b\) \|\| \(a\.next\.since \?\? "~"\)\.localeCompare\(b\.next\.since \?\? "~"\)/)
    expect([...PAGE.matchAll(/className="agt-list"/g)]).toHaveLength(1)
  })

  it("names the step in the workflow's own words, not the retired ones", () => {
    expect(PAGE).toMatch(/WORKFLOW_STEPS\[n - 1\]\.label/)
    expect(PAGE).not.toMatch(/"Intake", "Parse", "Add", "Calls"/)
  })

  it("keeps the plain copy", () => {
    expect(PAGE).not.toMatch(/before you log off|A rare sight|Everything else is running/)
    expect(PAGE).toContain("Roles that need you come first, then oldest first.")
  })

  it("the row stays one link: the button inside it is a span", () => {
    expect(PAGE).toMatch(/<span className="agt-btn"/)
    expect(PAGE).not.toMatch(/<button className="agt-btn"/)
  })

  it("its stylesheet block pins no fixed-width face", () => {
    expect(BLOCK.length).toBeGreaterThan(1000)
    expect(BLOCK).not.toMatch(/--ag-mono|monospace/)
  })
})
