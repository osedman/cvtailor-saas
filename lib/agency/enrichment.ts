/**
 * What a round added to the record.
 *
 * The hiring manager writes up what happened. Until now that prose sat on the
 * round and went no further: the candidate's evidence map looked exactly the
 * same after two interviews as it did after the CV, and `round-delta.ts` says
 * so in its own header — "when enrichment ships and rounds start moving
 * strengths, the CHANGED lane fills from real strength transitions".
 *
 * This is that. It reads a write-up and produces evidence rows keyed to the
 * role's requirements, in the same shape the CV produces, so a round becomes
 * a layer of the record rather than a note beside it.
 *
 * ── The lines this inherits, none of them new ────────────────────────────
 *
 * VERBATIM OR NOTHING. A quote is a span of the write-up, copied. The model
 * chooses which requirement a sentence speaks to; it never writes the
 * sentence. `verifyQuote` refuses anything that is not actually in the source
 * text, because a paraphrase attributed to the hiring manager is a sentence
 * they did not write appearing in a record that says they did.
 *
 * MISSING IS NOT WRITTEN. Enrichment only ever ADDS a layer where the round
 * said something. A requirement the interview did not touch gets no row at
 * all, and the CV layer underneath keeps speaking for it. This is why there
 * is no 'missing' branch here: a round that did not cover a requirement has
 * not discovered an absence, it simply did not ask.
 *
 * NO INFERENCE ABOUT A PERSON. Strengths describe how well the EVIDENCE meets
 * a requirement, exactly as the CV pass does. Nothing here reads tone,
 * confidence or fit, and the forbidden-term guard from the recommendation
 * work is reused rather than re-implemented.
 *
 * IT IS NOT A DECISION. Writing evidence moves a score, because the score is
 * derived from evidence — but it decides nothing about anybody, removes
 * nobody, and a recruiter override still beats every layer.
 *
 * REVERSIBLE BY CONSTRUCTION. Rows carry `origin='interview'` and the
 * `round_id`, which is what lets consent withdrawal delete precisely what a
 * round produced and rescore back to the layer underneath — a cascade that
 * has existed in consent.ts since August, waiting for something to cascade.
 */

import type { Strength, Weight } from "./types"
import { forbiddenTerm } from "./recommendation"

export interface EnrichmentRequirement {
  id: string
  ref: string
  text: string
  weight: Weight
}

/** One row the model proposes, before any of it is believed. */
export interface RawEnrichmentFinding {
  requirement_ref?: unknown
  quote?: unknown
  strength?: unknown
}

export interface EnrichmentFinding {
  requirementId: string
  requirementRef: string
  strength: Strength
  quote: string
}

export const QUOTE_CAP = 1000
export const MAX_FINDINGS = 12

const STRENGTHS: Strength[] = ["strong", "transferable", "partial", "missing"]

/**
 * Is this quote actually in the write-up?
 *
 * Whitespace is normalised on both sides — a model reflowing a line break is
 * not a fabrication — but nothing else is. No fuzzy matching, no longest
 * common substring: either the recruiter can find those words in what the
 * hiring manager wrote, or the row does not exist.
 */
export function verifyQuote(quote: string, source: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()
  const q = norm(quote)
  if (q.length < 12) return false
  return norm(source).includes(q)
}

/**
 * Turn what the model proposed into rows worth writing.
 *
 * Everything is dropped rather than repaired: an unknown requirement, an
 * invented quote, a strength outside the enum, a 'missing' claim, prose about
 * a person, a duplicate requirement. A round that produces nothing usable
 * produces no rows, which is a correct outcome and not an error.
 */
export function validateFindings(
  raw: RawEnrichmentFinding[],
  requirements: EnrichmentRequirement[],
  writeUp: string
): { findings: EnrichmentFinding[]; dropped: string[] } {
  const byRef = new Map(requirements.map((r) => [r.ref.toUpperCase(), r]))
  const seen = new Set<string>()
  const findings: EnrichmentFinding[] = []
  const dropped: string[] = []

  for (const item of Array.isArray(raw) ? raw : []) {
    const ref = typeof item.requirement_ref === "string" ? item.requirement_ref.trim().toUpperCase() : ""
    const req = byRef.get(ref)
    if (!req) {
      dropped.push(`${ref || "(no ref)"}: not a requirement on this role`)
      continue
    }
    if (seen.has(req.id)) {
      // One row per requirement per round — the database refuses a second,
      // and two findings about one requirement is a contradiction rather
      // than a nuance.
      dropped.push(`${ref}: already covered by an earlier finding`)
      continue
    }

    const strength = typeof item.strength === "string" ? (item.strength.trim().toLowerCase() as Strength) : ("" as Strength)
    if (!STRENGTHS.includes(strength)) {
      dropped.push(`${ref}: strength "${String(item.strength)}" is not one of the four`)
      continue
    }
    if (strength === "missing") {
      // A round that did not cover a requirement has not found an absence.
      // The CV layer underneath keeps speaking for it.
      dropped.push(`${ref}: a round never writes MISSING`)
      continue
    }

    const quote = typeof item.quote === "string" ? item.quote.trim().slice(0, QUOTE_CAP) : ""
    if (!quote) {
      dropped.push(`${ref}: no quote`)
      continue
    }
    if (!verifyQuote(quote, writeUp)) {
      dropped.push(`${ref}: quote is not in the write-up`)
      continue
    }
    const bad = forbiddenTerm(quote)
    if (bad) {
      // The hiring manager may have written it, but it is not evidence about
      // a requirement, and it must not enter the evidence map as though it
      // were. It stays in their write-up, where they wrote it.
      dropped.push(`${ref}: the quote describes the person ("${bad}")`)
      continue
    }

    seen.add(req.id)
    findings.push({ requirementId: req.id, requirementRef: req.ref, strength, quote })
    if (findings.length >= MAX_FINDINGS) break
  }

  return { findings, dropped }
}

/** The rows, ready for insert. Shape mirrors what ingest writes for a CV. */
export function evidenceRows(
  findings: EnrichmentFinding[],
  ctx: { agencyId: string; candidateId: string; roundId: string; roundNumber: number }
) {
  return findings.map((f) => ({
    agency_id: ctx.agencyId,
    candidate_id: ctx.candidateId,
    requirement_id: f.requirementId,
    strength: f.strength,
    quote: f.quote,
    // Where a recruiter can go to read it in full.
    source_cite: `Interview · round ${ctx.roundNumber} · write-up`,
    origin: "interview" as const,
    round_id: ctx.roundId,
  }))
}
