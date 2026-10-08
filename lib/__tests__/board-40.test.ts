/**
 * Board 40 (approved 8 Oct 2026, Ose): the shortlist's three stages (UAT
 * item 19), and a gap answered on the call that can move the score by the
 * recruiter's choice (item 16).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const PAGE = read("app/agencies/roles/[roleId]/page.tsx")
const RAIL = read("components/agency/shortlist-rail.tsx")
const STAGES = read("components/agency/shortlist-stages.tsx")

describe("the shortlist's three stages (item 19)", () => {
  it("names the three stages once, in order", () => {
    expect(STAGES).toMatch(/\["Add people", "Confirm", "Send to client"\]/)
  })
  it("the rail is stage 1 and numbers its confirm; the submission is stage 3", () => {
    expect(RAIL).toMatch(/<ShortlistStages at=\{0\} \/>/)
    expect(RAIL).toContain("2 · Confirm shortlist →")
    expect(PAGE).toMatch(/<ShortlistStages at=\{2\} done=\{alreadySent\} \/>/)
    expect(PAGE).toMatch(/`3 · Send to \$\{/)
  })
  it("only shows where you are — the strip has no buttons", () => {
    expect(STAGES).not.toMatch(/<button|onClick/)
  })
})

describe("a gap answer can move the score (item 16)", () => {
  const row = PAGE.slice(PAGE.indexOf('className="ag-ev-row"') - 1600, PAGE.indexOf('className="ag-ev-row"') + 1600)
  it("is offered only under an answered gap question", () => {
    expect(row).toMatch(/q\.source === "gap" && \(activeAnswers\[q\.id\] \?\? ""\)\.trim\(\)/)
  })
  it("writes the existing attributed override, with the answer as the reason", () => {
    expect(row).toMatch(/setOverride\(active\.id, req\.id, mine === level \? null : level, mine === level \? undefined : reason\)/)
    expect(row).toMatch(/From the screening call: /)
    expect(PAGE).toMatch(/override_reason: reason/)
  })
  it("pre-selects nothing: pressed only reflects an override the recruiter made", () => {
    expect(row).toMatch(/aria-pressed=\{mine === level\}/)
    expect(row).toMatch(/const mine = overrides\[active\.id\]\?\.\[req\.id\] \?\? null/)
  })
  it("an answered gap stays on the call even after it closes the gap", () => {
    expect(PAGE).toMatch(/if \(!\(req\.ref in activeAnswers\) && st !== "missing"/)
  })
  it("never scores the words: the answer text is not sent as a score input", () => {
    expect(row).not.toMatch(/call_answers.*score|score.*call_answers/)
  })
})
