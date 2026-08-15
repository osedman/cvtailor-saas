/**
 * Stage 1 of the quiet-matching scan: narrow the pool without a model call.
 *
 * The scan runs over every opted-in consumer user. Assessing all of them
 * properly would mean one model call per person per scan, which does not
 * survive contact with a real user base. So a cheap deterministic pass ranks
 * people on keyword signal, and only the top slice goes to the real
 * `extractAssessment` in stage 2.
 *
 * WHAT THIS IS NOT
 *
 * This is not a score, and it is not a decision. It reuses
 * `scoreCardAgainstRequirement` from the consumer tailor sidebar — a keyword
 * and stem-overlap heuristic — which is systematically wrong in both
 * directions and cannot see transferable experience described in unfamiliar
 * words. Nobody is rejected here. Someone below the cut was not assessed this
 * cycle; they are told nothing, because they were never told a scan was
 * happening at all.
 *
 * The number a recruiter sets their threshold against is stage 2's, from the
 * same engine that scores the candidates they upload themselves. That is the
 * whole reason `lib/agency/assessment.ts` exists as one shared module.
 */

import { scoreCardAgainstRequirement } from "@/lib/career-arc-tailor-match"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import type { RequirementMapping } from "@/lib/anthropic"
import type { Weight } from "@/lib/agency/types"
import { PREFILTER_KEEP } from "./limits"

/** An agency requirement, in the shape the consumer matcher understands. */
export interface PrefilterRequirement {
  ref: string
  text: string
  weight: Weight
}

export interface PrefilterCandidate {
  userId: string
  /** The person's own evidence bank. Hidden cards are already excluded. */
  evidence: EvidenceRow[]
}

export interface PrefilterHit {
  userId: string
  /** Relative signal only — NOT comparable to a real score, never shown. */
  signal: number
  /** Requirement refs with any keyword signal, for logging and debugging. */
  touched: string[]
}

/**
 * `RequirementMapping` carries a `keywords` array the JD parse produces.
 * Agency requirements have no such field, so the requirement text is its own
 * keyword source. Deliberately not a model call: this stage exists to be free.
 */
function asMapping(req: PrefilterRequirement): RequirementMapping {
  return {
    requirement: req.text,
    type: req.weight === "nice" ? "nice" : "must",
    keywords: [],
    // The two sides of the product name the same idea differently: the
    // consumer `EvidenceStrength` calls it "none", the agency `Strength` calls
    // it "missing". Neither field is read by scoreCardAgainstRequirement — it
    // only uses `requirement` and `keywords` — but the mismatch is exactly the
    // kind of thing that compiles by accident when the two are bridged, so it
    // is spelled out rather than cast away.
    strength: "none",
    evidence: "",
  }
}

/** Must-haves count for more, in the same 3/2/1 ratio the real engine uses. */
const WEIGHT_MULTIPLIER: Record<Weight, number> = { must: 3, important: 2, nice: 1 }

/**
 * Rank a pool against a role's requirements. Returns at most `PREFILTER_KEEP`,
 * highest signal first, dropping anyone with no signal at all.
 *
 * Ties are broken by userId so a scan is reproducible: the same pool and the
 * same requirements must produce the same slice, or a rescan would silently
 * reshuffle who gets assessed.
 */
export function prefilterPool(
  pool: PrefilterCandidate[],
  requirements: PrefilterRequirement[],
  keep: number = PREFILTER_KEEP
): PrefilterHit[] {
  if (requirements.length === 0) return []

  const mapped = requirements.map((req) => ({ req, mapping: asMapping(req) }))

  const hits: PrefilterHit[] = []
  for (const person of pool) {
    if (person.evidence.length === 0) continue

    let signal = 0
    const touched: string[] = []
    for (const { req, mapping } of mapped) {
      // Best single card per requirement, not the sum: ten cards mentioning
      // the same skill is not ten times the evidence, and summing would let a
      // large bank outrank a better-matched small one.
      let best = 0
      for (const card of person.evidence) {
        const score = scoreCardAgainstRequirement(mapping, card)
        if (score > best) best = score
      }
      if (best > 0) {
        signal += best * WEIGHT_MULTIPLIER[req.weight]
        touched.push(req.ref)
      }
    }

    if (signal > 0) hits.push({ userId: person.userId, signal, touched })
  }

  hits.sort((a, b) => (b.signal - a.signal) || (a.userId < b.userId ? -1 : 1))
  return hits.slice(0, Math.max(0, keep))
}
