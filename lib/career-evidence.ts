import {
  CAREER_EVIDENCE_CATEGORIES,
  type CareerEvidenceCard,
  type CareerEvidenceCategory,
} from '@/lib/anthropic'
import type { createClient } from '@/lib/supabase/server'

/**
 * Evidence-bank helpers for the Career Arc rebuild. Everything here is pure and
 * deterministic so the truth boundary is unit-testable: the model proposes,
 * these functions decide what is allowed to persist.
 */

export const MAX_EVIDENCE_CARDS = 16
export const MAX_CLAIM_LENGTH = 300
export const MIN_CLAIM_LENGTH = 20

/** Lowercase and collapse all whitespace runs so matching survives reformatting. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Digit-bearing tokens (figures, percentages, money, years) with commas stripped. */
export function numberTokens(text: string): string[] {
  return (text.match(/[£$€]?\d[\d,.]*[km%]?/gi) ?? []).map((t) =>
    t.replace(/,/g, '').replace(/\.$/, '').toLowerCase(),
  )
}

/** True when `text` appears in `cv` ignoring case and whitespace differences. */
export function isSubstringOfCv(cv: string, text: string): boolean {
  const needle = normalizeForMatch(text)
  return needle.length > 0 && normalizeForMatch(cv).includes(needle)
}

/** 1-based line number of the first CV line containing `text`, or null. */
export function findCvLine(cv: string, text: string): number | null {
  const needle = normalizeForMatch(text)
  if (!needle) return null
  const lines = cv.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (normalizeForMatch(lines[i]).includes(needle)) return i + 1
  }
  return null
}

function isCategory(value: unknown): value is CareerEvidenceCategory {
  return typeof value === 'string' && (CAREER_EVIDENCE_CATEGORIES as readonly string[]).includes(value)
}

export interface EvidenceAudit {
  cards: CareerEvidenceCard[]
  /** Aggregate outcome counts (kept / drop reasons) — safe to log, contains no content. */
  outcomes: Record<string, number>
}

/**
 * Filter model-proposed evidence cards down to what the CV can prove, and
 * report why each raw card was kept or dropped. Drops (never repairs) any card
 * whose figures are not literally in the CV — empty over guessed, per the
 * no-invention contract.
 */
export function auditEvidenceCards(raw: unknown, cv: string): EvidenceAudit {
  if (!Array.isArray(raw)) return { cards: [], outcomes: { not_an_array: 1 } }
  const cvNorm = normalizeForMatch(cv).replace(/,/g, '')
  const cvLineCount = cv.split('\n').length
  const seen = new Set<string>()
  const cards: CareerEvidenceCard[] = []
  const outcomes: Record<string, number> = {}
  const count = (reason: string) => {
    outcomes[reason] = (outcomes[reason] ?? 0) + 1
  }

  for (const item of raw) {
    if (cards.length >= MAX_EVIDENCE_CARDS) {
      count('over_cap')
      continue
    }
    if (!item || typeof item !== 'object') {
      count('bad_shape')
      continue
    }
    const { category, claim, sourceRole, sourceCompany, sourceSpan, cvLine } = item as Record<string, unknown>

    if (!isCategory(category)) {
      count('bad_category')
      continue
    }
    if (typeof claim !== 'string') {
      count('bad_shape')
      continue
    }
    const trimmed = claim.trim()
    if (trimmed.length < MIN_CLAIM_LENGTH || trimmed.length > MAX_CLAIM_LENGTH) {
      count('claim_length')
      continue
    }
    if (/[<>]/.test(trimmed)) {
      count('markup')
      continue
    }

    // No-invention guard: every figure in the claim must appear literally in the CV.
    const figures = numberTokens(trimmed)
    if (!figures.every((f) => cvNorm.includes(f))) {
      count('figure_not_in_cv')
      continue
    }
    // A quant card without a figure is a category error — drop it.
    if (category === 'quant' && figures.length === 0) {
      count('quant_no_figure')
      continue
    }

    const key = normalizeForMatch(trimmed)
    if (seen.has(key)) {
      count('duplicate')
      continue
    }
    seen.add(key)
    count('kept')

    const line = typeof cvLine === 'number' && Number.isInteger(cvLine) && cvLine >= 1 && cvLine <= cvLineCount ? cvLine : null

    cards.push({
      category,
      claim: trimmed,
      sourceRole: typeof sourceRole === 'string' ? sourceRole.trim().slice(0, 120) : '',
      sourceCompany: typeof sourceCompany === 'string' ? sourceCompany.trim().slice(0, 120) : '',
      sourceSpan: typeof sourceSpan === 'string' ? sourceSpan.trim().slice(0, 40) : '',
      cvLine: line,
    })
  }
  return { cards, outcomes }
}

export function validateEvidenceCards(raw: unknown, cv: string): CareerEvidenceCard[] {
  return auditEvidenceCards(raw, cv).cards
}

/**
 * A rephrase may change wording only. Reject anything that introduces a figure
 * the original claim doesn't contain, or that drifts outside sane length bounds.
 */
export function validateRephrase(original: string, candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null
  const trimmed = candidate.trim()
  if (trimmed.length < MIN_CLAIM_LENGTH || trimmed.length > MAX_CLAIM_LENGTH) return null
  if (/[<>]/.test(trimmed)) return null
  const allowed = new Set(numberTokens(original))
  if (!numberTokens(trimmed).every((f) => allowed.has(f))) return null
  return trimmed
}

/**
 * "Used in N CVs", computed from tailor history at read time (never stored).
 * A history row uses a card when its tailored output keeps the claim's figures
 * and most of its distinctive words — tailoring rewrites phrasing, so exact
 * substring matching would undercount to zero.
 */
export function claimUsedInText(claim: string, normalizedText: string): boolean {
  const figures = numberTokens(claim)
  const textNoCommas = normalizedText.replace(/,/g, '')
  if (!figures.every((f) => textNoCommas.includes(f))) return false

  const words = Array.from(
    new Set(
      normalizeForMatch(claim)
        .replace(/[^a-z0-9£$€% ]/g, ' ')
        .split(' ')
        .filter((w) => w.length >= 4 && !/^\d/.test(w)),
    ),
  )
  if (words.length === 0) return figures.length > 0
  const hits = words.filter((w) => normalizedText.includes(w)).length
  return hits / words.length >= 0.6
}

/** How many tailored CVs used at least one of these cards — the reuse stat. */
export function countCvsUsingAny(
  cards: Array<{ claim: string; rephrased_text: string | null }>,
  historyTexts: string[],
): number {
  const claims = cards.map((c) => c.rephrased_text ?? c.claim)
  return historyTexts.filter((t) => {
    const normalized = normalizeForMatch(t)
    return claims.some((claim) => claimUsedInText(claim, normalized))
  }).length
}

export function computeUsageCounts(
  cards: Array<{ id: string; claim: string; rephrased_text: string | null }>,
  historyTexts: string[],
): Record<string, number> {
  const normalized = historyTexts.map((t) => normalizeForMatch(t))
  const counts: Record<string, number> = {}
  for (const card of cards) {
    const effective = card.rephrased_text ?? card.claim
    counts[card.id] = normalized.filter((t) => claimUsedInText(effective, t)).length
  }
  return counts
}

/**
 * The fullest substantive CV among recent runs, '' when none qualifies.
 * Recency window first, length within it: a burst of test runs with a thin CV
 * must not displace the user's real CV sitting a few runs back.
 */
export function pickFullestCv(cvs: Array<string | null>, minLength: number): string {
  let best = ''
  for (const cv of cvs) {
    const text = cv ?? ''
    if (text.trim().length < minLength) continue
    if (text.length > best.length) best = text
  }
  return best
}

/** Fullest substantive CV from the user's 10 most recent tailor runs. */
export async function resolveStoredCv(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  minLength: number,
): Promise<string> {
  const { data: rows, error } = await supabase
    .from('tailor_history')
    .select('original_cv')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  return pickFullestCv((rows ?? []).map((r: { original_cv: string | null }) => r.original_cv), minLength)
}
