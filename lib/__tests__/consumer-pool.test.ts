/**
 * The pool a recruiter may read.
 *
 * Ose widened the rule on 19 Sep 2026: show the consumer pool with career
 * arcs and metrics, so an agent can spot somebody mid-switch rather than only
 * the people a scan already accepted. What did NOT widen is who may appear.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const lib = tsCode(readFileSync(join(process.cwd(), "lib/agency/consumer-pool.ts"), "utf8"))

describe("who may appear in the pool", () => {
  it("requires BOTH opt-ins", () => {
    // recruiter_visibility alone is not enough: `discoverable` is the switch
    // that says "show me to a recruiter when a role matches".
    expect(lib).toMatch(/\.eq\("discoverable", true\)/)
    expect(lib).toMatch(/\.eq\("recruiter_visibility", true\)/)
  })

  it("never reads the person's private roadmap", () => {
    // career_roadmaps is their own view of their weaknesses. The snapshot
    // function refuses to touch it and so must this.
    expect(lib).not.toMatch(/career_roadmaps|career_roadmap_items/)
  })

  it("honours the person's hidden flag on their evidence", () => {
    expect(lib).toMatch(/career_evidence[\s\S]{0,300}\.eq\("hidden", false\)/)
  })

  it("does not read first CVs, subscriptions or usage logs", () => {
    for (const table of ["first_cvs", "cv_evidence_items", "subscriptions", "usage_logs"]) {
      expect(lib).not.toMatch(new RegExp(`"${table}"`))
    }
  })
})

describe("relevance is a reading aid, not a judgement", () => {
  it("is deterministic — no model call in this path", () => {
    expect(lib).not.toMatch(/anthropic|messages\.create|openai/i)
  })

  it("filters nobody out by score", () => {
    // Every opted-in person is returned; the number only orders the list.
    expect(lib).not.toMatch(/\.filter\([^)]*relevance\s*[<>]/)
    expect(lib).toMatch(/people\.sort/)
  })

  it("marks the switcher rather than hiding them", () => {
    expect(lib).toMatch(/switching:/)
  })
})
