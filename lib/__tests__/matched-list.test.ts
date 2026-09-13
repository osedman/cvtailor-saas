/**
 * "Matched on Tailr" — the one screen where a person arrives from the
 * consumer app rather than from a CV a recruiter uploaded.
 *
 * It shipped as a stack of .ag-check-row, the handover checklist's row,
 * where the band, the state and every piece of evidence were the same
 * neutral .ag-pill — and the only thing separating evidence from its absence
 * was `opacity: 0.55` set inline. "Strong match" and "R3 · missing" were the
 * same object. Ose asked for cards on 13 Sep 2026; what is pinned here is
 * the part that is a product promise rather than a preference.
 *
 * Comments are stripped before every scan: the notes in these files name the
 * strings being scanned for.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const PAGE = "app/agencies/roles/[roleId]/page.tsx"
const CSS = readFileSync(join(process.cwd(), "app/agencies/agencies.css"), "utf8")

const page = read(PAGE)
const cardBlock = page.slice(page.indexOf("ag-matched-grid"), page.indexOf("ag-matched-foot"))

describe("the matched list is cards", () => {
  it("renders a grid of cards, not checklist rows", () => {
    expect(page).toMatch(/className="ag-matched-grid"/)
    expect(page).toMatch(/<article key=\{p\.recommendationId\} className="ag-matched-card">/)
    // The borrowed handover-checklist row must not come back for these.
    expect(cardBlock).not.toMatch(/ag-check-row/)
  })

  it("gives the person an avatar, like every other person in the product", () => {
    expect(cardBlock).toMatch(/ag-avatar/)
    expect(cardBlock).toMatch(/initials\(p\.name\)/)
  })

  it("pins the action strip to the bottom edge so cards in a row line up", () => {
    expect(CSS).toMatch(/\.ag-matched-body \{[^}]*flex: 1;/)
    expect(CSS).toMatch(/\.ag-matched-foot \{[^}]*margin-top: auto;/)
    // auto-fit, so it drops to two then one without a breakpoint of its own.
    expect(CSS).toMatch(/\.ag-matched-grid \{[^}]*repeat\(auto-fit, minmax\(/)
  })
})

describe("MISSING is drawn as an absence, never as faded evidence", () => {
  it("no evidence chip is dimmed", () => {
    // The original bug, exactly: style={{ opacity: 0.55 }} on a missing pill.
    expect(cardBlock).not.toMatch(/opacity/)
  })

  it("carries the strength mark the rest of the product uses", () => {
    expect(cardBlock).toMatch(/className=\{`ag-dot \$\{e\.strength\}`\}/)
    expect(cardBlock).toMatch(/className=\{`ag-ev \$\{e\.strength\}`\}/)
  })

  it("the missing chip is dashed and at full opacity", () => {
    const rule = CSS.slice(CSS.indexOf(".ag-ev.missing"))
    expect(rule.slice(0, 120)).toMatch(/border-style: dashed/)
    expect(rule.slice(0, 120)).not.toMatch(/opacity/)
    // .ag-dot.missing — the dashed empty ring — already existed for this.
    expect(CSS).toMatch(/\.ag-dot\.missing \{[^}]*dashed/)
  })

  it("still says MISSING in words, not only in a colour", () => {
    expect(cardBlock).toMatch(/\{e\.requirement_ref\} \{e\.strength\}/)
    expect(cardBlock).toMatch(/MISSING — no evidence for this requirement/)
  })
})

describe("a band, never a number", () => {
  it("the card shows the band and nothing finer", () => {
    expect(cardBlock).toMatch(/\{p\.band\}/)
    expect(cardBlock).toMatch(/p\.band === "very strong" \? "hi"/)
    expect(cardBlock).not.toMatch(/p\.score|Math\.round\(p\./)
  })

  it("the payload does not carry a score to the browser at all", () => {
    // The wall is in the projection, not in the rendering: "#1, #2, #3"
    // implies a precision the score does not have.
    const lib = read("lib/agency/matched-people.ts")
    const iface = lib.slice(lib.indexOf("export interface MatchedPerson"), lib.indexOf("export interface MatchedList"))
    expect(iface).toMatch(/band: MatchBand/)
    expect(iface).not.toMatch(/\bscore\b/)
  })
})
