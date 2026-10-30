/**
 * The interview loop rail: a distribution, never a position.
 *
 * Built 15 September 2026 after Ose, walking staging: "I'm sending out the
 * interview invites and I don't know where I am in the process."
 *
 * THE MISTAKE THIS GUARDS AGAINST is the obvious fix. Every design reference
 * answers "multi-step process" with a stepper — "Step 2 of 4", one marker on
 * one rung — and it is wrong here in a way that would look right in review. A
 * cohort is not at a stage: four people sit on four rungs at once, and any
 * single marker has to choose one of them and be wrong about the other three.
 *
 * So these pin the two properties that make it honest: the counts are
 * CUMULATIVE (reached this point, matching cohortSummary's existing
 * convention), and the exits are not rungs.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { loopProgress, type LoopMemberFacts } from "../agency/cohort-status"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const m = (status: LoopMemberFacts["status"], decided = false): LoopMemberFacts => ({ status, decided })

describe("the counts are cumulative", () => {
  it("someone who has been met still counts as booked", () => {
    // The failure this prevents: counting only the CURRENT status makes
    // BOOKED fall to zero as people progress, which reads as going backwards.
    const p = loopProgress([m("feedback_due")])
    expect(p.rungs.find((r) => r.key === "booked")!.n).toBe(1)
    expect(p.rungs.find((r) => r.key === "met")!.n).toBe(1)
  })

  it("and someone written up counts at every rung before it", () => {
    const p = loopProgress([m("complete")])
    for (const key of ["invited", "booked", "met", "written_up"]) {
      expect(p.rungs.find((r) => r.key === key)!.n).toBe(1)
    }
  })

  it("never counts backwards along the rail", () => {
    const p = loopProgress([m("awaiting"), m("booked"), m("feedback_due"), m("complete", true)])
    const ns = p.rungs.map((r) => r.n)
    expect(ns).toEqual([...ns].sort((a, b) => b - a))
    expect(ns[0]).toBe(4)
  })

  it("matches the existing cohortSummary convention for 'booked'", () => {
    // cohortSummary counts booked as booked + feedback_due + complete. The
    // rail must not invent a second, quieter definition of the same word.
    const p = loopProgress([m("booked"), m("feedback_due"), m("complete")])
    expect(p.rungs.find((r) => r.key === "booked")!.n).toBe(3)
  })
})

describe("an exit is not a rung", () => {
  it("someone who found no suitable time is counted apart, not as invited", () => {
    // Folding them into "invited" would quietly inflate every number after
    // it — they did not get less far, they left.
    const p = loopProgress([m("awaiting"), m("no_suitable_time")])
    expect(p.noSuitableTime).toBe(1)
    expect(p.rungs.find((r) => r.key === "invited")!.n).toBe(1)
    expect(p.total).toBe(1)
  })

  it("and neither is a cancellation", () => {
    const p = loopProgress([m("booked"), m("cancelled")])
    expect(p.cancelled).toBe(1)
    expect(p.total).toBe(1)
  })

  it("decided only counts a round that actually was", () => {
    expect(loopProgress([m("complete", false)]).rungs.find((r) => r.key === "decided")!.n).toBe(0)
    expect(loopProgress([m("complete", true)]).rungs.find((r) => r.key === "decided")!.n).toBe(1)
  })
})

describe("it can be read aloud", () => {
  it("says the distribution in words, because a row of numbers cannot be", () => {
    const p = loopProgress([m("booked"), m("complete", true)])
    expect(p.summary).toMatch(/2 of 2 invited/)
    expect(p.summary).toMatch(/1 of 2 written up/)
  })

  it("and says so plainly when nobody has been invited", () => {
    expect(loopProgress([]).summary).toBe("Nobody has been invited yet.")
  })
})

describe("the rail is a readout, not a control", () => {
  const rail = read("components/agency/loop-rail.tsx")
  const css = readFileSync(join(process.cwd(), "app/hiring/hiring.css"), "utf8")

  it("nothing in it is clickable", () => {
    // It must not look interactive either — a readout that invites a click
    // and does nothing is the dead-control failure again.
    expect(rail).not.toMatch(/onClick|<button|<a /)
    const rung = css.match(/^\.hm-loop-rung \{[^}]*\}/m)?.[0] ?? ""
    expect(rung).not.toBe("")
    expect(rung).not.toMatch(/cursor:\s*pointer/)
  })

  it("the reader's own rung is not marked by colour alone", () => {
    // The word and the caret are the cue that survives not being able to
    // separate two browns. Same rule that put STRONG 1.0 on the evidence row.
    expect(rail).toMatch(/yours<\/span>|↑ yours/)
    expect(rail).toMatch(/data-yours=\{isYours\}/)
  })

  it("counts use tabular figures so the rail cannot twitch", () => {
    expect(css).toMatch(/\.hm-loop-n \{[^}]*font-variant-numeric:\s*tabular-nums/)
  })

  it("the numbers are hidden from assistive tech, and the sentence is not", () => {
    // Announced individually they are "4 1 2 1 0", which is noise.
    expect(rail).toMatch(/aria-hidden="true"/)
    expect(rail).toMatch(/ag-sr-only/)
  })

  it("does not fake a single position", () => {
    // The stepper words. If one of these shows up, somebody has reached for
    // the pattern this rail exists to refuse.
    expect(rail).not.toMatch(/\bstep \d|currentStep|activeStep|Step \d of/i)
  })
})
