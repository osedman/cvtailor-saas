/**
 * Stage 2 of the quiet-matching scan, as pure functions.
 *
 * The I/O lives in scan.ts. Everything that decides anything lives here, so it
 * can be tested against real values rather than against a mocked query
 * builder — this repo has three times shipped code whose mocks agreed with it
 * and whose database did not.
 *
 * WHAT THE THRESHOLD MEANS
 *
 * A recruiter sets a minimum score. That number has to mean the same thing it
 * means everywhere else in the product, so matching runs the SAME
 * `extractAssessment` and the SAME `computeScore` as the candidates a
 * recruiter uploads by hand — with overrides and soft signals forced empty and
 * `reviewed` false. Precisely: *"would score at least N at the moment their CV
 * landed, before anyone looked at them."*
 *
 * That is the unreviewed, un-overridden variant, and the recruiter-facing copy
 * must say so. A reviewed candidate's score legitimately drifts upward as a
 * recruiter adds overrides; if the threshold silently meant the post-review
 * number, that drift would read as a bug.
 */

import { createHash } from "crypto"
import { computeScore, type ScoreResult, type ScoringRequirement } from "@/lib/agency/scoring"
import { QUOTE_LIMIT, type Assessment } from "@/lib/agency/assessment"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import type { Strength, Weight } from "@/lib/agency/types"

/** One requirement, as both the assessor and the scorer need it. */
export interface MatchRequirement {
  id: string
  ref: string
  text: string
  weight: Weight
}

/** What a person sees under "why this role found you". */
export interface RecommendationEvidence {
  requirement_ref: string
  strength: Strength
  /** Verbatim from their own banked claim. Null when strength is missing. */
  quote: string | null
}

/**
 * Render a person's evidence bank as the text the assessor reads.
 *
 * We have no CV for a consumer user — we have the claims they banked, in their
 * own words, plus their own rephrasing where they wrote one. That is what gets
 * assessed, and it is why a quote in a recommendation is always something the
 * person themselves wrote.
 *
 * Hidden cards are excluded: hiding a claim is the person saying "not this
 * one", and honouring that only in the UI would make it decorative.
 */
export function buildProfileText(evidence: EvidenceRow[]): string {
  const visible = evidence
    .filter((e) => !e.hidden)
    .sort((a, b) => a.sort_order - b.sort_order)

  return visible
    .map((e) => {
      const claim = (e.rephrased_text?.trim() || e.claim || "").trim()
      const where = [e.source_role, e.source_company].filter(Boolean).join(", ")
      const span = e.source_span?.trim()
      const context = [where, span].filter(Boolean).join(" · ")
      return context ? `${claim}\n  (${context})` : claim
    })
    .filter((line) => line.trim().length > 0)
    .join("\n\n")
}

/**
 * Identity of what we assessed, for skip-on-unchanged.
 *
 * Hashes the rendered text rather than row ids or timestamps: reordering the
 * bank or re-saving a card without changing a word must not trigger a rescan,
 * and editing a single claim must.
 */
export function profileHash(evidence: EvidenceRow[]): string {
  return createHash("sha256").update(buildProfileText(evidence)).digest("hex")
}

/**
 * Stable identity for a role's requirement set, same reasoning.
 *
 * THE canonicalisation. Its output is stored in published_roles and
 * role_matching and compared at apply time, so publish and apply must call
 * THIS function — a second implementation that merely looks identical is how
 * ROL-2403's apply 409'd forever: the copies differed only in invisible
 * separator bytes. Changing the canonical form strands every live snapshot.
 */
export function requirementsHash(
  requirements: Array<Pick<MatchRequirement, "ref" | "weight" | "text">>
): string {
  const canonical = [...requirements]
    .sort((a, b) => (a.ref < b.ref ? -1 : 1))
    .map((r) => `${r.ref} ${r.weight} ${r.text.trim()}`)
    .join("")
  return createHash("sha256").update(canonical).digest("hex")
}

/**
 * Score an assessment the way the recruiter's own pipeline would.
 *
 * `overrides` and `softSignals` are not parameters. They are forced empty,
 * because there is no recruiter here to have formed a view — inventing one
 * would make the threshold mean something different on this path than on the
 * one it was set against.
 */
export function scoreForMatching(
  assessment: Assessment,
  requirements: MatchRequirement[]
): ScoreResult {
  const byRef = new Map(assessment.evidence.map((e) => [e.requirement_ref, e]))

  const evidence: Record<string, Strength> = {}
  for (const req of requirements) {
    evidence[req.id] = byRef.get(req.ref)?.strength ?? "missing"
  }

  const scoringRequirements: ScoringRequirement[] = requirements.map((r) => ({
    id: r.id,
    ref: r.ref,
    weight: r.weight,
  }))

  return computeScore({
    requirements: scoringRequirements,
    evidence,
    overrides: {},
    softSignals: {},
    baselines: {
      seniority: assessment.calibration.seniority,
      contextFit: assessment.calibration.context_fit,
      confidence: assessment.calibration.confidence,
      confidenceLevel: assessment.calibration.confidence_level,
    },
    reviewed: false,
  })
}

/**
 * The evidence map the person sees, shaped to satisfy
 * `matching_evidence_is_well_formed` in the database.
 *
 * MISSING renders explicitly and is never filled with inferred content. The
 * database constraint is the backstop; this is the enforcement point — so a
 * strength of `missing` loses its quote here, and a non-missing strength
 * arriving with an empty quote is demoted to `missing` rather than shown as
 * evidence that does not exist.
 */
export function toRecommendationEvidence(
  assessment: Assessment,
  requirements: MatchRequirement[]
): RecommendationEvidence[] {
  const byRef = new Map(assessment.evidence.map((e) => [e.requirement_ref, e]))

  return requirements.map((req) => {
    const found = byRef.get(req.ref)
    const quote = (found?.quote ?? "").trim().slice(0, QUOTE_LIMIT)
    const strength: Strength = found?.strength ?? "missing"

    // Both directions, exactly as the DB constraint states them.
    if (strength === "missing" || quote === "") {
      return { requirement_ref: req.ref, strength: "missing", quote: null }
    }
    return { requirement_ref: req.ref, strength, quote }
  })
}

export interface ScannedPerson {
  userId: string
  score: ScoreResult
  evidence: RecommendationEvidence[]
  profileHash: string
}

/**
 * THE FLOOR: a recommendation must have a reason in it.
 *
 * The score is five weighted categories, and three of them — seniority,
 * context fit, confidence — are the model's calibration judgement, worth 30%
 * between them and entirely independent of whether any evidence matched. So
 * anyone assessed has a floor well above zero: the first real recommendation
 * this product ever produced scored 10.5 with **coverage 0, evidence strength
 * 0, 0 of 5 must-haves and all ten requirements MISSING**. A role "found"
 * somebody it had no reason to find.
 *
 * The consumer card answers "why you" with quoted evidence. A recommendation
 * with nothing to put there is not a low-confidence match, it is a false one.
 * So clearing the threshold is necessary and not sufficient:
 *
 *   1. At least one requirement answered with real evidence.
 *   2. At least one must-have hit — but ONLY when the role has must-haves.
 *      A role of nothing but nice-to-haves would otherwise match nobody, ever,
 *      which is a silent dead end rather than a high bar.
 *
 * This does not reject anyone. Nobody is told, nothing is recorded against
 * them, and the outcome is the same silence they would have had. It narrows
 * what we are willing to *claim*, which is a statement about us.
 */
export function meetsMatchFloor(
  score: Pick<ScoreResult, "must_have_hit" | "must_have_total">,
  evidence: RecommendationEvidence[]
): boolean {
  const hasEvidence = evidence.some((e) => e.strength !== "missing")
  if (!hasEvidence) return false
  if (score.must_have_total === 0) return true
  return score.must_have_hit >= 1
}

/**
 * Who clears the bar.
 *
 * Everyone else is simply not recommended. Nobody is rejected, nobody is
 * recorded as having failed, and nobody is told anything — they were never
 * told a scan was running. This is the one place the recruiter's number is
 * applied, and it is applied to a score, never to a person.
 */
export function selectMatches(scanned: ScannedPerson[], minScore: number): ScannedPerson[] {
  return scanned
    .filter((p) => p.score.overall >= minScore && meetsMatchFloor(p.score, p.evidence))
    .sort((a, b) => b.score.overall - a.score.overall || (a.userId < b.userId ? -1 : 1))
}
