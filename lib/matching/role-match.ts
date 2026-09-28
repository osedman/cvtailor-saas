/**
 * The after-tailoring number, on the SAME scale as the number the person
 * arrived with.
 *
 * WHY THIS EXISTS. /found shows role_recommendations.score: the scan's
 * assessor (extractAssessment) over the snapshot's fixed {ref,text,weight}
 * list, scored by computeScore — the recruiter's own engine. /tailor, until
 * this module, showed the free-tailoring pipeline's matchScore: a different
 * model re-extracting 6–12 requirements from the brief prose under a stricter
 * prompt, weighted must=2/else=1, strengths 1/0.6/0.25/0, no calibration —
 * and computed from the INPUT CV before the rewrite even ran. Identical
 * judgements scored 62 on one and 49 on the other; the person read that as
 * "tailoring made me worse". Nothing had been scored after tailoring at all.
 *
 * So, in role mode only, the route runs one more pass: the scan's OWN
 * assessor over the TAILORED CV against the snapshot's OWN list, scored by
 * the scan's OWN function with the scan's OWN strength mapping
 * (strengthsForScoring — raw strengths, no quote gate) and the scan's stored
 * calibration held constant. Before and after then differ in exactly one
 * thing — the evidence strengths the document supports — which is precisely
 * what tailoring changed. The quote checks (empty ⇔ missing, verbatim in the
 * document) shape the evidence MAP that is displayed, exactly as
 * toRecommendationEvidence does for the scan; they never touch the score.
 * A first cut gated the after score on a byte-exact quote match the before
 * number never had, and a line break inside a bullet was enough to make
 * "tailoring reduced my score" come back on the new scale.
 *
 * Stored inside tailor_history.result (jsonb, no migration) and honoured on
 * /found only while it still describes the CV that would be sent AND the
 * before number it was paired with: same requirements hash, same engine, same
 * rec.score and calibration (a rescan moves both), not hand-edited since.
 * tailor_history is user-writable, so this number is display-only by
 * construction — it never crosses the wall (lib/matching/apply.ts does not
 * read it; a test pins that).
 */

import { createHash } from "crypto"
import { computeScore, ENGINE_VERSION, type ScoreResult, type ScoringBaselines } from "@/lib/agency/scoring"
import { extractAssessment, QUOTE_LIMIT, type Assessment } from "@/lib/agency/assessment"
import type { Strength, Weight } from "@/lib/agency/types"
import { strengthsForScoring, type RecommendationEvidence } from "./scan-core"

export interface SnapshotRequirement {
  ref: string
  text: string
  weight: Weight
}

/** What a role-mode tailor run stores under result.roleMatch. */
export interface RoleMatch {
  engine: string
  recommendationId: string
  requirementsHash: string
  /** role_recommendations.score at the time — what /found called "before". */
  before: number
  /** computeScore(...).overall for the tailored CV — the "after". */
  after: number
  breakdown: Omit<ScoreResult, "effective">
  baselines: ScoringBaselines
  /** 'scan' = held from the recommendation's stored breakdown; 'fresh' = the
   *  assessor's own calibration because the stored breakdown lacked them. */
  baselineSource: "scan" | "fresh"
  evidence: RecommendationEvidence[]
  /** sha256 of the exact tailored CV text this describes. */
  cvSha256: string
  assessedAt: string
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

/**
 * The scan's calibration, reconstructed from what it stored — the SAME
 * reconstruction apply.ts uses, so before/after/what-crosses all hold the one
 * set of baselines. Null when the breakdown does not carry them (a
 * pre-migration recommendation); the caller then falls back to the fresh
 * assessment's calibration and says so.
 */
export function baselinesFromBreakdown(
  breakdown: Record<string, unknown> | null | undefined
): ScoringBaselines | null {
  if (!breakdown) return null
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  const seniority = n(breakdown.seniority_calibration)
  const contextFit = n(breakdown.context_fit)
  const confidence = n(breakdown.confidence_completeness)
  if (seniority === null || contextFit === null || confidence === null) return null
  const level = breakdown.confidence_level
  return {
    seniority,
    contextFit,
    confidence,
    confidenceLevel: (level === 1 || level === 2 || level === 3 || level === 4 ? level : 2) as 1 | 2 | 3 | 4,
  }
}

export function baselinesFromAssessment(a: Assessment): ScoringBaselines {
  return {
    seniority: a.calibration.seniority,
    contextFit: a.calibration.context_fit,
    confidence: a.calibration.confidence,
    confidenceLevel: a.calibration.confidence_level,
  }
}

function sameBaselines(a: ScoringBaselines, b: ScoringBaselines): boolean {
  return (
    a.seniority === b.seniority &&
    a.contextFit === b.contextFit &&
    a.confidence === b.confidence &&
    a.confidenceLevel === b.confidenceLevel
  )
}

/**
 * THE one scoring path for both numbers: the scan's strength mapping
 * (strengthsForScoring — raw strength per ref, absent → missing, no quote
 * gate) into computeScore exactly as the scan and the recruiter call it, with
 * overrides and soft signals forced empty and reviewed false. `before` is the
 * recommendation's stored evidence map through this; `after` is the tailored
 * CV's assessment through this. Same list, same weights, same strengths
 * table, same baselines.
 */
export function scoreEvidenceAgainstSnapshot(
  evidence: Array<{ requirement_ref: string; strength: Strength }>,
  requirements: SnapshotRequirement[],
  baselines: ScoringBaselines
): ScoreResult {
  const scoringRequirements = requirements.map((r) => ({ id: r.ref, ref: r.ref, weight: r.weight }))
  return computeScore({
    requirements: scoringRequirements,
    evidence: strengthsForScoring({ evidence }, scoringRequirements),
    overrides: {},
    softSignals: {},
    baselines,
    reviewed: false,
  })
}

/** Whitespace-insensitive containment: a quote the model re-wrapped or
 *  re-spaced still counts as present. Case and punctuation stay strict. */
function containsNormalised(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim()
  const n = norm(needle)
  return n.length > 0 && norm(haystack).includes(n)
}

/**
 * The evidence map the person SEES for the tailored CV — display only, never
 * the score (mirrors toRecommendationEvidence, which shapes the scan's map
 * without touching scoreForMatching). Empty quote ⇔ missing, as the DB
 * constraint states it; and a quote that is not in the tailored CV (compared
 * with whitespace collapsed, so a wrapped bullet is not a hallucination) is
 * shown as missing rather than as evidence that does not exist.
 */
export function verifiedEvidence(
  assessment: Assessment,
  requirements: SnapshotRequirement[],
  cvText: string
): RecommendationEvidence[] {
  const byRef = new Map(assessment.evidence.map((e) => [e.requirement_ref, e]))
  return requirements.map((req) => {
    const found = byRef.get(req.ref)
    const quote = (found?.quote ?? "").trim().slice(0, QUOTE_LIMIT)
    const strength: Strength = found?.strength ?? "missing"
    if (strength === "missing" || !quote || !containsNormalised(cvText, quote.slice(0, 60))) {
      return { requirement_ref: req.ref, strength: "missing", quote: null }
    }
    return { requirement_ref: req.ref, strength, quote }
  })
}

/** Everything the route needs to build a RoleMatch; all from the brief. */
export interface RoleMatchInputs {
  recommendationId: string
  requirementsHash: string
  requirements: SnapshotRequirement[]
  roleTitle: string
  seniority: string
  summary: string
  /** role_recommendations.score */
  before: number
  /** role_recommendations.score_breakdown */
  scoreBreakdown: Record<string, unknown> | null
}

/**
 * Pure assembly, exported for tests: given the assessment of the tailored CV,
 * produce the stored object. The async wrapper below is the only I/O.
 *
 * `after` goes through the scan's strength mapping on the RAW assessment —
 * not through the displayed evidence map — so it is scoreForMatching on this
 * assessment with the held baselines swapped in, and nothing else.
 */
export function buildRoleMatch(
  inputs: RoleMatchInputs,
  assessment: Assessment,
  tailoredCv: string,
  now: Date = new Date()
): RoleMatch {
  const held = baselinesFromBreakdown(inputs.scoreBreakdown)
  const baselines = held ?? baselinesFromAssessment(assessment)
  const { effective: _effective, ...breakdown } = scoreEvidenceAgainstSnapshot(
    assessment.evidence,
    inputs.requirements,
    baselines
  )
  return {
    engine: ENGINE_VERSION,
    recommendationId: inputs.recommendationId,
    requirementsHash: inputs.requirementsHash,
    before: inputs.before,
    after: breakdown.overall,
    breakdown,
    baselines,
    baselineSource: held ? "scan" : "fresh",
    evidence: verifiedEvidence(assessment, inputs.requirements, tailoredCv),
    cvSha256: sha256(tailoredCv),
    assessedAt: now.toISOString(),
  }
}

/**
 * The one model call: the scan's assessor, byte-identical in prompt and tool
 * to the call that produced the before number (lib/matching/scan.ts), over
 * the tailored CV. Throws on failure; callers treat it as best-effort.
 */
export async function computeRoleMatch(inputs: RoleMatchInputs, tailoredCv: string): Promise<RoleMatch> {
  const assessment = await extractAssessment(
    tailoredCv,
    { title: inputs.roleTitle, seniority: inputs.seniority, company_context: inputs.summary },
    inputs.requirements.map((r) => ({ id: r.ref, ref: r.ref, text: r.text, weight: r.weight }))
  )
  return buildRoleMatch(inputs, assessment, tailoredCv)
}

export interface RoleMatchCheck {
  recommendationId: string
  requirementsHash: string | null | undefined
  /** sha256 of the CV text now stored; omit when unknown (found.ts). */
  cvSha256?: string
  /**
   * When the CV was last hand-edited (result.tailoredCVEditedAt); an edit
   * after assessment invalidates. A cover-letter edit is NOT this — it does
   * not change the document the number describes.
   */
  editedAt?: string | null
  /**
   * role_recommendations.score as it is NOW. A rescan (min_score nudged,
   * same hashes) rewrites it without touching tailored_*; the pair is then
   * two different befores and the stored after must not be shown.
   */
  before?: number
  /**
   * role_recommendations.score_breakdown as it is NOW: the baselines the
   * after number held must still be the recommendation's baselines.
   */
  scoreBreakdown?: Record<string, unknown> | null
}

/**
 * Does a stored roleMatch still describe what would be shown and sent?
 * Used by the tailor route (to decide whether a cache hit needs a fresh
 * pass) and by /found's join (which cannot see the CV bytes, so it uses
 * the CV edit stamp as the staleness signal instead of cvSha256).
 */
export function roleMatchHolds(
  rm: Partial<RoleMatch> | null | undefined,
  check: RoleMatchCheck
): rm is RoleMatch {
  if (!rm || typeof rm.after !== "number" || !Number.isFinite(rm.after)) return false
  if (rm.engine !== ENGINE_VERSION) return false
  if (rm.recommendationId !== check.recommendationId) return false
  if (!check.requirementsHash || rm.requirementsHash !== check.requirementsHash) return false
  if (check.cvSha256 !== undefined && rm.cvSha256 !== check.cvSha256) return false
  if (check.editedAt && rm.assessedAt && check.editedAt > rm.assessedAt) return false
  if (check.editedAt && !rm.assessedAt) return false
  if (check.before !== undefined) {
    if (typeof rm.before !== "number" || Math.abs(rm.before - check.before) > 0.005) return false
  }
  if (check.scoreBreakdown !== undefined) {
    const held = baselinesFromBreakdown(check.scoreBreakdown)
    if (held) {
      if (rm.baselineSource !== "scan" || !rm.baselines || !sameBaselines(rm.baselines, held)) return false
    } else if (rm.baselineSource !== "fresh") {
      return false
    }
  }
  return true
}

export type RoleMatchDecision = "reuse" | "recompute" | "skip"

/**
 * The cache-hit branch's decision, on values: reuse the stored number while
 * it holds; recompute when it does not and there is a CV to score; skip when
 * there is nothing to score. The route wraps 'recompute' in the rate limiter
 * — a recompute is a model call, and only 'reuse' is free.
 */
export function decideRoleMatch(
  stored: Partial<RoleMatch> | null | undefined,
  check: RoleMatchCheck,
  cvText: string
): RoleMatchDecision {
  if (roleMatchHolds(stored, check)) return "reuse"
  return cvText ? "recompute" : "skip"
}
