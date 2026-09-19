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
/*
 * MOVED 19 Sep 2026 (Figma frame 16). The matched people were rendered on the
 * workflow page AND in the role-level card — one list, two places, two
 * chances to disagree. They now live in the matching window, once.
 *
 * Every promise below is unchanged; only the file is. The move is also what
 * this suite caught: the first version of the window dropped the avatar, the
 * band class and the MISSING-in-words title, which is exactly the silent
 * feature loss it was written to prevent.
 */
const PAGE = "components/agency/matching-window.tsx"
const CSS = readFileSync(join(process.cwd(), "app/agencies/agencies.css"), "utf8")

const page = read(PAGE)
/* The card is its own memoised component now (19 Sep 2026) and is DEFINED
 * above the grid that renders it, so slicing forward from "ag-matched-grid"
 * caught nothing and every assertion below passed against an empty string —
 * a guard that silently stops guarding. Sliced from the component instead,
 * and the emptiness is asserted against. */
const cardBlock = page.slice(page.indexOf("const MatchedCard"), page.indexOf("export function MatchingWindow"))

describe("the matched list is cards", () => {
  it("the scanned block is not empty", () => {
    // Everything below asserts against this slice. If the markup moves again
    // the slice collapses and the suite passes while guarding nothing.
    expect(cardBlock.length).toBeGreaterThan(400)
    expect(cardBlock).toMatch(/ag-matched-card/)
  })

  it("lives in exactly one place", () => {
    // Two renderings of one list is how they drift.
    const workflow = read("app/agencies/roles/[roleId]/page.tsx")
    expect(workflow).not.toMatch(/ag-matched-grid|ag-matched-card/)
    expect(workflow).toMatch(/<MatchingWindow/)
  })

  it("renders a grid of cards, not checklist rows", () => {
    expect(page).toMatch(/className="ag-matched-grid"/)
    expect(cardBlock).toMatch(/<article className="ag-matched-card">/)
    // Memoised: these arrive live, and one invite must not re-render the row.
    expect(page).toMatch(/const MatchedCard = memo\(/)
    expect(page).toMatch(/key=\{p\.recommendationId\}/)
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
    /* Flex wrap with a fixed basis, not a grid. A grid stretches its tracks,
     * so four people became four quarter-width cards on a wide window and the
     * card stopped having a shape. auto-fit was worse still: one person
     * stretched edge to edge. A basis that wraps keeps every card identical
     * whether there are two or twelve, which is what makes them comparable. */
    expect(CSS).toMatch(/\.ag-matched-grid \{[^}]*flex-wrap: wrap/)
    expect(CSS).not.toMatch(/\.ag-matched-grid \{[^}]*auto-fit/)
    expect(CSS).toMatch(/\.ag-matched-card \{[\s\S]{0,700}flex: 0 1 256px/)
    // A long row is cheap to skip, and the reserved size stops it jumping as
    // people stream in from a scan.
    expect(CSS).toMatch(/\.ag-matched-card \{[\s\S]{0,700}content-visibility: auto/)
    expect(CSS).toMatch(/contain-intrinsic-size/)
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

describe("matching is switched on in exactly one place", () => {
  /*
   * 19 Sep 2026. The threshold and the publish button existed TWICE — on the
   * role-level card and again inside step 03 — so there were two ways to turn
   * one thing on and two inputs that could disagree about what the minimum
   * was. Both moved into the window, where the switch and the result it
   * produces are finally on screen together.
   */
  const workflow = read("app/agencies/roles/[roleId]/page.tsx")
  const win = read("components/agency/matching-window.tsx")

  it("the workflow screen carries no threshold input", () => {
    expect(workflow).not.toMatch(/ag-min-score|scan-min-score/)
    expect(win).toMatch(/id="ag-min-score"/)
  })

  it("the workflow screen never publishes directly", () => {
    // setMatchingEnabled is still DEFINED there — it owns the fetch — but the
    // only thing that calls it is the window, through onPublish.
    expect(workflow).not.toMatch(/onClick=\{\(\) => void setMatchingEnabled/)
    expect(workflow).toMatch(/onPublish=\{setMatchingEnabled\}/)
  })

  it("the cards are doors", () => {
    expect(workflow).toMatch(/onClick=\{\(\) => setMatchWindow\(true\)\}/)
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
