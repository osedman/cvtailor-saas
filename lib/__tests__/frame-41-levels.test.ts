/**
 * Frame 41 (approved 9 Oct 2026, Ose; UAT review item 3): a requirement's
 * level is chosen, not cycled; the group lines say what the level really does;
 * and a level change or removal rescores every candidate on the role.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { WEIGHT_MULTIPLIER } from "../agency/strengths"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const PAGE = read("app/agencies/roles/[roleId]/page.tsx")
const ROUTE = read("app/api/agency/requirements/[requirementId]/route.ts")
const RESCORE = read("lib/agency/rescore.ts")

describe("requirement levels (frame 41)", () => {
  it("no click-to-cycle remains", () => {
    expect(PAGE).not.toMatch(/cycleWeight|WEIGHT_ORDER|Click a chip to cycle/)
  })
  it("each requirement is a radio group with the three named levels", () => {
    expect(PAGE).toMatch(/role="radiogroup" aria-label=\{`Level for \$\{req\.ref\}`\}/)
    expect(PAGE).toMatch(/type="radio"[\s\S]{0,500}onChange=\{\(\) => void setWeight\(req, g\.weight\)\}/)
  })
  it("the group lines match the scoring multipliers and never promise a rejection", () => {
    expect(WEIGHT_MULTIPLIER).toEqual({ must: 3, important: 2, nice: 1 })
    expect(PAGE).toContain("Counts 3× toward requirement coverage")
    expect(PAGE).toContain("Counts 2×.")
    expect(PAGE).toContain("Counts 1×, the least.")
    expect(PAGE).not.toMatch(/hard fail|never subtracts/)
  })
  it("a failed save rolls the level back", () => {
    const fn = PAGE.slice(PAGE.indexOf("async function setWeight"), PAGE.indexOf("async function removeRequirement"))
    expect(fn).toMatch(/weight: before/)
  })
  it("a weight change or a removal rescores the whole role", () => {
    expect(RESCORE).toMatch(/export async function rescoreRole\(agencyId: string, roleId: string\)/)
    expect(ROUTE).toMatch(/patch\.weight && requirement\?\.role_id[\s\S]{0,80}rescoreRole\(/)
    expect(ROUTE).toMatch(/const \{ role_id \} = await deleteRequirement[\s\S]{0,160}rescoreRole\(auth\.ctx\.agencyId, role_id\)/)
  })
})
