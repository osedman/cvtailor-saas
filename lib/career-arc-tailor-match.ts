import type { RequirementMapping } from '@/lib/anthropic'
import { normalizeForMatch, type EvidenceRow } from '@/lib/career-arc-ledger'

/**
 * Deterministic evidence↔requirement matching for the tailor sidebar
 * (rebuild stage 5, screen 05).
 *
 * Runs entirely on data the tailor result already carries plus the user's
 * evidence bank — no model call, no change to the tailor pipeline. The match
 * score and requirement strengths remain the extract pass's verdict; this
 * only adds traceability: WHICH evidence card backs which requirement.
 */

export interface EvidenceRef {
  id: string
  /** Stable chip label from the card's position in the bank: "EV·03". */
  label: string
  /** Short claim snippet for the "pulled from EV·03 · …" sub-line. */
  snippet: string
}

export interface RequirementRow {
  requirement: string
  type: RequirementMapping['type']
  strength: RequirementMapping['strength']
  /** Counted toward the meter — the extract pass's verdict, not ours. */
  covered: boolean
  matches: EvidenceRef[]
}

export interface NamedGap {
  requirement: string
  /** What the add-to-path button submits; ≤80 chars per the add-skill API. */
  skill: string
  isMust: boolean
}

export interface EvidenceMatchSummary {
  rows: RequirementRow[]
  total: number
  covered: number
  /** Covered requirements traceable to at least one evidence card. */
  pulled: number
  /** Covered requirements with no bank card behind them (CV-implied). */
  implied: number
  gaps: NamedGap[]
}

const STOPWORDS = new Set([
  'with', 'from', 'that', 'this', 'have', 'been', 'over', 'into', 'across',
  'through', 'their', 'them', 'they', 'were', 'will', 'would', 'your', 'more',
  'than', 'each', 'while', 'where', 'when', 'ability', 'experience', 'strong',
  'skills', 'working', 'knowledge', 'understanding', 'proven', 'track', 'record',
])

/** Light stemming: plural/verb suffixes collapse so "automations" meets
 * "automation" and "integrating" meets "integration"-adjacent roots. */
function stem(word: string): string {
  return word
    .replace(/(?:ations|ation)$/, 'ate')
    .replace(/(?:ies)$/, 'y')
    .replace(/(?:ing|ed|es)$/, '')
    .replace(/s$/, '')
}

function tokens(text: string): Set<string> {
  return new Set(
    normalizeForMatch(text)
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(' ')
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
      .map(stem),
  )
}

function snippetOf(card: EvidenceRow): string {
  const text = card.rephrased_text ?? card.claim
  return text.length > 44 ? text.slice(0, 43).trimEnd() + '…' : text
}

/** Score one card against one requirement. Keyword phrases dominate. */
export function scoreCardAgainstRequirement(req: RequirementMapping, card: EvidenceRow): number {
  const cardText = normalizeForMatch(card.rephrased_text ?? card.claim)
  let keywordHits = 0
  for (const kw of req.keywords ?? []) {
    const phrase = normalizeForMatch(kw)
    if (phrase.length >= 3 && cardText.includes(phrase)) keywordHits++
  }
  const reqTokens = tokens(`${req.requirement} ${(req.keywords ?? []).join(' ')}`)
  const cardTokens = tokens(cardText)
  let overlap = 0
  for (const t of reqTokens) if (cardTokens.has(t)) overlap++
  return keywordHits * 3 + overlap
}

const MATCH_THRESHOLD = 3
const MAX_MATCHES_PER_REQUIREMENT = 2

export function matchEvidenceToRequirements(
  requirements: RequirementMapping[],
  evidence: EvidenceRow[],
): EvidenceMatchSummary {
  const bank = [...evidence]
    .filter((e) => !e.hidden)
    .sort((a, b) => a.sort_order - b.sort_order)
  const labels = new Map(bank.map((card, i) => [card.id, `EV·${String(i + 1).padStart(2, '0')}`]))

  const rows: RequirementRow[] = requirements.map((req) => {
    const scored = bank
      .map((card) => ({ card, score: scoreCardAgainstRequirement(req, card) }))
      .filter(({ score }) => score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES_PER_REQUIREMENT)
    return {
      requirement: req.requirement,
      type: req.type,
      strength: req.strength,
      covered: req.strength === 'strong' || req.strength === 'transferable',
      matches: scored.map(({ card }) => ({ id: card.id, label: labels.get(card.id)!, snippet: snippetOf(card) })),
    }
  })

  const covered = rows.filter((r) => r.covered)
  const gaps: NamedGap[] = requirements
    .filter((r) => r.strength === 'partial' || r.strength === 'none')
    .map((r) => ({
      requirement: r.requirement,
      skill: (r.keywords?.[0]?.trim() || r.requirement).slice(0, 80),
      isMust: r.type === 'must',
    }))

  return {
    rows,
    total: rows.length,
    covered: covered.length,
    pulled: covered.filter((r) => r.matches.length > 0).length,
    implied: covered.filter((r) => r.matches.length === 0).length,
    gaps,
  }
}
