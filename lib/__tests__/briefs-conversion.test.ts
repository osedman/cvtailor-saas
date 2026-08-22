/**
 * Accepting a brief must carry EVERY field the role inherits.
 *
 * The bug: BRIEF_CONVERSION_COLUMNS omitted `jd_raw`. readOwnBrief selected
 * that list, so composeJdRaw() read `undefined` off the row and composed the
 * role's intake from the structured fields alone. A brief with a
 * 5,108-character JD attached minted a role with an EMPTY intake box — no
 * error, no warning, the JD simply gone. `interview_rounds` and
 * `start_target` were missing the same way.
 *
 * TypeScript cannot catch it: the row is Record<string, unknown>, so an
 * absent key is `undefined`, not a type error. Nor can a mocked test — the
 * fake returns whatever object the test wrote, columns list ignored.
 *
 * So this derives the requirement from the code itself: every `brief.X` the
 * conversion reads must appear in the SELECT list. A new inherited column
 * fails here until it is added, which is the only version of this check that
 * survives the next person adding a field.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const source = readFileSync(join(process.cwd(), "lib/agency/briefs.ts"), "utf8")

function conversionColumns(): string[] {
  const decl = source.slice(source.indexOf("const BRIEF_CONVERSION_COLUMNS"))
  const literal = decl.slice(decl.indexOf('"') + 1, decl.indexOf('"', decl.indexOf('"') + 1))
  return literal.split(",").map((c) => c.trim()).filter(Boolean)
}

/** Every `brief.<column>` read by acceptBrief and its helpers. */
function columnsRead(): string[] {
  const accept = source.slice(source.indexOf("export async function acceptBrief"))
  const scope = accept.slice(0, accept.indexOf("\nexport async function", 10))
  const compose = source.slice(
    source.indexOf("function composeJdRaw"),
    source.indexOf("function composeJdRaw") + 900
  )
  const reads = [...`${scope}\n${compose}`.matchAll(/\bbrief\.(\w+)/g)].map((m) => m[1])
  return [...new Set(reads)]
}

describe("brief → role conversion", () => {
  const columns = conversionColumns()

  it("selects a believable set of columns", () => {
    expect(columns.length).toBeGreaterThan(10)
    expect(columns).toContain("id")
    expect(columns).toContain("status")
  })

  it("carries the JD — the field whose absence emptied a role's intake", () => {
    expect(columns).toContain("jd_raw")
  })

  it("carries every other field the conversion reads", () => {
    const missing = columnsRead().filter((c) => !columns.includes(c))
    expect(
      missing,
      `acceptBrief reads brief.${missing.join(", brief.")} but BRIEF_CONVERSION_COLUMNS does not select ${missing.length === 1 ? "it" : "them"} — the value arrives as undefined and is silently dropped onto the minted role`
    ).toEqual([])
  })

  it("composeJdRaw leads with the pasted JD, not the structured fields", () => {
    // The JD IS the document; the brief fields are context after it. If this
    // order flips, a parsed role reads the client's summary as the JD.
    const compose = source.slice(source.indexOf("function composeJdRaw"))
    const body = compose.slice(0, compose.indexOf("\n}"))
    const jdAt = body.indexOf("sections.push(jd)")
    const missionAt = body.indexOf('push("Mission"')
    expect(jdAt).toBeGreaterThan(-1)
    expect(jdAt).toBeLessThan(missionAt)
  })
})
