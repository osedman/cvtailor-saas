import type { CareerProfileSections } from '@/lib/anthropic'
import type { EvidenceRow } from '@/lib/career-arc-ledger'
import {
  bandFigureWord,
  buildPublicArc,
  type ClaimRedaction,
  type ShareSettings,
} from '@/lib/career-arc-share'

/**
 * Share-card models (rebuild stage 4, screen 04).
 *
 * Pure derivation: the SVG preview and the canvas rasteriser both render from
 * these models, so what you download is exactly what you previewed. The same
 * never-fake rules as the rest of the arc apply: the Number card exists only
 * when a quantified claim survives redaction, the Proudest card only when the
 * user pinned something. Sets shrink; they are never padded.
 */

export interface CardPathNode {
  x: number
  y: number
  isCurrent: boolean
}

export interface ShareCard {
  id: 'cover' | 'number' | 'proudest' | 'path' | 'cta'
  eyebrow: string
  /** Redaction-applied display name, uppercase; '' on the CTA card. */
  name: string
  /** Big statement lines, pre-wrapped. Empty for the path card. */
  big: string[]
  /** Font size for the big lines, in 1080-card pixels. */
  bigSize: number
  /** Trailing coral accent: '.' rendered in coral after the last big line. */
  coralDot: boolean
  sub: string
  chip: string
  footLeft: string
  footRight: string
  /** Mini staircase, present on the path card only (1080-card coords). */
  pathNodes?: CardPathNode[]
}

/** Uppercase for card chrome without mangling symbols. */
function up(text: string): string {
  return text.toUpperCase()
}

const FIGURE_RX = /[£$€]\s?\d[\d,.]*\s?(?:k|m|bn|b|million|billion)?\+?|\d+(?:\.\d+)?\s?%|\b\d+(?:,\d{3})*\b/gi

/**
 * The dominant figure of a claim: currency beats percentage beats plain count;
 * within a kind, the longest match wins. Null when the text has no figure.
 */
export function pickDominantFigure(text: string): string | null {
  const all = text.match(FIGURE_RX) ?? []
  if (all.length === 0) return null
  const currency = all.filter((f) => /[£$€]/.test(f))
  const percent = all.filter((f) => /%/.test(f))
  const pool = currency.length ? currency : percent.length ? percent : all
  return pool.sort((a, b) => b.length - a.length)[0].trim()
}

/** "£1.2m" → "£1.2M" — tidy a figure for 60px type. */
export function displayFigure(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/(k|m|b|bn)(\+)?$/i, (_, unit, plus) => unit.toUpperCase() + (plus ?? ''))
}

/** Wrap text into lines of at most maxChars, breaking on spaces only. */
export function wrapBigText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Big-type size (1080px card) for a claim of this length. */
export function proudestSize(text: string): { size: number; maxChars: number } {
  if (text.length <= 42) return { size: 88, maxChars: 12 }
  if (text.length <= 90) return { size: 64, maxChars: 18 }
  return { size: 48, maxChars: 26 }
}

interface CardInputs {
  sections: CareerProfileSections
  evidence: EvidenceRow[]
  settings: ShareSettings
}

export function buildShareCards({ sections, evidence, settings }: CardInputs): ShareCard[] {
  const arc = buildPublicArc({ sections, evidence, settings, sharedOn: '', expiresOn: null })
  const name = up(arc.displayName)
  const foot = { footLeft: 'TAILR.APP', footRight: up(arc.period) }
  const chapters = arc.chapters.length
  const cards: ShareCard[] = []

  // 01 · COVER
  const subBits = [arc.tenureLine ? up(arc.tenureLine) : '', chapters ? `${chapters} CHAPTER${chapters === 1 ? '' : 'S'}` : '', 'ONE LINE'].filter(Boolean)
  cards.push({
    id: 'cover', eyebrow: 'MY CAREER ARC', name,
    big: ['THE', 'PATH'], bigSize: 104, coralDot: true,
    sub: subBits.join(' · '),
    chip: 'NOTHING INVENTED · SOURCED FROM A REAL CV',
    ...foot,
  })

  // 02 · THE NUMBER — only when a quantified claim survives redaction.
  const ordered = [...evidence].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.sort_order - b.sort_order)
  const numberSource = ordered.find((row) => {
    if (row.hidden) return false
    const redaction: ClaimRedaction = settings.claimRedactions[row.id] ?? 'full'
    if (redaction === 'hide') return false
    return row.category === 'quant' && pickDominantFigure(row.rephrased_text ?? row.claim) !== null
  })
  if (numberSource) {
    const redaction: ClaimRedaction = settings.claimRedactions[numberSource.id] ?? 'full'
    const figure = pickDominantFigure(numberSource.rephrased_text ?? numberSource.claim)!
    const banded = redaction === 'band'
    const bigText = banded ? up(bandFigureWord(figure)) : up(displayFigure(figure))
    const source = [numberSource.source_role, settings.hideEmployers ? '' : numberSource.source_company]
      .filter(Boolean).map(up).join(' · ')
    cards.push({
      id: 'number', eyebrow: 'THE NUMBER', name,
      big: wrapBigText(bigText, banded ? 8 : 10), bigSize: banded ? 92 : 116, coralDot: banded,
      sub: source || 'FROM THE EVIDENCE BANK',
      chip: banded
        ? 'THE FACT IS REAL · THE SPECIFICITY WAS THEIR CHOICE'
        : numberSource.cv_line !== null
          ? `SOURCE: A REAL CV, LINE ${numberSource.cv_line} · NOT INVENTED`
          : 'SOURCE: A REAL CV · NOT INVENTED',
      footLeft: 'TAILR.APP',
      footRight: settings.hideDates ? up(arc.tenureLine) : up(numberSource.source_span || arc.period),
    })
  }

  // 03 · PROUDEST WORK — user-pinned, verbatim (post-redaction), never chosen for them.
  const pinned = evidence.find((row) => row.pinned && !row.hidden && (settings.claimRedactions[row.id] ?? 'full') !== 'hide')
  if (pinned) {
    const pinnedRedaction: ClaimRedaction = settings.claimRedactions[pinned.id] ?? 'full'
    const base = pinned.rephrased_text ?? pinned.claim
    const text = pinnedRedaction === 'band'
      ? base.replace(FIGURE_RX, (f) => bandFigureWord(f))
      : base
    const clipped = text.length > 140 ? text.slice(0, 139).trimEnd() + '…' : text
    const { size, maxChars } = proudestSize(clipped)
    const source = [pinned.source_role, settings.hideEmployers ? '' : pinned.source_company].filter(Boolean).map(up).join(' · ')
    cards.push({
      id: 'proudest', eyebrow: 'PROUDEST WORK', name,
      big: wrapBigText(up(clipped), maxChars), bigSize: size, coralDot: false,
      sub: source,
      chip: 'NOTHING INVENTED · VERBATIM FROM THEIR EVIDENCE',
      footLeft: 'TAILR.APP',
      footRight: settings.hideDates ? up(arc.tenureLine) : up(pinned.source_span || arc.period),
    })
  }

  // 04 · THE PATH — mini staircase from the redacted nodes.
  if (arc.nodes.length >= 3) {
    const n = arc.nodes.length
    const X0 = 160, X1 = 856, Y0 = 700, Y1 = 400
    cards.push({
      id: 'path',
      eyebrow: arc.period ? `THE PATH · ${up(arc.period)}` : 'THE PATH',
      name,
      big: [], bigSize: 0, coralDot: false,
      sub: 'CHAPTERS, NOT LEVELS',
      chip: 'SIDEWAYS MOVES & BREAKS ARE ENTRIES TOO',
      ...foot,
      pathNodes: arc.nodes.map((node, i) => ({
        x: X0 + (i * (X1 - X0)) / (n - 1),
        y: Y0 - (i * (Y0 - Y1)) / (n - 1),
        isCurrent: node.isCurrent,
      })),
    })
  }

  // 05 · CTA
  cards.push({
    id: 'cta', eyebrow: 'TAILR', name: '',
    big: ['Your career', 'has an arc', 'too'], bigSize: 72, coralDot: true,
    sub: 'BUILT FROM A REAL CV IN FOUR MINUTES',
    chip: 'NOTHING INVENTED · FREE TO TRY',
    footLeft: 'TAILR.APP', footRight: '→ BUILD YOURS',
  })

  return cards
}
