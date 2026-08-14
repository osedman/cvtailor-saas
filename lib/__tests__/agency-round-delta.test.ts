/**
 * The round delta.
 *
 * A pure function, so these are real tests rather than assertions about a
 * mocked query builder. The properties that matter:
 *
 *   1. It never claims a contradiction. Deciding that two statements conflict
 *      is a judgement about meaning, and judgements belong to people — so a
 *      revisited requirement carries BOTH layers and no verdict.
 *   2. A debrief answer is not a strength change. Nobody scored it; a person
 *      wrote it. Dressing that up as CHANGED would invent a transition.
 *   3. Settled requirements stay off the board. Only unproven ones appear as
 *      still open, because a requirement that was answered two rounds ago is
 *      not news about this one.
 */
import { describe, it, expect } from "vitest"
import { deltaForRound } from "../agency/round-delta"
import type { Dossier, Layer, RequirementStrata } from "../agency/dossier"

function layer(over: Partial<Layer>): Layer {
  return {
    kind: "cv",
    label: "CV",
    strength: null,
    quote: null,
    source: "",
    at: null,
    ...over,
  }
}

function req(over: Partial<RequirementStrata>): RequirementStrata {
  return {
    requirementId: over.ref ?? "r1",
    ref: over.ref ?? "R01",
    text: over.text ?? "Kafka at production scale",
    weight: over.weight ?? "must",
    layers: over.layers ?? [],
    current: over.current ?? "missing",
    open: over.open ?? false,
  }
}

function dossier(requirements: RequirementStrata[]): Dossier {
  return {
    candidate: { id: "c", ref: "CAN-02", name: "Amara Okafor" },
    role: { id: "r", ref: "ROL-2402", title: "SDE" },
    requirements,
    rounds: [
      { id: "rd1", number: 1, when: null, status: "completed", artifact: "debrief", decision: null },
      { id: "rd2", number: 2, when: null, status: "completed", artifact: "debrief", decision: "advance" },
    ],
    score: null,
    unknown: { open: 0, total: requirements.length },
    enrichmentPending: true,
  }
}

describe("deltaForRound", () => {
  it("returns null for a round that does not exist", () => {
    expect(deltaForRound(dossier([]), 9)).toBeNull()
  })

  it("counts a requirement the round touched first as ADDED", () => {
    const d = dossier([
      req({ ref: "R11", layers: [layer({ kind: "round", label: "R2", quote: "I carried the pager" })] }),
    ])
    const delta = deltaForRound(d, 2)!
    expect(delta.added.map((a) => a.ref)).toEqual(["R11"])
    expect(delta.added[0].before).toBeNull()
  })

  // The property that keeps the product honest.
  it("shows BOTH layers for a revisited requirement and claims no contradiction", () => {
    const d = dossier([
      req({
        ref: "R07",
        layers: [
          layer({ kind: "cv", label: "CV", quote: "Led a team of 8", strength: "strong" }),
          layer({ kind: "round", label: "R2", quote: "Three of us on the platform side" }),
        ],
      }),
    ])
    const delta = deltaForRound(d, 2)!
    expect(delta.revisited).toHaveLength(1)
    const item = delta.revisited[0]
    expect(item.before?.quote).toBe("Led a team of 8")
    expect(item.now?.quote).toBe("Three of us on the platform side")
    // No verdict anywhere on the item.
    expect(item.lane).toBe("revisited")
    expect(JSON.stringify(item)).not.toMatch(/contradict/i)
  })

  it("does NOT call a debrief answer a strength change", () => {
    const d = dossier([
      req({
        ref: "R04",
        layers: [
          layer({ kind: "cv", label: "CV", strength: "partial", quote: "Batch pipelines" }),
          // A write-up carries no strength: nobody scored it.
          layer({ kind: "round", label: "R2", strength: null, quote: "Ran the clinical bus" }),
        ],
      }),
    ])
    const delta = deltaForRound(d, 2)!
    expect(delta.changed).toHaveLength(0)
    expect(delta.revisited).toHaveLength(1)
  })

  it("records a real strength transition as CHANGED when both sides have one", () => {
    const d = dossier([
      req({
        ref: "R04",
        layers: [
          layer({ kind: "cv", label: "CV", strength: "partial" }),
          layer({ kind: "round", label: "R2", strength: "strong", quote: "Forty thousand a second" }),
        ],
      }),
    ])
    const delta = deltaForRound(d, 2)!
    expect(delta.changed).toHaveLength(1)
    expect(delta.changed[0].from).toBe("partial")
    expect(delta.changed[0].to).toBe("strong")
  })

  it("only lists STILL OPEN requirements that are genuinely unproven", () => {
    const d = dossier([
      req({ ref: "R10", layers: [], open: true }),
      req({ ref: "R01", layers: [layer({ strength: "strong" })], open: false, current: "strong" }),
    ])
    const delta = deltaForRound(d, 2)!
    expect(delta.stillOpen.map((s) => s.ref)).toEqual(["R10"])
  })

  it("does not attribute an earlier round's work to this one", () => {
    const d = dossier([
      req({
        ref: "R04",
        layers: [layer({ kind: "round", label: "R1", quote: "Said in round one" })],
      }),
    ])
    const r2 = deltaForRound(d, 2)!
    expect(r2.added).toHaveLength(0)
    expect(r2.revisited).toHaveLength(0)
    expect(r2.empty).toBe(true)

    const r1 = deltaForRound(d, 1)!
    expect(r1.added.map((a) => a.ref)).toEqual(["R04"])
  })

  it("treats an earlier round as 'before' for a later one", () => {
    const d = dossier([
      req({
        ref: "R04",
        layers: [
          layer({ kind: "round", label: "R1", quote: "First answer" }),
          layer({ kind: "round", label: "R2", quote: "Second answer" }),
        ],
      }),
    ])
    const delta = deltaForRound(d, 2)!
    expect(delta.revisited).toHaveLength(1)
    expect(delta.revisited[0].before?.quote).toBe("First answer")
  })

  it("says plainly when a round produced nothing", () => {
    const d = dossier([req({ ref: "R01", layers: [layer({ strength: "strong" })], current: "strong" })])
    expect(deltaForRound(d, 2)!.empty).toBe(true)
  })

  it("carries the round's own decision through", () => {
    const delta = deltaForRound(dossier([]), 2)!
    expect(delta.decision).toBe("advance")
  })
})
