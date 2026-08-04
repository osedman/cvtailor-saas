import type { CareerProfileSections } from '@/lib/anthropic'
import { parseYear, type EvidenceRow } from '@/lib/career-arc-ledger'

/**
 * Shared, honest derivations for the four alternate Career Arc concepts
 * (Mission Control, Metro Map, One-Sheet, Ledger).
 *
 * THE RULE for these pages: every number on screen traces to the user's own
 * timeline, evidence bank, or tailor history. The original mockups carried
 * invented telemetry — a momentum score of 87, readiness 78%, skill ratings
 * out of 100, a named "next target" role. None of that has a source in the
 * product, so none of it is rendered. Where a concept's slot has no honest
 * value, the slot is omitted rather than filled.
 */

export const CONCEPT_IDS = ['mission-control', 'metro-map', 'one-sheet', 'ledger'] as const
export type ConceptId = (typeof CONCEPT_IDS)[number]

export const CONCEPT_META: Record<ConceptId, { name: string; tagline: string }> = {
  'mission-control': { name: 'Mission Control', tagline: 'Career telemetry — dense, instrumented, dark' },
  'metro-map': { name: 'Metro Map', tagline: 'Transit diagram — lines, interchanges, one network' },
  'one-sheet': { name: 'One-Sheet', tagline: 'Film poster — one story, told loud' },
  'ledger': { name: 'Ledger', tagline: 'Audited accounts — the shipped direction' },
}

export function isConceptId(value: string): value is ConceptId {
  return (CONCEPT_IDS as readonly string[]).includes(value)
}

export interface ConceptRole {
  title: string
  company: string
  startYear: number | null
  endYear: number | null
  isCurrent: boolean
  /** True when this role is a step up at the same employer as the previous one. */
  isPromotion: boolean
  /** Evidence claims sourced to this role, newest-bank-order first. */
  proofs: string[]
}

export interface CategoryLine {
  category: string
  /** Index into roles[] where this category's first evidence appears. */
  joinsAt: number
  count: number
}

export interface ConceptData {
  name: string
  firstName: string
  period: string
  tenureYears: number | null
  roles: ConceptRole[]
  /** Promotions derived from title changes within one employer. */
  promotions: number
  employers: string[]
  proofCount: number
  /** Evidence claims with how many tailored CVs used them ("deploys"). */
  locker: Array<{ claim: string; uses: number; category: string }>
  /** Skill names grouped by their category — counts only, never scores. */
  skillGroups: Array<{ category: string; names: string[] }>
  categoryLines: CategoryLine[]
  /** Dated, real events: role starts and evidence extraction. */
  feed: Array<{ when: string; kind: 'role' | 'promotion' | 'evidence'; text: string }>
  totalReuses: number
}

const CATEGORY_COLOURS: Record<string, string> = {
  quant: '#dc4f33',
  systems: '#2f7e6d',
  leadership: '#1e1813',
  scope: '#d9a441',
  craft: '#7a5c9e',
}

export function categoryColour(category: string): string {
  return CATEGORY_COLOURS[category] ?? '#8a8178'
}

/** Normalised employer key so "Gousto" and "gousto " count as one. */
function employerKey(company: string): string {
  return company.trim().toLowerCase()
}

/**
 * A promotion is a title change at the SAME employer, moving up the ladder.
 * Seniority is read from title words rather than guessed — if neither title
 * carries a rank word, a same-employer title change still counts (the CV
 * shows a move; we just do not claim which way it went beyond "onward").
 */
const RANK_WORDS: Array<[RegExp, number]> = [
  [/\b(chief|c-level|cto|coo|ceo|cfo)\b/i, 7],
  [/\b(vp|vice president)\b/i, 6],
  [/\b(head of|director)\b/i, 5],
  [/\b(principal|lead|manager)\b/i, 4],
  [/\b(senior|snr|sr)\b/i, 3],
  [/\b(mid|associate)\b/i, 2],
  [/\b(junior|jnr|graduate|assistant|intern|coordinator)\b/i, 1],
]

export function seniorityRank(title: string): number {
  for (const [rx, rank] of RANK_WORDS) if (rx.test(title)) return rank
  return 2
}

export function deriveConceptData(
  sections: CareerProfileSections,
  evidence: EvidenceRow[],
  usage: Record<string, number> = {},
): ConceptData {
  const visible = [...evidence].filter((e) => !e.hidden).sort((a, b) => a.sort_order - b.sort_order)
  const timeline = sections.timeline ?? []

  const roles: ConceptRole[] = timeline.map((role, i) => {
    const prev = i > 0 ? timeline[i - 1] : null
    const sameEmployer = prev !== null && employerKey(prev.company) === employerKey(role.company)
    const stepUp = prev !== null && seniorityRank(role.title) > seniorityRank(prev.title)
    return {
      title: role.title,
      company: role.company,
      startYear: parseYear(role.start),
      endYear: parseYear(role.end),
      isCurrent: i === timeline.length - 1,
      isPromotion: sameEmployer && (stepUp || prev!.title.trim() !== role.title.trim()),
      proofs: visible
        .filter((e) => e.source_role && role.title.toLowerCase().includes(e.source_role.toLowerCase().slice(0, 18)))
        .map((e) => e.rephrased_text ?? e.claim),
    }
  })

  const employers: string[] = []
  for (const role of timeline) {
    const key = employerKey(role.company)
    if (key && !employers.some((e) => employerKey(e) === key)) employers.push(role.company)
  }

  // Category "lines": where each evidence category first appears on the path.
  const categoryLines: CategoryLine[] = []
  const seen = new Map<string, { joinsAt: number; count: number }>()
  for (const cardCategory of visible.map((c) => c.category)) {
    const entry = seen.get(cardCategory)
    if (entry) entry.count++
    else seen.set(cardCategory, { joinsAt: -1, count: 1 })
  }
  for (const [category, entry] of seen) {
    const firstCard = visible.find((c) => c.category === category)
    let joinsAt = 0
    if (firstCard?.source_role) {
      const idx = roles.findIndex((r) => r.title.toLowerCase().includes(firstCard.source_role.toLowerCase().slice(0, 18)))
      joinsAt = idx >= 0 ? idx : 0
    }
    categoryLines.push({ category, joinsAt, count: entry.count })
  }
  categoryLines.sort((a, b) => a.joinsAt - b.joinsAt || b.count - a.count)

  const byCategory = new Map<string, string[]>()
  for (const skill of sections.skills ?? []) {
    const list = byCategory.get(skill.category) ?? []
    list.push(skill.name)
    byCategory.set(skill.category, list)
  }

  const feed: ConceptData['feed'] = []
  for (const role of roles) {
    if (role.startYear === null) continue
    feed.push({
      when: String(role.startYear),
      kind: role.isPromotion ? 'promotion' : 'role',
      text: role.isPromotion
        ? `Promoted to ${role.title}${role.company ? ` · ${role.company}` : ''}`
        : `${role.title}${role.company ? ` · ${role.company}` : ''}`,
    })
  }
  if (visible.length > 0) {
    feed.push({ when: 'now', kind: 'evidence', text: `${visible.length} proofs on file, all sourced from your CV` })
  }
  feed.reverse()

  const years = timeline.flatMap((t) => [parseYear(t.start), parseYear(t.end)]).filter((y): y is number => y !== null)
  const hasPresent = timeline.some((t) => /present|now|current/i.test(t.end ?? ''))
  const lo = years.length ? Math.min(...years) : null
  const hi = years.length ? (hasPresent ? new Date().getFullYear() : Math.max(...years)) : null

  const fullName = sections.identity?.name?.trim() ?? ''

  return {
    name: fullName,
    firstName: fullName.split(/\s+/)[0] ?? '',
    period: lo !== null && hi !== null ? (lo === hi ? String(lo) : `${lo} — ${hi}`) : '',
    tenureYears: sections.growth?.tenureYears ?? null,
    roles,
    promotions: roles.filter((r) => r.isPromotion).length,
    employers,
    proofCount: visible.length,
    locker: visible
      .map((c) => ({ claim: c.rephrased_text ?? c.claim, uses: usage[c.id] ?? 0, category: c.category }))
      .sort((a, b) => b.uses - a.uses),
    skillGroups: Array.from(byCategory.entries()).map(([category, names]) => ({ category, names })),
    categoryLines,
    feed,
    totalReuses: visible.reduce((sum, c) => sum + (usage[c.id] ?? 0), 0),
  }
}
