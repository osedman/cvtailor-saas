/**
 * The workflow page's panes come from the one step list in
 * lib/agency/steps.ts, not a second list on the page. Two lists on one page
 * is how a step once went missing for four days.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { PANE_STEPS, WORKFLOW_STEPS, SOURCING_STEPS, isSourcingStep, stepLabel, stepNumber } from "../agency/steps"

describe("the step list", () => {
  it("is six steps, every one a pane (candidate detail is a pop-up, not a step)", () => {
    expect(WORKFLOW_STEPS.map((s) => s.key)).toEqual(["intake", "parse", "candidates", "screening", "compare", "submission"])
    expect(PANE_STEPS.map((s) => s.key)).toEqual(WORKFLOW_STEPS.map((s) => s.key))
  })

  it("numbers submission 06 and names the steps in plain words", () => {
    expect(stepNumber("submission")).toBe("06")
    expect(stepLabel("submission")).toBe("Client submission")
    // "Parse review" was jargon a recruiter would not use (UAT, 1 Oct 2026).
    expect(WORKFLOW_STEPS.map((s) => s.label).join(" ")).not.toMatch(/parse/i)
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

  it("no screen keeps its own copy of the sourcing list", () => {
    /*
     * The page used to gate a publish card on isSourcingStep. Ose removed
     * everything below the step content on 19 Sep 2026, so there is nothing
     * left to gate — publishing lives in the matching window.
     *
     * The rule that still matters is the one this suite was really about: a
     * second hand-written list of sourcing steps in a screen is how the first
     * one drifted, so no screen may carry one.
     */
    const page = tsCode(readFileSync(join(process.cwd(), "app/agencies/roles/[roleId]/page.tsx"), "utf8"))
    expect(page).not.toMatch(/\["intake", "parse", "candidates"\]/)
    expect(page).not.toMatch(/step === "intake" \|\| step === "parse"/)
  })
})
