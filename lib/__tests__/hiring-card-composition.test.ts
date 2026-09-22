/**
 * Rules that compose onto `.agd-card` must say which way they run.
 *
 * 20 Sep 2026. `.hm-across-row` declared `display: flex` and relied on the
 * default direction. It composes onto `.agd-card`, which sets
 * `flex-direction: column` — so the row WAS a column, and its children's
 * `flex: 1 1 220px` / `flex: 2 1 280px`, written as column widths, were
 * applied as heights down the main axis. Every row rendered 571px tall with
 * its text stranded in the middle, and the three sections below it — the
 * write-ups owed, the loop, what is coming up — were pushed off the screen.
 *
 * It was reported as "the hiring manager screen needs to be better". It was
 * one missing property. That is the expensive part of this bug class: it
 * reads as a design failure, so the instinct is to redesign the screen rather
 * than to look at the cascade.
 *
 * The guard is narrowed to classes that actually compose onto `.agd-card`, the
 * only ones at risk. A first draft flagged every hm-* flex rule and named 22,
 * 21 of them healthy — but it also found the second real one, `.hm-loop-row`.
 * Verified live in the browser before it was written: the rows
 * measured 571px, and 64px with the one property added.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p))
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const CSS = readFileSync(join(process.cwd(), "app/hiring/hiring.css"), "utf8")

/** Declaration blocks, comments stripped, keyed by their selector. */
function blocks(css: string): Array<{ selector: string; body: string }> {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const out: Array<{ selector: string; body: string }> = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(bare)) !== null) {
    out.push({ selector: m[1].trim(), body: m[2] })
  }
  return out
}

describe("hiring.css flex containers state their direction", () => {
  const all = blocks(CSS)

  it("finds rules to check at all", () => {
    // A scan that matches nothing passes for the wrong reason.
    const flexes = all.filter((b) => /display:\s*flex/.test(b.body))
    expect(flexes.length).toBeGreaterThan(5)
  })

  /**
   * Only the classes that actually compose onto `.agd-card` are at risk, so
   * only those are required to declare a direction. The first draft of this
   * guard flagged every hm-* flex rule and named 22 of them — 21 of which
   * were standalone and perfectly fine. A guard that cries about healthy code
   * gets an `expect.soft` or a deletion within the month.
   *
   * It did, however, find the second real one: `.hm-loop-row`, on the role
   * page, composed the same way and had the same bug with nobody looking at
   * it. So the check earns its place — narrowed, not dropped.
   */
  it("every class composed onto agd-card declares its flex-direction", () => {
    const composed = new Set<string>()
    for (const file of tsxFiles(join(process.cwd(), "app"))) {
      const src = readFileSync(file, "utf8")
      for (const attr of src.match(/className=\{?["`][^"`]*["`]/g) ?? []) {
        if (!attr.includes("agd-card")) continue
        for (const cls of attr.match(/\bhm-[a-z0-9-]+/g) ?? []) composed.add(cls)
      }
    }
    // Frame 23 (22 Sep 2026) rebuilt the hiring places without composing
    // onto agd-card, so the set can legitimately be empty; the rule still
    // applies to anything that composes onto it again.

    const offenders = all
      .filter((b) => [...composed].some((c) => b.selector.includes(`.${c}`)))
      .filter((b) => /display:\s*flex/.test(b.body))
      .filter((b) => !/flex-direction:/.test(b.body))
      .map((b) => b.selector)

    expect(offenders).toEqual([])
  })

  it("the row that caused it runs as a row", () => {
    const row = all.find((b) => b.selector === ".hm-across-row")
    expect(row).toBeDefined()
    expect(row!.body).toMatch(/flex-direction:\s*row/)
  })

  it("agd-card is still the column this depends on", () => {
    // If the card ever stops being a column, the comment above stops being
    // true and the next reader deserves to be told by a failing test rather
    // than by a misleading explanation.
    const agencies = readFileSync(join(process.cwd(), "app/agencies/agencies.css"), "utf8")
    const card = blocks(agencies).find((b) => b.selector === ".agd-card")
    expect(card).toBeDefined()
    expect(card!.body).toMatch(/flex-direction:\s*column/)
  })
})
