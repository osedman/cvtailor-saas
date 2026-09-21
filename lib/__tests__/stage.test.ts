/**
 * The recruiter-side stage (lib/agency/stage.ts) and the placement form's
 * "did they come through the process" question — decided 21 Sep 2026,
 * Figma frame 21.
 *
 * The fixture is ROL-2417 as it stood on staging: CAN-17 advanced twice,
 * CAN-12 advanced then declined at round 2, CAN-21 declined at round 1 with a
 * cancelled round 2 left over from the wave bug.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { stageOf, suggestedHire, roundTrail, type StageInput } from "@/lib/agency/stage"
import { latestLoopDecision } from "@/lib/agency/placements"
import type { RoundFacts } from "@/lib/agency/next-action"
import { tsCode } from "./helpers/source-scan"

const NOW = new Date("2026-09-21T12:00:00Z")

function round(p: Partial<RoundFacts> & { roundNumber: number }): RoundFacts {
  return {
    candidateRef: "CAN-01",
    status: "completed",
    createdAt: "2026-09-01T09:00:00Z",
    scheduledAt: "2026-09-10T09:00:00Z",
    endsAt: "2026-09-10T09:45:00Z",
    candidateResponse: "confirmed",
    hasDebrief: true,
    decision: null,
    decidedAt: null,
    ...p,
  }
}

function input(rounds: RoundFacts[], p: Partial<StageInput> = {}): StageInput {
  return { shortlisted: true, rounds, plannedRounds: 2, decisionsCompleteAt: null, placement: null, ...p }
}

const can17 = [round({ roundNumber: 1, decision: "advance" }), round({ roundNumber: 2, decision: "advance" })]
const can12 = [round({ roundNumber: 1, decision: "advance" }), round({ roundNumber: 2, decision: "decline" })]
const can21 = [round({ roundNumber: 1, decision: "decline" }), round({ roundNumber: 2, status: "cancelled", hasDebrief: false })]

describe("ROL-2417 reads the way the client decided it", () => {
  it("CAN-17 is taken forward at round 2", () => {
    expect(stageOf(input(can17), NOW)).toMatchObject({ kind: "taken-forward", round: 2, label: "Taken forward at round 2" })
  })
  it("CAN-12 is not advanced at round 2, though round 1 advanced", () => {
    expect(stageOf(input(can12), NOW)).toMatchObject({ kind: "not-advanced", round: 2, label: "Not advanced at round 2" })
  })
  it("CAN-21 is not advanced at round 1, and the cancelled round still shows in the trail", () => {
    const s = stageOf(input(can21), NOW)!
    expect(s).toMatchObject({ kind: "not-advanced", round: 1 })
    expect(s.trail).toEqual([{ round: 1, outcome: "decline" }, { round: 2, outcome: "cancelled" }])
  })
  it("pre-selects CAN-17 and nobody else", () => {
    const stages = [
      { id: "12", stage: stageOf(input(can12), NOW) },
      { id: "17", stage: stageOf(input(can17), NOW) },
      { id: "21", stage: stageOf(input(can21), NOW) },
    ]
    expect(suggestedHire(stages)).toBe("17")
  })
})

describe("the rest of the ladder", () => {
  it("a placement outranks every round", () => {
    expect(stageOf(input(can12, { placement: { status: "started" } }), NOW)).toMatchObject({ kind: "placed", label: "Started" })
  })
  it("an advance with rounds still planned is advanced, not taken forward", () => {
    expect(stageOf(input([can17[0]]), NOW)).toMatchObject({ kind: "advanced", round: 1 })
  })
  it("the client saying they are done makes that advance the final word", () => {
    expect(stageOf(input([can17[0]], { decisionsCompleteAt: "2026-09-18T10:00:00Z" }), NOW)).toMatchObject({ kind: "taken-forward", round: 1 })
  })
  it("a null plan does not read as zero rounds", () => {
    expect(stageOf(input([can17[0]], { plannedRounds: NaN }), NOW)?.kind).toBe("advanced")
  })
  it("hold, awaiting and booked each say so", () => {
    expect(stageOf(input([round({ roundNumber: 1, decision: "hold" })]), NOW)?.kind).toBe("on-hold")
    expect(stageOf(input([round({ roundNumber: 1 })]), NOW)?.kind).toBe("awaiting-client")
    expect(stageOf(input([round({ roundNumber: 1, status: "scheduled", scheduledAt: "2026-10-02T09:00:00Z", endsAt: null })]), NOW)?.kind).toBe("booked")
  })
  it("shortlisted with no rounds is not interviewed; not shortlisted has no stage at all", () => {
    expect(stageOf(input([]), NOW)?.kind).toBe("not-interviewed")
    expect(stageOf(input([], { shortlisted: false }), NOW)).toBeNull()
  })
})

describe("pre-selecting is exactly one, or nothing", () => {
  const fwd = stageOf(input(can17), NOW)
  it("two taken forward pre-selects nobody", () => {
    expect(suggestedHire([{ id: "a", stage: fwd }, { id: "b", stage: fwd }])).toBeNull()
  })
  it("none taken forward pre-selects nobody", () => {
    expect(suggestedHire([{ id: "a", stage: null }])).toBeNull()
  })
})

describe("the trail", () => {
  it("a rebooked round shows the live booking, not the cancelled one", () => {
    const t = roundTrail([
      round({ roundNumber: 1, status: "cancelled" }),
      round({ roundNumber: 1, decision: "advance" }),
    ])
    expect(t).toEqual([{ round: 1, outcome: "advance" }])
  })
})

describe("the placement form asks the client's LATEST word", () => {
  const rounds = [
    { id: "r1", round_number: 1, status: "completed" },
    { id: "r2", round_number: 2, status: "completed" },
  ]
  it("CAN-12: advanced at round 1, declined at round 2, is not an advance", () => {
    expect(
      latestLoopDecision(rounds, [
        { round_id: "r1", decision: "advance", created_at: "2026-09-05T10:00:00Z" },
        { round_id: "r2", decision: "decline", created_at: "2026-09-15T10:00:00Z" },
      ])
    ).toBe("decline")
  })
  it("a changed mind within a round: the newest row wins", () => {
    expect(
      latestLoopDecision(rounds, [
        { round_id: "r2", decision: "decline", created_at: "2026-09-15T10:00:00Z" },
        { round_id: "r2", decision: "advance", created_at: "2026-09-16T10:00:00Z" },
      ])
    ).toBe("advance")
  })
  it("a cancelled round's decision does not count; no decisions is null", () => {
    expect(latestLoopDecision([{ id: "r1", round_number: 1, status: "cancelled" }], [{ round_id: "r1", decision: "advance", created_at: "x" }])).toBeNull()
    expect(latestLoopDecision(rounds, [])).toBeNull()
  })
})

describe("nothing writes back", () => {
  it("the stage modules never write recruiter_reviews or 'reject'", () => {
    for (const f of ["lib/agency/stage.ts", "lib/agency/stages.ts"]) {
      const src = tsCode(readFileSync(join(process.cwd(), f), "utf8"))
      expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/)
      expect(src).not.toMatch(/["']reject["']/)
    }
  })
})
