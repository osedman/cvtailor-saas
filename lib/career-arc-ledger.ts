import type { CareerProfileSections } from '@/lib/anthropic'

/**
 * Pure derivations for the Career Arc ledger view (rebuild stage 2).
 * Everything here is deterministic so the path chart geometry and the
 * at-a-glance numbers are unit-testable without a browser.
 */

export interface EvidenceRow {
  id: string
  category: string
  claim: string
  source_role: string
  source_company: string
  source_span: string
  cv_line: number | null
  pinned: boolean
  hidden: boolean
  rephrased_text: string | null
  sort_order: number
}

/** Chart appears at this many roles; below it, the chapter list carries the page. */
export const PATH_CHART_MIN_ROLES = 3

/**
 * Case/whitespace-insensitive normalisation for text matching. Lives here (a
 * client-safe module) so browser code can match without pulling
 * lib/career-evidence's server-leaning import graph into the bundle;
 * career-evidence re-exports it as the server-side source of truth.
 */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function parseYear(text: string): number | null {
  const m = text?.match(/(19|20)\d{2}/)
  return m ? parseInt(m[0], 10) : null
}

/** "2017 — 2026" from timeline dates; '' when nothing parseable. */
export function arcPeriod(timeline: CareerProfileSections['timeline']): string {
  const years = (timeline ?? []).flatMap((t) => [parseYear(t.start), parseYear(t.end)]).filter((y): y is number => y !== null)
  const hasPresent = (timeline ?? []).some((t) => /present|now|current/i.test(t.end ?? ''))
  if (years.length === 0) return ''
  const lo = Math.min(...years)
  const hi = hasPresent ? new Date().getFullYear() : Math.max(...years)
  return lo === hi ? String(lo) : `${lo} — ${hi}`
}

export interface PathNode {
  x: number
  y: number
  title: string
  sub: string
  year: string
  isCurrent: boolean
  isMilestone: boolean
}

export interface PathLayout {
  width: number
  height: number
  /** Solid staircase line through every role node. */
  linePath: string
  /** Dashed continuation from the you-are-here dot toward the open box. */
  futurePath: string
  nodes: PathNode[]
  here: { x: number; y: number }
  nextBox: { x: number; y: number; w: number; h: number }
}

const W = 980
const H = 250
const X_FIRST = 110
const X_LAST = 690
const X_HERE = 800
const Y_FIRST = 200
const Y_LAST = 64

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, Math.max(1, max - 1)).trimEnd() + '…' : text
}

/**
 * Staircase geometry: evenly spaced nodes ascending bottom-left to top-right,
 * short diagonal risers between levels (the softened-step look of the approved
 * mockup), then a you-are-here dot and a dashed rise to the open next chapter.
 */
export function pathLayout(sections: CareerProfileSections): PathLayout | null {
  const timeline = sections.timeline ?? []
  const n = timeline.length
  if (n < PATH_CHART_MIN_ROLES) return null

  const milestoneYears = new Set((sections.growth?.milestones ?? []).map((m) => m.year))
  const maxTitle = Math.max(8, Math.floor((X_LAST - X_FIRST) / (n - 1) / 6.5))

  const nodes: PathNode[] = timeline.map((role, i) => {
    const year = parseYear(role.start)
    return {
      x: X_FIRST + (i * (X_LAST - X_FIRST)) / (n - 1),
      y: Y_FIRST - (i * (Y_FIRST - Y_LAST)) / (n - 1),
      title: truncate(role.title, maxTitle + 6),
      sub: truncate(role.company, maxTitle + 10),
      year: year ? String(year) : '',
      isCurrent: i === n - 1,
      isMilestone: year !== null && milestoneYears.has(String(year)) && i > 0 && i < n - 1,
    }
  })

  let d = `M 40 ${nodes[0].y} H ${nodes[0].x}`
  for (let i = 1; i < n; i++) {
    const riser = Math.min(34, (nodes[i].x - nodes[i - 1].x) * 0.35)
    d += ` H ${Math.round(nodes[i].x - riser)} L ${Math.round(nodes[i].x - riser / 2.4)} ${nodes[i].y} H ${nodes[i].x}`
  }
  d += ` H ${X_HERE}`

  const futurePath = `M ${X_HERE} ${Y_LAST} Q 830 ${Y_LAST} 848 52 L 880 34`

  return {
    width: W,
    height: H,
    linePath: d,
    futurePath,
    nodes,
    here: { x: X_HERE, y: Y_LAST },
    nextBox: { x: 838, y: 6, w: 132, h: 42 },
  }
}

export interface GlanceStat {
  value: number
  label: string
}

/** The four at-a-glance stats of the approved ledger head. */
export function deriveGlance(
  sections: CareerProfileSections,
  evidence: EvidenceRow[],
  usage: Record<string, number>,
  usedCvCount: number,
): GlanceStat[] {
  const chapters = sections.chapters?.length ?? 0
  const years = sections.growth?.tenureYears ?? null
  const employers = sections.organisations?.length ?? 0
  const visible = evidence.filter((e) => !e.hidden)
  const reuses = visible.reduce((sum, e) => sum + (usage[e.id] ?? 0), 0)

  const stats: GlanceStat[] = []
  if (chapters > 0) {
    stats.push({ value: chapters, label: years ? `Chapters · ${Math.round(years)} years` : 'Chapters' })
  }
  if (employers > 0) stats.push({ value: employers, label: employers === 1 ? 'Employer' : 'Employers' })
  stats.push({ value: visible.length, label: 'Proofs on file' })
  if (reuses > 0) {
    stats.push({ value: reuses, label: usedCvCount > 0 ? `Reuses in ${usedCvCount} CV${usedCvCount === 1 ? '' : 's'}` : 'Reuses across CVs' })
  }
  return stats
}

/** A chapter whose name reads as a career break gets the break treatment. */
export function isBreakChapter(name: string): boolean {
  return /\bbreak\b|carer|caring|sabbatical|parental|career gap/i.test(name)
}

/**
 * Proofs attributable to a chapter, by overlapping the chapter's span with the
 * year on each card's source role. Returns null when the chapter has no
 * parseable span — the badge then shows no count rather than a made-up one.
 */
export function chapterProofCount(
  chapterSpan: string,
  timeline: CareerProfileSections['timeline'],
  evidence: EvidenceRow[],
): number | null {
  const years = (chapterSpan.match(/(19|20)\d{2}/g) ?? []).map(Number)
  if (years.length === 0) return null
  const from = Math.min(...years)
  const to = years.length > 1 ? Math.max(...years) : from

  const rolesInSpan = (timeline ?? []).filter((role) => {
    const start = parseYear(role.start)
    return start !== null && start >= from && start <= to
  })
  if (rolesInSpan.length === 0) return null

  return evidence.filter((card) => {
    if (card.hidden || !card.source_role) return false
    const needle = card.source_role.toLowerCase().slice(0, 18)
    return rolesInSpan.some((role) => role.title.toLowerCase().includes(needle))
  }).length
}
