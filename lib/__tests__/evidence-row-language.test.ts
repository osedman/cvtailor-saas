/**
 * Step 04 and step 06 describe the same four strengths. They must say so in
 * the same words.
 *
 * A recruiter moves between the screening card and the evidence record
 * constantly — since 14 Sep step 06 also opens as a modal over compare, so it
 * is the surface they land on most. On 14 Sep the screening card learned to
 * print "STRONG 1.0" on the control itself and deleted the legend whose
 * numbers it had been duplicating. The evidence record was left saying the
 * same thing in a bare 8px circle, with its own hardcoded copy of the same
 * four weights sitting in a legend above the list.
 *
 * These guards are about the LANGUAGE, not the shape. The row must stay a
 * row — nine stacked cards would destroy the one thing a reading surface is
 * for, which is seeing the whole map at once — and there is a guard below for
 * that too.
 *
 * Every assertion here was probe-mutated before it was committed: the
 * regression was introduced deliberately and the test watched to fail. Two
 * pins shipped this week that could not fail, and this repo has paid for that
 * six times over.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode, screenSource } from "./helpers/source-scan"

const PAGE = "app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx"
/** Both files that draw step 06 — the shell and the component. */
const screen = () => tsCode(screenSource(PAGE))
const css = () => readFileSync(join(process.cwd(), "app/agencies/agencies.css"), "utf8")
const strengths = () => tsCode(readFileSync(join(process.cwd(), "lib/agency/strengths.ts"), "utf8"))

describe("strength is never carried by colour alone", () => {
  it("the row prints the strength in words, from the shared helper", () => {
    // Not "renders a dot whose class is the strength". The words.
    expect(screen()).toMatch(/strengthLabel\s*\(/)
  })

  it("strengthLabel says the name AND the weight", () => {
    // The helper is what the row trusts, so the helper is what must be
    // pinned: "STRONG 1.0", not "STRONG" and not "1.0".
    const src = strengths()
    expect(src).toMatch(/export function strengthLabel/)
    expect(src).toMatch(/s\.toUpperCase\(\)/)
    expect(src).toMatch(/strengthWeightLabel\(s\)/)
  })

  it("the legend is gone, because every row carries its own", () => {
    // A legend above the list is information that scrolls away from the
    // decision. Step 04 deleted its own on 14 Sep for the same reason.
    expect(screen()).not.toMatch(/ag-legend/)
  })
})

describe("the requirement is readable, and so is the evidence", () => {
  it("the requirement text does not truncate", () => {
    // .ag-evrow-text was `white-space: nowrap; text-overflow: ellipsis` on
    // the one screen whose whole job is reading the record. R02 on ROL-2411
    // is 140 characters. The label you navigate ten rows by must wrap.
    const rule = css().match(/^\.ag-evrow-text \{[^}]*\}/m)?.[0] ?? ""
    expect(rule).not.toBe("")
    expect(rule).not.toMatch(/nowrap/)
    expect(rule).not.toMatch(/text-overflow/)
    expect(rule).not.toMatch(/line-clamp/)
  })

  it("the quote is on the row, not only behind a disclosure", () => {
    // Collapsed it is one clamped line — enough to see that evidence EXISTS
    // for all ten without a click, which is the question a reading surface
    // is actually asked. It is NOT inside the isOpen branch.
    const src = screen()
    const quote = src.slice(src.indexOf("ag-evrow-quote"))
    expect(quote.slice(0, 900)).toMatch(/ag-evrow-said/)
    // The clamp lifts when the row opens rather than the text appearing.
    expect(css()).toMatch(/\.ag-evrow\[data-open="true"\] \.ag-evrow-said \{[^}]*line-clamp: unset/)
  })

  it("more than one quote can be open at once", () => {
    const src = screen()
    // The single-open accordion was `setOpen(isOpen ? null : req.id)`.
    expect(src).not.toMatch(/setOpen\([^)]*\?\s*null\s*:/)
    expect(src).toMatch(/useState<Set<string>>/)
    // Toggling one row must not clear the others.
    expect(src).toMatch(/new Set\(prev\)/)
  })
})

describe("one definition of the weights", () => {
  it("the screen states no weight of its own", () => {
    const src = screen()
    // The old `weightPoints` map and the old legend's 1.0 / 0.7 / 0.4 / 0.0.
    expect(src).not.toMatch(/weightPoints(?!Label)/)
    expect(src).not.toMatch(/\+3\.0|\+2\.0|\+1\.0/)
    expect(src).not.toMatch(/0\.7|0\.4/)
    expect(src).toMatch(/weightPointsLabel\s*\(/)
  })

  it("the multiplier lives where a client component can reach it", () => {
    // It was in scoring.ts, which imports `crypto` — so a client component
    // importing it drags a Node builtin into the browser bundle and fails
    // the build. That is WHY the screen had its own copy.
    expect(strengths()).toMatch(/export const WEIGHT_MULTIPLIER/)
    expect(strengths()).not.toMatch(/^import .*(crypto|next\/headers|agencyAdmin)/m)
  })

  it("nobody restates it", () => {
    // Three copies existed: scoring.ts, prefilter.ts, and the screen's JSX.
    for (const p of ["lib/agency/scoring.ts", "lib/matching/prefilter.ts"]) {
      const src = tsCode(readFileSync(join(process.cwd(), p), "utf8"))
      expect(src).not.toMatch(/const WEIGHT_MULTIPLIER/)
      expect(src).toMatch(/WEIGHT_MULTIPLIER/)
    }
  })
})

describe("what must not regress", () => {
  it("MISSING keeps its copy, whole and in place", () => {
    // Not "the sentence appears somewhere in the file" — a pin shaped that
    // way passed this week while the writer's copy was gutted. This asserts
    // the sentence AROUND the chip, in the order a person reads it.
    const src = screen()
    const start = src.indexOf("No evidence found in the CV for this requirement")
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 400).replace(/\s+/g, " ")
    expect(block).toMatch(
      /No evidence found in the CV for this requirement\. Marked\{" "\}\s*<span className="ag-missing-chip">MISSING<\/span>\. Confirm on the screening call rather than assuming either way\./,
    )
  })

  it("the evidence map is read-only here", () => {
    // Overrides belong to step 04. This screen shows what was decided and
    // who decided it; it must never grow a picker.
    const src = screen()
    expect(src).not.toMatch(/ag-ev-pick/)
    expect(src).not.toMatch(/review_overrides|\/override/)
  })

  it("an override is a sentence, not a chip alone", () => {
    expect(screen()).toMatch(/Tailr read this as \{ev\.strength\}\. You marked it \{strength\}\./)
  })

  it("evidence is indexed once, never scanned inside a row", () => {
    // The performance invariant. `evidenceFor` was evidence.find(...) and
    // ran twice per requirement rendered.
    const src = screen()
    expect(src).not.toMatch(/evidence\.find\s*\(/)
    expect(src).toMatch(/new Map<string, Evidence>\(\)/)
  })

  it("the row is still a row, and taller rows are budgeted for", () => {
    const sheet = css()
    // .ag-mx-row and .ag-ev-card carry this; .ag-evrow did not, and rows
    // are three lines now.
    expect(sheet).toMatch(/\.ag-evrow \{[^}]*content-visibility: auto/)
    // The shape is the deliberate part: a compact row, not a stacked card.
    // If this ever becomes .ag-ev-card the map stops fitting on a screen.
    expect(screen()).toMatch(/className="ag-evrow"/)
  })
})
