/**
 * The Add-candidates copy states the same cap the server enforces.
 *
 * The cap went from ten to fifty on 14 Sep 2026 and the screen kept saying
 * ten until 24 Sep, when Ose read it. A number in copy that the server
 * decides is a promise made in two places; this pins them together.
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const route = readFileSync("app/api/agency/roles/[roleId]/candidates/route.ts", "utf8")
const page = readFileSync("app/agencies/roles/[roleId]/page.tsx", "utf8")

describe("the candidate cap is said once", () => {
  it("the screen quotes the number the server enforces", () => {
    const cap = route.match(/const MAX_CANDIDATES_PER_ROLE = (\d+)/)?.[1]
    expect(cap).toBeDefined()
    expect(page).toMatch(new RegExp(`up to ${cap} per role`))
    expect(page).not.toMatch(new RegExp(`up to (?!${cap}\\b)\\d+ per role`))
  })
})
