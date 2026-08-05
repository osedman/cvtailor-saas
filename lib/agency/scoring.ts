/**
 * Server-side scoring engine for Tailr for Agencies.
 *
 * Port of the design handoff's computeScore() reference (data.js §13/§17).
 * This is the ONLY implementation — the frontend never computes scores, and
 * submission generation refuses to render when inputsHash() disagrees with the
 * stored score_breakdowns row.
 */

import { createHash } from "crypto"
import type { Strength, Weight } from "./types"

export const ENGINE_VERSION = "v1"

const STRENGTH_VALUE: Record<Strength, number> = {
  strong: 1.0,
  transferable: 0.7,
  partial: 0.4,
  missing: 0.0,
}

const WEIGHT_MULTIPLIER: Record<Weight, number> = {
  must: 3,
  important: 2,
  nice: 1,
}

// Category weights: coverage 45 / evidence 25 / seniority 10 / context 10 /
// confidence 10. Changing any of these is a new ENGINE_VERSION.
const CATEGORY_WEIGHTS = {
  requirement_coverage: 0.45,
  evidence_strength: 0.25,
  seniority_calibration: 0.1,
  context_fit: 0.1,
  confidence_completeness: 0.1,
} as const

export interface ScoringRequirement {
  id: string
  ref: string
  weight: Weight
}

/** Per-candidate baselines judged by the CV parse; stable across overrides. */
export interface ScoringBaselines {
  seniority: number        // 0-100
  contextFit: number       // 0-100
  confidence: number       // 0-100
  confidenceLevel: 1 | 2 | 3 | 4
}

export interface ScoringInput {
  requirements: ScoringRequirement[]
  /** Parsed evidence strength per requirement id; absent = missing. */
  evidence: Record<string, Strength>
  /** Recruiter overrides per requirement id (win over evidence). */
  overrides: Record<string, Strength>
  baselines: ScoringBaselines
  softSignals: { communication?: number | null; motivation?: number | null }
  reviewed: boolean
}

export interface ScoreResult {
  overall: number
  requirement_coverage: number
  evidence_strength: number
  seniority_calibration: number
  context_fit: number
  confidence_completeness: number
  must_have_hit: number
  must_have_total: number
  confidence_level: 1 | 2 | 3 | 4
  effective: Record<string, Strength>
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n))
const round2 = (n: number) => Math.round(n * 100) / 100

export function computeScore(input: ScoringInput): ScoreResult {
  const effective: Record<string, Strength> = {}
  for (const req of input.requirements) {
    effective[req.id] = input.overrides[req.id] ?? input.evidence[req.id] ?? "missing"
  }

  let weightedSum = 0
  let weightTotal = 0
  let notMissing = 0
  let mustHit = 0
  let mustTotal = 0
  for (const req of input.requirements) {
    const strength = effective[req.id]
    const mult = WEIGHT_MULTIPLIER[req.weight]
    weightedSum += STRENGTH_VALUE[strength] * mult
    weightTotal += mult
    if (strength !== "missing") notMissing++
    if (req.weight === "must") {
      mustTotal++
      if (strength !== "missing") mustHit++
    }
  }

  const coverage = weightTotal > 0 ? (weightedSum / weightTotal) * 100 : 0
  const evidenceStrength =
    input.requirements.length > 0 ? (notMissing / input.requirements.length) * 100 : 0

  // Soft signals move context fit: each point of motivation away from neutral
  // (3) is ±6; communication ±4.
  const motivation = input.softSignals.motivation ?? null
  const communication = input.softSignals.communication ?? null
  let contextFit = input.baselines.contextFit
  if (motivation != null) contextFit += (motivation - 3) * 6
  if (communication != null) contextFit += (communication - 3) * 4

  const confidence = input.baselines.confidence + (input.reviewed ? 12 : 0)

  const categories = {
    requirement_coverage: round2(clamp(coverage)),
    evidence_strength: round2(clamp(evidenceStrength)),
    seniority_calibration: round2(clamp(input.baselines.seniority)),
    context_fit: round2(clamp(contextFit)),
    confidence_completeness: round2(clamp(confidence)),
  }

  const overall = round2(
    (Object.keys(CATEGORY_WEIGHTS) as Array<keyof typeof CATEGORY_WEIGHTS>).reduce(
      (sum, key) => sum + categories[key] * CATEGORY_WEIGHTS[key],
      0
    )
  )

  const confidenceLevel = Math.min(
    4,
    input.baselines.confidenceLevel + (input.reviewed ? 1 : 0)
  ) as 1 | 2 | 3 | 4

  return {
    overall,
    ...categories,
    must_have_hit: mustHit,
    must_have_total: mustTotal,
    confidence_level: confidenceLevel,
    effective,
  }
}

/** Deterministic JSON: objects with sorted keys, so hashes are byte-stable. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`
}

/**
 * The staleness check. Hashes every input that can change a score; submission
 * generation recomputes this and refuses to render when it differs from the
 * stored row's inputs_hash.
 */
export function inputsHash(input: ScoringInput): string {
  return createHash("sha256")
    .update(
      canonical({
        engine: ENGINE_VERSION,
        requirements: [...input.requirements].sort((a, b) =>
          a.ref < b.ref ? -1 : 1
        ),
        evidence: input.evidence,
        overrides: input.overrides,
        baselines: input.baselines,
        softSignals: {
          communication: input.softSignals.communication ?? null,
          motivation: input.softSignals.motivation ?? null,
        },
        reviewed: input.reviewed,
      })
    )
    .digest("hex")
}

/** sha256 identity hash for dedupe + notice suppression. Never store raw. */
export function identityHash(email: string | null, fullName?: string): string | null {
  const key = email?.trim().toLowerCase() || fullName?.trim().toLowerCase() || ""
  if (!key) return null
  return createHash("sha256").update(key).digest("hex")
}
