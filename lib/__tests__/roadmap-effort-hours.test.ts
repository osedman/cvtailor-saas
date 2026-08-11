import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

/**
 * Regression guard for the enrichment 500 of 6 Aug 2026.
 *
 * effort_estimate_hours is an integer column; models return effortHours as a
 * plain number and emit decimals ("7.5 hours"). Writing one raw made Postgres
 * reject the row and took down the whole enrichment batch, leaving every skill
 * as an empty placeholder with no resources or project brief.
 *
 * These are source assertions rather than DB round-trips because the store's
 * write path is a pure mapping — the bug was a missing coercion, and that is
 * exactly what this pins.
 */
const store = readFileSync(join(__dirname, "../roadmap-store.ts"), "utf-8")

describe("effort hours coercion", () => {
  it("routes effort_estimate_hours through the integer coercion, never raw", () => {
    expect(store).toContain("effort_estimate_hours: toIntHours(")
    expect(store).not.toContain("effort_estimate_hours: item.effortEstimateHours")
  })

  it("rounds rather than truncating or passing decimals through", () => {
    expect(store).toContain("Math.round(n)")
  })

  it("treats missing, zero and non-finite values as no estimate", () => {
    expect(store).toMatch(/if \(value === null \|\| value === undefined\) return null/)
    expect(store).toMatch(/!Number\.isFinite\(n\) \|\| n <= 0/)
  })
})
