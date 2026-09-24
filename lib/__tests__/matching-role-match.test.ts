/**
 * The after-tailoring number — commensurable with the before number.
 *
 * The bug this closes: /found showed the scan's score and /tailor showed the
 * free pipeline's matchScore — two engines, two scales — and the person read
 * the second as "tailoring made me worse". Pure functions on values first
 * (same engine, same list, same weights, same STRENGTH MAPPING, same
 * baselines), then the validity predicate both pages share, then the join
 * that decides when /found may show the after number, then source scans for
 * the structural promises: the free path is untouched, the back link exists,
 * the recompute is metered, the number never crosses the wall.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import {
  baselinesFromBreakdown,
  buildRoleMatch,
  decideRoleMatch,
  roleMatchHolds,
  scoreEvidenceAgainstSnapshot,
  sha256,
  verifiedEvidence,
  type RoleMatch,
} from "@/lib/matching/role-match"
import { scoreForMatching, strengthsForScoring, type MatchRequirement } from "@/lib/matching/scan-core"
import { computeScore, ENGINE_VERSION } from "@/lib/agency/scoring"
import { joinFound } from "@/lib/matching/found"
import { applyTailoredCvEdit } from "@/lib/tailor-history-edit"
import type { Assessment } from "@/lib/agency/assessment"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const REQS = [
  { ref: "R1", text: "Kubernetes at scale", weight: "must" as const },
  { ref: "R2", text: "Payment reconciliation", weight: "important" as const },
  { ref: "R3", text: "Mentoring", weight: "nice" as const },
]
const MATCH_REQS: MatchRequirement[] = REQS.map((r) => ({ id: r.ref, ...r }))
const BASELINES = { seniority: 70, contextFit: 60, confidence: 80, confidenceLevel: 3 as const }
/** score_breakdown carrying exactly BASELINES, as the scan stores it. */
const BREAKDOWN = {
  requirement_coverage: 56.43,
  evidence_strength: 66.67,
  seniority_calibration: 70,
  context_fit: 60,
  confidence_completeness: 80,
  confidence_level: 3,
}

// What the scan stored: the person's bank against the same list.
const BEFORE_EVIDENCE = [
  { requirement_ref: "R1", strength: "strong" as const, quote: "Ran Kubernetes" },
  { requirement_ref: "R2", strength: "partial" as const, quote: "Touched payments" },
  { requirement_ref: "R3", strength: "missing" as const, quote: null },
]

const TAILORED_CV = [
  "Ran Kubernetes clusters across three regions for a payments platform.",
  "• Owned payment\n  reconciliation for card and bank rails, closing the month in two days.",
  "Mentored four engineers through promotion.",
].join("\n")

function assessment(partial: Partial<Assessment> = {}): Assessment {
  return {
    profile: { full_name: "A Person", current_title: "Engineer" },
    calibration: { seniority: 55, context_fit: 45, confidence: 65, confidence_level: 2 },
    evidence: [
      { requirement_ref: "R1", strength: "strong", quote: "Ran Kubernetes clusters across three regions", source_cite: "" },
      { requirement_ref: "R2", strength: "strong", quote: "Owned payment reconciliation for card and bank rails", source_cite: "" },
      { requirement_ref: "R3", strength: "transferable", quote: "Mentored four engineers", source_cite: "" },
    ],
    ...partial,
  }
}

const INPUTS = {
  recommendationId: "rec-1",
  requirementsHash: "hash-a",
  requirements: REQS,
  roleTitle: "Platform Engineer",
  seniority: "Senior",
  summary: "Payments platform.",
  before: 62.06,
  scoreBreakdown: BREAKDOWN as Record<string, unknown>,
}

describe("one engine, one strength mapping, for both numbers", () => {
  it("before and after go through computeScore with the same list, weights and baselines", () => {
    const before = scoreEvidenceAgainstSnapshot(BEFORE_EVIDENCE, REQS, BASELINES)
    const after = scoreEvidenceAgainstSnapshot(assessment().evidence, REQS, BASELINES)

    const direct = (evidence: Record<string, "strong" | "transferable" | "partial" | "missing">) =>
      computeScore({
        requirements: REQS.map((r) => ({ id: r.ref, ref: r.ref, weight: r.weight })),
        evidence,
        overrides: {},
        softSignals: {},
        baselines: BASELINES,
        reviewed: false,
      })
    expect(before).toEqual(direct({ R1: "strong", R2: "partial", R3: "missing" }))
    expect(after).toEqual(direct({ R1: "strong", R2: "strong", R3: "transferable" }))
    expect(after.seniority_calibration).toBe(before.seniority_calibration)
    expect(after.context_fit).toBe(before.context_fit)
    expect(after.confidence_completeness).toBe(before.confidence_completeness)
    expect(after.overall).toBeGreaterThan(before.overall)
  })

  it("the before number equals what the scan stored (scoreForMatching on the same assessment)", () => {
    const scanAssessment = assessment({
      calibration: { seniority: 70, context_fit: 60, confidence: 80, confidence_level: 3 },
      evidence: BEFORE_EVIDENCE.map((e) => ({ ...e, quote: e.quote ?? "", source_cite: "" })),
    })
    expect(scoreEvidenceAgainstSnapshot(BEFORE_EVIDENCE, REQS, BASELINES)).toEqual(
      scoreForMatching(scanAssessment, MATCH_REQS)
    )
  })

  it("after uses the scan's exact strength mapping — no quote gate the before number never had", () => {
    // The two cases the reviewers measured: an empty-quote 'partial' on a
    // must-have, and must-have quotes that differ from the CV only by a
    // joined line break and a double space. The scan scores the raw strength
    // in both; so must the after pass, or identical judgements score lower
    // after tailoring than before it.
    const judged = assessment({
      calibration: { seniority: 70, context_fit: 60, confidence: 80, confidence_level: 3 },
      evidence: [
        { requirement_ref: "R1", strength: "partial", quote: "", source_cite: "" },
        { requirement_ref: "R2", strength: "strong", quote: "Owned payment reconciliation  for card and bank rails", source_cite: "" },
        { requirement_ref: "R3", strength: "transferable", quote: "Mentored four engineers", source_cite: "" },
      ],
    })
    const rm = buildRoleMatch(INPUTS, judged, TAILORED_CV)
    const scan = scoreForMatching(judged, MATCH_REQS)
    expect(rm.after).toBe(scan.overall)
    const { effective: _e, ...scanBreakdown } = scan
    expect(rm.breakdown).toEqual(scanBreakdown)
    // And the mapping itself is the scan's function on the raw assessment.
    expect(strengthsForScoring(judged, MATCH_REQS)).toEqual({ R1: "partial", R2: "strong", R3: "transferable" })
  })

  it("a quote the CV does not contain changes the displayed evidence, never the score", () => {
    const hallucinated = assessment({
      evidence: [
        { requirement_ref: "R1", strength: "strong", quote: "Ran Kubernetes clusters", source_cite: "" },
        { requirement_ref: "R2", strength: "strong", quote: "Led SOX-compliant reconciliation programme", source_cite: "" },
        { requirement_ref: "R3", strength: "partial", quote: "", source_cite: "" },
      ],
    })
    const rm = buildRoleMatch(INPUTS, hallucinated, TAILORED_CV)
    expect(rm.after).toBe(scoreEvidenceAgainstSnapshot(hallucinated.evidence, REQS, BASELINES).overall)
    expect(rm.evidence).toEqual([
      { requirement_ref: "R1", strength: "strong", quote: "Ran Kubernetes clusters" },
      { requirement_ref: "R2", strength: "missing", quote: null },
      { requirement_ref: "R3", strength: "missing", quote: null },
    ])
  })

  it("the displayed evidence tolerates re-wrapped whitespace in a quote", () => {
    const ev = verifiedEvidence(
      assessment({
        evidence: [
          { requirement_ref: "R1", strength: "strong", quote: "Ran Kubernetes clusters", source_cite: "" },
          // The CV has "Owned payment\n  reconciliation"; the model normalised it.
          { requirement_ref: "R2", strength: "strong", quote: "Owned payment reconciliation for card and bank rails", source_cite: "" },
          { requirement_ref: "R3", strength: "partial", quote: "Coached  four engineers", source_cite: "" },
        ],
      }),
      REQS,
      TAILORED_CV
    )
    expect(ev[1]).toEqual({ requirement_ref: "R2", strength: "strong", quote: "Owned payment reconciliation for card and bank rails" })
    // Still strict on the words: a paraphrase is not a quote.
    expect(ev[2]).toEqual({ requirement_ref: "R3", strength: "missing", quote: null })
  })

  it("holds the scan's calibration from score_breakdown, exactly as apply reconstructs it", () => {
    expect(baselinesFromBreakdown(BREAKDOWN)).toEqual(BASELINES)
    expect(baselinesFromBreakdown({ requirement_coverage: 10 })).toBeNull()
    expect(baselinesFromBreakdown(null)).toBeNull()
  })

  it("buildRoleMatch: scan baselines when stored, the assessor's own only as a fallback", () => {
    const held = buildRoleMatch(INPUTS, assessment(), TAILORED_CV, new Date("2026-09-24T10:00:00Z"))
    expect(held.baselineSource).toBe("scan")
    expect(held.baselines).toEqual(BASELINES)
    expect(held.before).toBe(62.06)
    expect(held.after).toBe(scoreEvidenceAgainstSnapshot(assessment().evidence, REQS, BASELINES).overall)
    expect(held.engine).toBe(ENGINE_VERSION)
    expect(held.cvSha256).toBe(sha256(TAILORED_CV))
    expect(held.assessedAt).toBe("2026-09-24T10:00:00.000Z")

    const fresh = buildRoleMatch({ ...INPUTS, scoreBreakdown: null }, assessment(), TAILORED_CV)
    expect(fresh.baselineSource).toBe("fresh")
    expect(fresh.baselines).toEqual({ seniority: 55, contextFit: 45, confidence: 65, confidenceLevel: 2 })
  })
})

const RM: RoleMatch = {
  engine: ENGINE_VERSION,
  recommendationId: "rec-1",
  requirementsHash: "hash-a",
  before: 62.06,
  after: 76.5,
  breakdown: {
    overall: 76.5, requirement_coverage: 0, evidence_strength: 0, seniority_calibration: 0,
    context_fit: 0, confidence_completeness: 0, must_have_hit: 0, must_have_total: 0, confidence_level: 2,
  },
  baselines: BASELINES,
  baselineSource: "scan",
  evidence: [],
  cvSha256: sha256("cv"),
  assessedAt: "2026-09-24T10:00:00Z",
}
const OK = { recommendationId: "rec-1", requirementsHash: "hash-a" }

describe("roleMatchHolds", () => {
  it("holds for the same recommendation, snapshot, engine, bytes, before number and calibration", () => {
    expect(roleMatchHolds(RM, OK)).toBe(true)
    expect(roleMatchHolds(RM, { ...OK, cvSha256: sha256("cv") })).toBe(true)
    expect(roleMatchHolds(RM, { ...OK, editedAt: null })).toBe(true)
    expect(roleMatchHolds(RM, { ...OK, editedAt: "2026-09-24T09:00:00Z" })).toBe(true)
    expect(roleMatchHolds(RM, { ...OK, before: 62.06 })).toBe(true)
    // numeric → string → float round trips land within tolerance
    expect(roleMatchHolds(RM, { ...OK, before: parseFloat("62.06") })).toBe(true)
    expect(roleMatchHolds(RM, { ...OK, scoreBreakdown: BREAKDOWN })).toBe(true)
    expect(roleMatchHolds({ ...RM, baselineSource: "fresh" }, { ...OK, scoreBreakdown: null })).toBe(true)
  })

  it("fails on a republished snapshot, another recommendation, another engine, changed bytes, or a later hand-edit", () => {
    expect(roleMatchHolds(RM, { ...OK, requirementsHash: "hash-b" })).toBe(false)
    expect(roleMatchHolds(RM, { ...OK, recommendationId: "rec-2" })).toBe(false)
    expect(roleMatchHolds({ ...RM, engine: "v0" }, OK)).toBe(false)
    expect(roleMatchHolds(RM, { ...OK, cvSha256: sha256("edited") })).toBe(false)
    expect(roleMatchHolds(RM, { ...OK, editedAt: "2026-09-24T11:00:00Z" })).toBe(false)
    expect(roleMatchHolds(null, OK)).toBe(false)
    expect(roleMatchHolds({}, OK)).toBe(false)
  })

  it("fails when a rescan moved the before number or the calibration under it", () => {
    // Recruiter nudges min_score → the scan re-assesses with the same hashes
    // and overwrites score + score_breakdown; tailored_* is untouched, so
    // only these two checks can see it.
    expect(roleMatchHolds(RM, { ...OK, before: 58.1 })).toBe(false)
    expect(roleMatchHolds(RM, { ...OK, scoreBreakdown: { ...BREAKDOWN, seniority_calibration: 65 } })).toBe(false)
    expect(roleMatchHolds(RM, { ...OK, scoreBreakdown: { ...BREAKDOWN, confidence_level: 2 } })).toBe(false)
    // A held-from-scan number whose recommendation no longer carries a
    // calibration, and a fresh-calibrated one whose recommendation now does.
    expect(roleMatchHolds(RM, { ...OK, scoreBreakdown: null })).toBe(false)
    expect(roleMatchHolds({ ...RM, baselineSource: "fresh" }, { ...OK, scoreBreakdown: BREAKDOWN })).toBe(false)
  })
})

describe("decideRoleMatch · the cache-hit branch on values", () => {
  it("reuses a holding number, recomputes a stale one, skips when there is no CV to score", () => {
    expect(decideRoleMatch(RM, { ...OK, cvSha256: sha256("cv") }, "cv")).toBe("reuse")
    expect(decideRoleMatch(RM, { ...OK, cvSha256: sha256("edited") }, "edited")).toBe("recompute")
    expect(decideRoleMatch(undefined, { ...OK, cvSha256: sha256("cv") }, "cv")).toBe("recompute")
    expect(decideRoleMatch(RM, { ...OK, before: 58.1, cvSha256: sha256("cv") }, "cv")).toBe("recompute")
    expect(decideRoleMatch(undefined, { ...OK, cvSha256: sha256("") }, "")).toBe("skip")
  })
})

describe("applyTailoredCvEdit · what a hand-edit does to result", () => {
  it("drops roleMatch, stashes the original once, stamps the CV-specific edit time", () => {
    const now = new Date("2026-09-24T12:00:00Z")
    const first = applyTailoredCvEdit(
      { tailoredCV: "ai text", matchScore: 70, roleMatch: RM },
      "edited once",
      now
    )
    expect(first).toEqual({
      tailoredCV: "edited once",
      tailoredCVOriginal: "ai text",
      matchScore: 70,
      tailoredCVEditedAt: "2026-09-24T12:00:00.000Z",
    })
    expect("roleMatch" in first).toBe(false)

    const second = applyTailoredCvEdit(first, "edited twice", new Date("2026-09-24T13:00:00Z"))
    expect(second.tailoredCVOriginal).toBe("ai text")
    expect(second.tailoredCV).toBe("edited twice")
    expect(second.tailoredCVEditedAt).toBe("2026-09-24T13:00:00.000Z")
  })
})

describe("joinFound · the after number only while tailored counts", () => {
  const rec = {
    id: "rec-1",
    published_role_id: "pub-1",
    state: "seen",
    score: "62.06",
    score_breakdown: BREAKDOWN as Record<string, unknown>,
    created_at: "2026-08-16T10:00:00Z",
    evidence: [],
    tailor_history_id: "hist-1",
    tailored_against_hash: "hash-a",
    tailored_source_hash: "src-a",
  }
  const role = {
    id: "pub-1", title: "T", company: "C", agency_name: "A", location: "", salary_band: "",
    seniority: "", summary: "", status: "live", requirements: [], requirements_hash: "hash-a",
  }
  const roleMatch = { ...RM, assessedAt: "2026-08-16T11:00:00Z", cvSha256: "x" }
  const meta = (over: Partial<{ cvEditedAt: string | null; roleMatch: Partial<RoleMatch> | null }> = {}) =>
    new Map([["hist-1", { savedAt: "2026-08-16T11:00:00Z", cvEditedAt: null, roleMatch, ...over }]])

  it("present while both hashes hold and the run stored a matching after number", () => {
    const [f] = joinFound([rec], [role], meta(), "src-a")
    expect(f.tailored).toEqual({ savedAt: "2026-08-16T11:00:00Z", afterScore: 76.5, afterStale: false })
    expect(f.score).toBeCloseTo(62.06)
  })

  it("an older tailored run with no after number degrades to before-only, still tailored", () => {
    const [f] = joinFound([rec], [role], meta({ roleMatch: null }), "src-a")
    expect(f.tailored).toEqual({ savedAt: "2026-08-16T11:00:00Z", afterScore: null, afterStale: false })
  })

  it("null and flagged stale once the CV was hand-edited after it was scored", () => {
    const [f] = joinFound([rec], [role], meta({ cvEditedAt: "2026-08-17T09:00:00Z" }), "src-a")
    expect(f.tailored).toEqual({ savedAt: "2026-08-16T11:00:00Z", afterScore: null, afterStale: true })
    // The route drops roleMatch on that edit; the join still says why.
    const [g] = joinFound([rec], [role], meta({ cvEditedAt: "2026-08-17T09:00:00Z", roleMatch: null }), "src-a")
    expect(g.tailored?.afterStale).toBe(true)
  })

  it("a CV edit BEFORE the score, or a re-score after the edit, is not stale", () => {
    const [f] = joinFound([rec], [role], meta({ cvEditedAt: "2026-08-16T10:30:00Z" }), "src-a")
    expect(f.tailored).toEqual({ savedAt: "2026-08-16T11:00:00Z", afterScore: 76.5, afterStale: false })
  })

  it("null (not stale) once a rescan moved the before number or its calibration", () => {
    const [f] = joinFound([{ ...rec, score: "58.10" }], [role], meta(), "src-a")
    expect(f.tailored).toEqual({ savedAt: "2026-08-16T11:00:00Z", afterScore: null, afterStale: false })
    expect(f.score).toBeCloseTo(58.1)
    const [g] = joinFound(
      [{ ...rec, score_breakdown: { ...BREAKDOWN, context_fit: 50 } }],
      [role],
      meta(),
      "src-a"
    )
    expect(g.tailored?.afterScore).toBeNull()
  })

  it("null when the after number was made against a different snapshot version", () => {
    const [f] = joinFound([rec], [role], meta({ roleMatch: { ...roleMatch, requirementsHash: "hash-old" } }), "src-a")
    expect(f.tailored?.afterScore).toBeNull()
  })

  it("never present when tailored itself does not count", () => {
    expect(joinFound([rec], [{ ...role, requirements_hash: "hash-b" }], meta(), "src-a")[0].tailored).toBeNull()
    expect(joinFound([rec], [role], meta(), "src-b")[0].tailored).toBeNull()
    expect(joinFound([rec], [role], new Map(), "src-a")[0].tailored).toBeNull()
  })
})

describe("structural promises", () => {
  const tailorRoute = read("app/api/tailor/route.ts")
  const tailorPage = read("app/tailor/page.tsx")
  const foundPage = read("app/found/page.tsx")
  const foundLib = read("lib/matching/found.ts")
  const applyLib = read("lib/matching/apply.ts")
  const historyRoute = read("app/api/history/[id]/route.ts")

  it("the after pass runs only under the brief guard — the free path is untouched", () => {
    expect(tailorRoute).not.toMatch(/from ['"]@\/lib\/agency\/assessment['"]/)
    const calls = [...tailorRoute.matchAll(/assessRoleMatch\(brief, /g)]
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const m of calls) {
      const preceding = tailorRoute.slice(Math.max(0, m.index! - 2400), m.index!)
      expect(preceding).toMatch(/if \(brief\)/)
    }
    expect(tailorRoute).toMatch(/const matchScore = computeMatchScore\(extract\.requirements\)/)
    expect(tailorRoute).toMatch(/`\$\{cv\}\\n---\\n\$\{jobDescription\}`/)
    expect(tailorRoute).toMatch(/jobDescription = brief\.jd/)
  })

  it("a cache-hit recompute is rate-limited before the model call; a reuse stays free", () => {
    const branch = tailorRoute.slice(
      tailorRoute.indexOf("if (cachedRow?.result)"),
      tailorRoute.indexOf("cached: true, linked, roleMatch")
    )
    expect(branch).toMatch(/decideRoleMatch\(/)
    const limiter = branch.indexOf("checkRateLimit(user.id, 'ai')")
    const model = branch.indexOf("assessRoleMatch(brief, cvText)")
    expect(limiter).toBeGreaterThan(-1)
    expect(model).toBeGreaterThan(limiter)
    // The limiter sits inside the recompute arm, not on the reuse arm.
    const reuseArm = branch.indexOf("decision === 'reuse'")
    const recomputeArm = branch.indexOf("decision === 'recompute'")
    expect(reuseArm).toBeGreaterThan(-1)
    expect(recomputeArm).toBeGreaterThan(reuseArm)
    expect(branch.slice(reuseArm, recomputeArm)).not.toMatch(/checkRateLimit/)
    expect(limiter).toBeGreaterThan(recomputeArm)
    // The store is conditional on the row being as it was read.
    expect(branch).toMatch(/\.is\('edited_at', null\)/)
    expect(branch).toMatch(/\.eq\('edited_at', readEditedAt\)/)
    // The same validity inputs /found uses.
    expect(branch).toMatch(/before: brief\.score/)
    expect(branch).toMatch(/scoreBreakdown: brief\.scoreBreakdown/)
  })

  it("the tailor response carries roleMatch on both the fresh and the cached path", () => {
    expect(tailorRoute).toMatch(/cached: true, linked, roleMatch/)
    expect(tailorRoute).toMatch(/compressed, scoreDelta, linked, roleMatch/)
  })

  it("/tailor in role mode links back to the recommendation, keeps the exit, and names the stale case", () => {
    expect(tailorPage).toMatch(/href=\{`\/found\?rec=\$\{role\.recommendationId\}`\}/)
    expect(tailorPage).toMatch(/Back to this role/)
    expect(tailorPage).toMatch(/before tailoring/)
    expect(tailorPage).toMatch(/after tailoring/)
    expect(tailorPage).toMatch(/router\.replace\("\/tailor"\)/)
    // A hand-edit clears the strip and explains the free re-run.
    const save = tailorPage.slice(tailorPage.indexOf("const handleSaveTailoredCV"), tailorPage.indexOf("const handleSaveCoverLetter"))
    expect(save).toMatch(/setRoleMatch\(null\)/)
    expect(save).toMatch(/setRoleMatchStale\(true\)/)
    expect(tailorPage).toMatch(/You edited this CV after it was scored/)
  })

  it("/found honours ?rec=, shows the after number only under tailored, and names what crosses", () => {
    expect(foundPage).toMatch(/searchParams\.get\("rec"\)/)
    expect(foundPage).toMatch(/id=\{`rec-\$\{rec\.id\}`\}/)
    expect(foundPage).toMatch(/match before tailoring/)
    expect(foundPage).toMatch(/active\.tailored\?\.afterScore != null && \(/)
    expect(foundPage).toMatch(/after tailoring · scored the same way, on this CV/)
    expect(foundPage).toMatch(/on-arrival score; they read the CV themselves/)
    expect(foundPage).toMatch(/active\.tailored\?\.afterStale && \(/)
    expect(foundPage).toMatch(/Edited since it was scored/)
    // The consent sheet names the arrival score as the agency's number.
    expect(foundPage).toMatch(/Your match score on arrival/)
    expect(foundPage).not.toMatch(/· Your match score \(/)
  })

  it("/found reads only result->roleMatch and the CV edit stamp from history, never the whole result", () => {
    expect(foundLib).toMatch(/roleMatch:result->roleMatch/)
    expect(foundLib).toMatch(/cvEditedAt:result->>tailoredCVEditedAt/)
    expect(foundLib).not.toMatch(/select\("id, edited_at, created_at, result"\)/)
    // The live before number and calibration feed the validity check.
    expect(foundLib).toMatch(/score_breakdown, created_at/)
  })

  it("the after number is display-only: apply never reads it", () => {
    expect(applyLib).not.toMatch(/roleMatch|afterScore|tailored_score/)
  })

  it("a hand-edit goes through the pure edit rule, which drops the after number", () => {
    expect(historyRoute).toMatch(/applyTailoredCvEdit\(row\.result as Record<string, unknown>, tailoredCV, now\)/)
  })
})
