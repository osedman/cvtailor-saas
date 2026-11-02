import { describe, expect, it } from "vitest"
import {
  computeScore,
  identityHash,
  inputsHash,
  type ScoringInput,
} from "../agency/scoring"

const REQS = [
  { id: "r1", ref: "R01", weight: "must" as const },
  { id: "r2", ref: "R02", weight: "must" as const },
  { id: "r3", ref: "R03", weight: "important" as const },
  { id: "r4", ref: "R04", weight: "nice" as const },
]

function baseInput(): ScoringInput {
  return {
    requirements: REQS,
    evidence: { r1: "strong", r2: "partial", r3: "transferable", r4: "missing" },
    overrides: {},
    baselines: { seniority: 80, contextFit: 70, confidence: 60, confidenceLevel: 2 },
    softSignals: {},
    reviewed: false,
  }
}

describe("computeScore", () => {
  it("computes weighted coverage per the reference math", () => {
    const result = computeScore(baseInput())
    // (1.0*3 + 0.4*3 + 0.7*2 + 0*1) / 9 = 5.6/9
    expect(result.requirement_coverage).toBeCloseTo((5.6 / 9) * 100, 1)
    // 3 of 4 not missing
    expect(result.evidence_strength).toBe(75)
    expect(result.must_have_total).toBe(2)
    expect(result.must_have_hit).toBe(2)
    expect(result.confidence_level).toBe(2)
    expect(result.effective.r4).toBe("missing")
  })

  it("applies overrides over parsed evidence", () => {
    const input = baseInput()
    input.overrides = { r2: "strong", r4: "transferable" }
    const result = computeScore(input)
    // (3 + 3 + 1.4 + 0.7) / 9
    expect(result.requirement_coverage).toBeCloseTo((8.1 / 9) * 100, 1)
    expect(result.evidence_strength).toBe(100)
    expect(result.effective.r2).toBe("strong")
    expect(result.overall).toBeGreaterThan(computeScore(baseInput()).overall)
  })

  it("treats requirements without evidence as missing, never inferred", () => {
    const input = baseInput()
    delete (input.evidence as Record<string, unknown>).r1
    const result = computeScore(input)
    expect(result.effective.r1).toBe("missing")
    expect(result.must_have_hit).toBe(1)
  })

  it("moves context fit by soft signals (motivation ±6, comms ±4 per point)", () => {
    const neutral = computeScore({ ...baseInput(), softSignals: { motivation: 3, communication: 3 } })
    expect(neutral.context_fit).toBe(70)
    const up = computeScore({ ...baseInput(), softSignals: { motivation: 5, communication: 4 } })
    expect(up.context_fit).toBe(70 + 12 + 4)
    const down = computeScore({ ...baseInput(), softSignals: { motivation: 1 } })
    expect(down.context_fit).toBe(70 - 12)
  })

  it("review bumps confidence +12 and confidence level +1 (capped at 4)", () => {
    const reviewed = computeScore({ ...baseInput(), reviewed: true })
    expect(reviewed.confidence_completeness).toBe(72)
    expect(reviewed.confidence_level).toBe(3)
    const maxed = computeScore({
      ...baseInput(),
      reviewed: true,
      baselines: { seniority: 80, contextFit: 70, confidence: 95, confidenceLevel: 4 },
    })
    expect(maxed.confidence_completeness).toBe(100) // clamped
    expect(maxed.confidence_level).toBe(4)
  })

  it("weights categories 45/25/10/10/10 into the overall", () => {
    const r = computeScore(baseInput())
    const expected =
      r.requirement_coverage * 0.45 +
      r.evidence_strength * 0.25 +
      r.seniority_calibration * 0.1 +
      r.context_fit * 0.1 +
      r.confidence_completeness * 0.1
    expect(r.overall).toBeCloseTo(expected, 2)
  })
})

describe("inputsHash", () => {
  it("is stable across key order and requirement order", () => {
    const a = inputsHash(baseInput())
    const shuffled = baseInput()
    shuffled.requirements = [...REQS].reverse()
    shuffled.evidence = { r4: "missing", r3: "transferable", r2: "partial", r1: "strong" }
    expect(inputsHash(shuffled)).toBe(a)
  })

  it("changes when any scoring input changes", () => {
    const a = inputsHash(baseInput())
    expect(inputsHash({ ...baseInput(), reviewed: true })).not.toBe(a)
    expect(inputsHash({ ...baseInput(), overrides: { r2: "strong" } })).not.toBe(a)
    expect(
      inputsHash({ ...baseInput(), softSignals: { motivation: 4 } })
    ).not.toBe(a)
  })
})

describe("identityHash", () => {
  it("normalises email case and whitespace", () => {
    expect(identityHash(" Jane.Doe@Example.com ")).toBe(identityHash("jane.doe@example.com"))
  })
  it("falls back to name and returns null when nothing usable", () => {
    expect(identityHash(null, "Jane Doe")).not.toBeNull()
    expect(identityHash(null, "")).toBeNull()
    expect(identityHash("", undefined)).toBeNull()
  })
})
