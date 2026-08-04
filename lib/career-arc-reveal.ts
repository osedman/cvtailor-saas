import type { CareerProfileSections } from '@/lib/anthropic'
import type { EvidenceRow } from '@/lib/career-arc-ledger'
import { displayFigure, pickDominantFigure } from '@/lib/career-arc-cards'

/**
 * The reveal, rebuilt around evidence (Aug 3).
 *
 * The old reveal predated the evidence bank: it opened on a role line and ran
 * on stats/achievements/qualities, none of which the ledger page shows any
 * more. This version makes the reveal an argument for the page it opens —
 * it starts and ends on the proof count, and its one big number is a real
 * evidence card with its source named underneath.
 *
 * Every beat is conditional on data that actually exists. A thin profile gets
 * a short reveal, never a padded one.
 */

export type RevealSlide =
  | { kind: 'proofs'; count: number }
  | { kind: 'span'; years: number; roles: number }
  | { kind: 'origin'; text: string }
  | { kind: 'climb'; from: string; to: string; roleCount: number }
  | { kind: 'number'; figure: string; claim: string; source: string; cvLine: number | null }
  | { kind: 'final'; firstName: string; count: number }

/** Ink slides are cinematic, cream slides breathe — alternated by weight. */
export function isDarkSlide(slide: RevealSlide): boolean {
  return slide.kind === 'proofs' || slide.kind === 'climb' || slide.kind === 'number' || slide.kind === 'final'
}

function statValue(sections: CareerProfileSections, pattern: RegExp): number | null {
  const stat = sections.stats?.find((s) => pattern.test(s.label))
  if (!stat) return null
  const n = parseInt(String(stat.value).trim(), 10)
  return Number.isNaN(n) ? null : n
}

export function buildRevealSlides(
  sections: CareerProfileSections,
  evidence: EvidenceRow[],
  usage: Record<string, number> = {},
): RevealSlide[] {
  const visible = (evidence ?? []).filter((e) => !e.hidden)
  const count = visible.length
  const slides: RevealSlide[] = []

  // 1 — the thesis, stated in one number
  if (count > 0) slides.push({ kind: 'proofs', count })

  // 2 — the span, only when both halves are real
  const years = sections.growth?.tenureYears ?? statValue(sections, /year/i)
  const roles = sections.timeline?.length ?? statValue(sections, /role/i) ?? 0
  if (years && roles > 0) {
    slides.push({ kind: 'span', years: Math.round(years), roles })
  }

  // 3 — their own words, untouched
  const origin = sections.story?.origin?.trim()
  if (origin) slides.push({ kind: 'origin', text: origin })

  // 4 — the climb, same line as the arc page draws
  const timeline = sections.timeline ?? []
  if (timeline.length >= 2) {
    slides.push({
      kind: 'climb',
      from: sections.growth?.fromTitle || timeline[0].title,
      to: sections.growth?.toTitle || timeline[timeline.length - 1].title,
      roleCount: timeline.length,
    })
  }

  // 5 — one number, and where it came from. Most-reused card wins; ties break
  // toward the pinned one, then bank order.
  const quantCards = visible
    .filter((c) => pickDominantFigure(c.rephrased_text ?? c.claim) !== null)
    .sort((a, b) =>
      (usage[b.id] ?? 0) - (usage[a.id] ?? 0) ||
      (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      a.sort_order - b.sort_order,
    )
  const hero = quantCards[0]
  if (hero) {
    const text = hero.rephrased_text ?? hero.claim
    slides.push({
      kind: 'number',
      figure: displayFigure(pickDominantFigure(text)!),
      claim: text,
      source: [hero.source_role, hero.source_company].filter(Boolean).join(' · '),
      cvLine: hero.cv_line,
    })
  }

  // 6 — the stamp, and into the ledger
  slides.push({
    kind: 'final',
    firstName: (sections.identity?.name ?? '').trim().split(/\s+/)[0] ?? '',
    count,
  })

  return slides
}
