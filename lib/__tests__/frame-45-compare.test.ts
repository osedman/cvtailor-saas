/**
 * Frame 45 (Figma 700:2, approved 19 Oct 2026): compare, said in fewer
 * words. The card shows one score, the must-haves and one gap; the
 * breakdown sits behind the score. Cards and matrix are two views. The
 * decisions bar is in flow, with the undo floating on its own.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const PAGE = read("app/agencies/roles/[roleId]/page.tsx")
const CSS = readFileSync(join(process.cwd(), "app/agencies/agencies.css"), "utf8")
const step = PAGE.slice(PAGE.indexOf('step === "compare" && (() => {'), PAGE.indexOf('step === "submission" && (() => {'))

describe("frame 45 · the compare card", () => {
  const card = step.slice(step.indexOf('className="ag-card ag-cmp-card"'), step.indexOf('{compareTab === "matrix" && ('))
  it("prints one score, the must-haves and the gap — no breakdown, rank or capitals", () => {
    expect(card).toContain("<FitHint score={s} />")
    expect(card).toContain("Must-haves {s.must_have_hit}/{s.must_have_total}")
    expect(card).toContain("Gap: {topRisk.text}")
    expect(card).not.toMatch(/<ScoreBreakdown|<ConfidenceBars|Top risk|#\{rank|ag-avatar/)
    expect(card).toContain("View →")
  })
  it("keeps the one decision control", () => {
    expect(card).toMatch(/<DecisionSlot\s/)
  })
})

describe("frame 45 · the screen", () => {
  it("cards and matrix are two views, remembered, matrix first from six candidates", () => {
    expect(step).toMatch(/onClick=\{\(\) => setCompareTab\("cards"\)\}/)
    expect(PAGE).toContain('candidates.length >= 6 ? "matrix" : "cards"')
    expect(PAGE).toContain('window.localStorage.setItem("ag-cmp-view", t)')
    expect(step).toContain('{compareTab === "cards" && (')
    expect(step).toContain('{compareTab === "matrix" && (')
  })
  it("no legend row and no Requirement matrix title", () => {
    expect(step).not.toContain("ag-legend")
    expect(step).not.toContain("Requirement matrix")
  })
  it("the decisions bar is in flow; keys behind an ⓘ; the undo floats", () => {
    expect(CSS).not.toMatch(/\.ag-decisions-bar \{[^}]*position: sticky/)
    expect(CSS).toMatch(/\.ag-decisions-bar \.ag-undo \{\s*position: fixed;/)
    const bar = step.slice(step.indexOf('className="ag-decisions-bar"'))
    expect(bar).toMatch(/<Hint\s+info\s+className="ag-kbd-hints"/)
    expect(bar).not.toContain(">Decisions<")
  })
})
