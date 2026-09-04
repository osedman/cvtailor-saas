/**
 * The workflow page's six panes are derived from the seven steps, in
 * lib/agency/steps.ts, not kept as a second list on the page. Two lists on
 * one page is how step 06 went missing for four days.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { PANE_STEPS, WORKFLOW_STEPS, stepLabel, stepNumber } from "../agency/steps"

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
