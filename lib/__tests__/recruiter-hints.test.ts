/**
 * Hints on the recruiter's numbers — Figma board 35, approved 30 Sep 2026.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { RECRUITER_HINTS, adjustedHint } from "@/components/agency/hint"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const PAGE = "app/agencies/roles/[roleId]/page.tsx"
const DETAIL = "components/agency/candidate-detail.tsx"

describe("one score block, hinted, on every recruiter screen", () => {
  it("screening, compare and candidate detail draw the shared parts", () => {
    const page = read(PAGE)
    expect(page.match(/<ScoreBreakdown /g)?.length).toBe(2)
    expect(page.match(/<ConfidenceBars /g)?.length).toBe(2)
    const detail = read(DETAIL)
    expect(detail).toMatch(/<ScoreBreakdown score=\{score\} markWeak \/>/)
    expect(detail).toMatch(/<ConfidenceBars /)
  })

  it("no hand-drawn copy of the block survives", () => {
    for (const f of [PAGE, DETAIL]) {
      const src = read(f)
      expect(src, f).not.toMatch(/Confidence \$\{[^}]+\} of 4/)
      expect(src, f).not.toMatch(/\[1, 2, 3, 4\]\.map/)
      expect(src, f).not.toMatch(/FIT_ROWS|CATEGORY_BARS/)
    }
  })

  it("confidence is three bars — the engine only gives 1 to 3", () => {
    const parts = read("components/agency/score-parts.tsx")
    expect(parts).toMatch(/\[1, 2, 3\]\.map/)
    expect(parts).toMatch(/Math\.min\(3, Math\.max\(1/)
  })

  it("the legend explains each strength", () => {
    const page = read(PAGE)
    for (const k of ["strong", "transferable", "partial", "missing"]) {
      expect(page).toContain(`<StrengthKey strength="${k}"`)
    }
  })
})

describe("the words", () => {
  it("state the real weights", () => {
    expect(RECRUITER_HINTS.fit).toMatch(/45%.*25%.*10%.*10%.*10%/)
  })

  it("explain mechanics and never describe the person", () => {
    for (const [k, v] of Object.entries(RECRUITER_HINTS)) {
      expect(v, k).not.toMatch(/\bconfident\b|strong candidate|talented|impressive|weak candidate/i)
    }
    expect(adjustedHint(82)).toMatch(/from 82/)
  })

  it("a bare hint keeps the value's own classes off the reset button", () => {
    const hint = read("components/agency/hint.tsx")
    expect(hint).toMatch(/className=\{bare \? "ag-hint-bare"/)
    expect(hint).toMatch(/bare && className \? <span className=\{className\}>/)
  })
})
