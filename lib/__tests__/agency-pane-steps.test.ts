/**
 * The workflow page's six panes are derived from the seven steps, in
 * lib/agency/steps.ts, not kept as a second list on the page. Two lists on
 * one page is how step 06 went missing for four days.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { PANE_STEPS, WORKFLOW_STEPS, SOURCING_STEPS, isSourcingStep, stepLabel, stepNumber } from "../agency/steps"

describe("PANE_STEPS", () => {
  it("is the seven steps minus candidate detail, in order", () => {
    expect(PANE_STEPS.map((s) => s.key)).toEqual(
      WORKFLOW_STEPS.filter((s) => s.key !== "detail").map((s) => s.key)
    )
    expect(PANE_STEPS).toHaveLength(6)
  })

  it("keeps the rail numbering of the full list", () => {
    // Submission is 07 on the rail even though it is the sixth pane.
    expect(stepNumber("submission")).toBe("07")
    expect(stepLabel("submission")).toBe("Client submission")
  })
})

describe("the workflow page", () => {
  const s = readFileSync(join(process.cwd(), "app/agencies/roles/[roleId]/page.tsx"), "utf8")

  it("does not keep its own filtered copy of the steps", () => {
    expect(s).not.toMatch(/WORKFLOW_STEPS\.filter\(/)
    expect(s).toMatch(/PANE_STEPS/)
  })

  it("treats a ?step= deep link as a request for the workflow", () => {
    // The dashboard's "Open the submission" card said step=submission and
    // still bounced to interviews, because only ?flow=shortlist was honoured.
    expect(s).toMatch(/params\.get\("flow"\) === "shortlist" \|\| params\.has\("step"\)/)
  })
})

describe("sourcing stops when judging starts", () => {
  /**
   * "Publish for Tailr matching" is a decision about WHERE CANDIDATES COME
   * FROM. From screening onwards the recruiter is judging the people they
   * already have, so the card leaves (Ose, 14 Sep 2026).
   *
   * The history matters more than the rule. The card once rendered on step
   * 01 ALONE — the only state in which it can say nothing but "Not yet",
   * because publishing needs requirements — so it was invisible everywhere
   * it was usable and the report was "there is no button". The correction
   * put it on every step. Three is the answer to both faults, and these pins
   * exist so neither half comes back.
   */
  it("covers intake, parse and candidates — and nothing after", () => {
    expect([...SOURCING_STEPS]).toEqual(["intake", "parse", "candidates"])
  })

  it("keeps intake, so the capability stays discoverable", () => {
    // Dropping intake is the tempting simplification: the card can only say
    // "Not yet" there. It is also the first screen a recruiter sees.
    expect(isSourcingStep("intake")).toBe(true)
  })

  it("is gone from every judging step", () => {
    for (const step of ["screening", "compare", "submission"] as const) {
      expect(isSourcingStep(step), `${step} still shows the sourcing card`).toBe(false)
    }
  })

  it("every sourcing step is a real pane step", () => {
    const panes = new Set(PANE_STEPS.map((s) => s.key))
    for (const s of SOURCING_STEPS) expect(panes.has(s), `${s} is not a pane`).toBe(true)
  })

  it("the page gates the card on the rule, not on its own copy of the list", () => {
    const page = tsCode(readFileSync(join(process.cwd(), "app/agencies/roles/[roleId]/page.tsx"), "utf8"))
    expect(page).toMatch(/\{role && isSourcingStep\(step\) && \(/)
    // A second list in the page is how the first step list started drifting.
    expect(page).not.toMatch(/\["intake", "parse", "candidates"\]/)
  })
})
