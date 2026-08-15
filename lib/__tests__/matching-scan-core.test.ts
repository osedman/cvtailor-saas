/**
 * Stage 2 of the quiet-matching scan.
 *
 * Pure functions, tested against real values — the decisions here are what the
 * recruiter's threshold means and what a person is shown about themselves, and
 * neither survives being checked against a mock.
 */
import { describe, it, expect } from "vitest"
import {
  buildProfileText,
  profileHash,
  requirementsHash,
  scoreForMatching,
  toRecommendationEvidence,
  selectMatches,
  type MatchRequirement,
  type ScannedPerson,
} from "@/lib/matching/scan-core"
import type { Assessment } from "@/lib/agency/assessment"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import { computeScore } from "@/lib/agency/scoring"

let seq = 0
function card(partial: Partial<EvidenceRow> = {}): EvidenceRow {
  seq += 1
  return {
    id: `ev-${seq}`,
    category: "impact",
    claim: `claim ${seq}`,
    source_role: "",
    source_company: "",
    source_span: "",
    cv_line: null,
    pinned: false,
    hidden: false,
    rephrased_text: null,
    sort_order: seq,
    ...partial,
  }
}

const REQS: MatchRequirement[] = [
  { id: "r1", ref: "R1", text: "Kubernetes at scale", weight: "must" },
  { id: "r2", ref: "R2", text: "Payment reconciliation", weight: "important" },
  { id: "r3", ref: "R3", text: "Mentoring", weight: "nice" },
]

function assessment(partial: Partial<Assessment> = {}): Assessment {
  return {
    profile: { full_name: "A Person", current_title: "Engineer" },
    calibration: { seniority: 70, context_fit: 60, confidence: 80, confidence_level: 3 },
    evidence: [
      { requirement_ref: "R1", strength: "strong", quote: "Ran Kubernetes", source_cite: "" },
      { requirement_ref: "R2", strength: "partial", quote: "Touched payments", source_cite: "" },
      { requirement_ref: "R3", strength: "missing", quote: "", source_cite: "" },
    ],
    ...partial,
  }
}

describe("buildProfileText", () => {
  it("uses the person's own rephrasing when they wrote one", () => {
    const text = buildProfileText([
      card({ claim: "original wording", rephrased_text: "my own wording" }),
    ])
    expect(text).toContain("my own wording")
    expect(text).not.toContain("original wording")
  })

  it("excludes hidden cards", () => {
    // Hiding a claim is the person saying "not this one". Honouring that only
    // in the UI would make it decorative.
    const text = buildProfileText([
      card({ claim: "shown claim" }),
      card({ claim: "hidden claim", hidden: true }),
    ])
    expect(text).toContain("shown claim")
    expect(text).not.toContain("hidden claim")
  })

  it("orders by sort_order, not array order", () => {
    const text = buildProfileText([
      card({ claim: "second", sort_order: 2 }),
      card({ claim: "first", sort_order: 1 }),
    ])
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"))
  })

  it("survives an empty bank", () => {
    expect(buildProfileText([])).toBe("")
    expect(buildProfileText([card({ claim: "  ", rephrased_text: null })])).toBe("")
  })
})

describe("profileHash", () => {
  it("ignores reordering that does not change the text", () => {
    const a = [card({ claim: "alpha", sort_order: 1 }), card({ claim: "beta", sort_order: 2 })]
    const b = [a[1], a[0]]
    expect(profileHash(a)).toBe(profileHash(b))
  })

  it("changes when a single word changes", () => {
    const before = profileHash([card({ claim: "led the migration" })])
    const after = profileHash([card({ claim: "led that migration" })])
    expect(before).not.toBe(after)
  })

  it("changes when a card is hidden", () => {
    const shown = profileHash([card({ claim: "x", hidden: false })])
    const hidden = profileHash([card({ claim: "x", hidden: true })])
    expect(shown).not.toBe(hidden)
  })
})

describe("requirementsHash", () => {
  it("is order-independent", () => {
    expect(requirementsHash(REQS)).toBe(requirementsHash([...REQS].reverse()))
  })

  it("changes when a weight changes", () => {
    const reweighted: MatchRequirement[] = [{ ...REQS[0], weight: "nice" }, REQS[1], REQS[2]]
    expect(requirementsHash(REQS)).not.toBe(requirementsHash(reweighted))
  })
})

describe("scoreForMatching", () => {
  it("agrees exactly with the recruiter-side engine on the same inputs", () => {
    // THE property that makes a recruiter's threshold mean anything. If these
    // two ever diverge, the number they set stops describing what they think.
    const a = assessment()
    const mine = scoreForMatching(a, REQS)
    const theirs = computeScore({
      requirements: REQS.map((r) => ({ id: r.id, ref: r.ref, weight: r.weight })),
      evidence: { r1: "strong", r2: "partial", r3: "missing" },
      overrides: {},
      softSignals: {},
      baselines: { seniority: 70, contextFit: 60, confidence: 80, confidenceLevel: 3 },
      reviewed: false,
    })
    expect(mine).toEqual(theirs)
  })

  it("treats a requirement the model skipped as missing, not absent", () => {
    const a = assessment({
      evidence: [{ requirement_ref: "R1", strength: "strong", quote: "q", source_cite: "" }],
    })
    const score = scoreForMatching(a, REQS)
    expect(score.must_have_total).toBe(1)
    expect(score.must_have_hit).toBe(1)
    // R2 and R3 silently dropped by the model still count against coverage.
    expect(score.evidence_strength).toBeLessThan(100)
  })

  it("cannot be told a candidate was reviewed or overridden", () => {
    // reviewed adds +12 confidence and a confidence level on the recruiter
    // path. There is no recruiter here, so it must never apply.
    const score = scoreForMatching(assessment(), REQS)
    expect(score.confidence_completeness).toBe(80)
    expect(score.confidence_level).toBe(3)
  })
})

describe("toRecommendationEvidence", () => {
  it("keeps the person's own quote against a real strength", () => {
    const rows = toRecommendationEvidence(assessment(), REQS)
    expect(rows.find((r) => r.requirement_ref === "R1")).toEqual({
      requirement_ref: "R1",
      strength: "strong",
      quote: "Ran Kubernetes",
    })
  })

  it("renders missing explicitly with no quote", () => {
    const rows = toRecommendationEvidence(assessment(), REQS)
    expect(rows.find((r) => r.requirement_ref === "R3")).toEqual({
      requirement_ref: "R3",
      strength: "missing",
      quote: null,
    })
  })

  it("demotes a strength that arrives without a quote", () => {
    // Never fill MISSING with inferred content — a claim with no quote behind
    // it is not evidence, whatever the model called it.
    const rows = toRecommendationEvidence(
      assessment({
        evidence: [{ requirement_ref: "R1", strength: "strong", quote: "   ", source_cite: "" }],
      }),
      REQS
    )
    expect(rows.find((r) => r.requirement_ref === "R1")).toEqual({
      requirement_ref: "R1",
      strength: "missing",
      quote: null,
    })
  })

  it("emits one row per requirement, in requirement order", () => {
    const rows = toRecommendationEvidence(assessment(), REQS)
    expect(rows.map((r) => r.requirement_ref)).toEqual(["R1", "R2", "R3"])
  })

  it("satisfies the database constraint for every row it produces", () => {
    // Mirrors matching_evidence_is_well_formed: missing ⇔ no quote, both
    // directions, plus the 1000-char cap.
    const long = "x".repeat(3000)
    const rows = toRecommendationEvidence(
      assessment({
        evidence: [
          { requirement_ref: "R1", strength: "strong", quote: long, source_cite: "" },
          { requirement_ref: "R2", strength: "missing", quote: "leftover", source_cite: "" },
          { requirement_ref: "R3", strength: "transferable", quote: "ok", source_cite: "" },
        ],
      }),
      REQS
    )
    for (const row of rows) {
      const isMissing = row.strength === "missing"
      const hasQuote = row.quote !== null && row.quote.trim() !== ""
      expect(isMissing).toBe(!hasQuote)
      expect((row.quote ?? "").length).toBeLessThanOrEqual(1000)
      expect(["strong", "transferable", "partial", "missing"]).toContain(row.strength)
    }
    // A quote on a 'missing' strength is dropped, not kept.
    expect(rows.find((r) => r.requirement_ref === "R2")?.quote).toBeNull()
  })
})

describe("selectMatches", () => {
  const person = (userId: string, overall: number): ScannedPerson => ({
    userId,
    score: { overall } as ScannedPerson["score"],
    evidence: [],
    profileHash: "h",
  })

  it("keeps those at or above the threshold, drops nobody else loudly", () => {
    const out = selectMatches([person("a", 82), person("b", 69), person("c", 70)], 70)
    expect(out.map((p) => p.userId)).toEqual(["a", "c"])
  })

  it("is inclusive at the boundary", () => {
    expect(selectMatches([person("x", 70)], 70)).toHaveLength(1)
  })

  it("orders by score then userId, so a rescan is reproducible", () => {
    const out = selectMatches([person("z", 80), person("a", 80), person("m", 90)], 70)
    expect(out.map((p) => p.userId)).toEqual(["m", "a", "z"])
  })

  it("returns nothing rather than everything when nobody clears the bar", () => {
    expect(selectMatches([person("a", 10), person("b", 20)], 70)).toEqual([])
  })
})
