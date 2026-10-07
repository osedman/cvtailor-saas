/**
 * Board 39 (approved 7 Oct 2026, Ose): explanations open on demand instead of
 * sitting on the page, and the pool loses its monospace labels and its one
 * confusing line.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const ROLE = read("app/agencies/roles/[roleId]/page.tsx")
const RECO = read("components/agency/recommendation-panel.tsx")
const POOL = read("components/agency/matching-window.tsx")
const HINT = read("components/agency/hint.tsx")

describe("explain on demand (board 39)", () => {
  it("'What happens on add' is a hint by the upload, not a card", () => {
    expect(ROLE).not.toMatch(/ag-card-title">What happens on add/)
    expect(ROLE).toMatch(/<Hint info content=\{ADD_EXPLAINED\}>How this works<\/Hint>/)
    for (const line of ["mapped against every requirement", "verbatim quote, or shows MISSING", "No candidate is rejected automatically."])
      expect(ROLE).toContain(line)
  })

  it("the recommendation's three cards fold into one hint", () => {
    expect(RECO).not.toMatch(/ag-reco-reads/)
    expect(RECO).toMatch(/How it works/)
    for (const h of ["What it reads", "What it never reads", "What comes back"]) expect(RECO).toContain(h)
    expect(RECO).toMatch(/\{callsLogged\} of/)
  })

  it("the pool's headings are sentence case, with the notes in hints", () => {
    expect(POOL).not.toMatch(/Who chose to be seen ·|The pool ·/)
    expect(POOL).toMatch(/Chose to be seen <span/)
    expect(POOL).toMatch(/Open to recruiters <span/)
    expect(POOL).not.toMatch(/Not matched by the last scan/)
    expect(POOL).toContain("You can invite them after the next one")
  })

  it("the info hint is still a button with the bubble as its description", () => {
    expect(HINT).toMatch(/info\s*\?\s*"ag-hint-info"/)
    expect(HINT).toMatch(/aria-describedby=\{id\}/)
    expect(HINT).toMatch(/\{content \?\? text\}/)
  })
})
