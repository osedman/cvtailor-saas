import { randomBytes } from 'crypto'
import type { CareerProfileSections } from '@/lib/anthropic'
import type { EvidenceRow } from '@/lib/career-arc-ledger'
import { isBreakChapter, parseYear } from '@/lib/career-arc-ledger'

/**
 * Share-link redaction for the public Career Arc page (rebuild stage 3).
 *
 * THE RULE: `buildPublicArc` is the single serialization boundary. The public
 * page renders exclusively from its return value, so anything redacted here
 * never reaches the network. Redaction is deterministic — no model calls on
 * the public path.
 */

export type ClaimRedaction = 'full' | 'band' | 'hide'

export interface ShareSettings {
  claimRedactions: Record<string, ClaimRedaction>
  firstNameOnly: boolean
  hideEmployers: boolean
  hideDates: boolean
  includeBreak: boolean
}

export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  claimRedactions: {},
  firstNameOnly: true,
  hideEmployers: false,
  hideDates: false,
  includeBreak: false,
}

/** 192 bits of entropy, URL-safe. The token is the whole capability. */
export function generateShareToken(): string {
  return randomBytes(24).toString('base64url')
}

export function isValidShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token)
}

/** Allowed link lifetimes (days); null = no expiry. */
export const SHARE_EXPIRY_CHOICES = [7, 30, null] as const

// ---------------------------------------------------------------------------
// Deterministic figure banding: "£1.2m" → "seven-figure", "34" → "30+",
// "4 sites" → "multiple sites". Banded spans are wrapped in ⟪…⟫ so the
// renderer can mark them; the markers never carry the original figure.
// ---------------------------------------------------------------------------

function digitsOfMagnitude(raw: string): number {
  const cleaned = raw.replace(/[£$€,\s]/g, '').toLowerCase()
  const m = cleaned.match(/^(\d+(?:\.\d+)?)([kmb])?\+?$/)
  if (!m) return 0
  let value = parseFloat(m[1])
  if (m[2] === 'k') value *= 1e3
  if (m[2] === 'm') value *= 1e6
  if (m[2] === 'b') value *= 1e9
  return value >= 1 ? Math.floor(Math.log10(value)) + 1 : 0
}

const FIGURE_WORDS = ['', '', '', '', 'four-figure', 'five-figure', 'six-figure', 'seven-figure', 'eight-figure', 'nine-figure', 'ten-figure']

/** Band a single claim's figures away. Never returns the original numbers. */
export function bandClaim(claim: string): string {
  let out = claim

  // Money first: £1.2m, $3M+, €250k, £1,200,000
  out = out.replace(/[£$€]\s?\d[\d,.]*\s?(?:k|m|bn|b|million|billion)?\+?/gi, (raw) => {
    const norm = raw.replace(/million/i, 'm').replace(/billion|bn/i, 'b')
    const digits = digitsOfMagnitude(norm.replace(/[£$€]\s?/, ''))
    const word = FIGURE_WORDS[Math.min(digits, 10)] || 'substantial'
    return `⟪${word || 'substantial'}⟫`
  })

  // Percentages: 80% / 65 % / 4%
  out = out.replace(/\d+(?:\.\d+)?\s?%/g, (raw) => {
    const v = parseFloat(raw)
    if (v >= 100) return '⟪multiple-fold⟫'
    return v >= 10 ? '⟪double-digit %⟫' : '⟪single-digit %⟫'
  })

  // Plain counts: 34 people → 30+ people; 4 sites → multiple sites
  out = out.replace(/\b\d+(?:,\d{3})*\b/g, (raw) => {
    const v = parseInt(raw.replace(/,/g, ''), 10)
    if (Number.isNaN(v)) return '⟪several⟫'
    if (v >= 10) return `⟪${Math.floor(v / 10) * 10}+⟫`
    if (v > 1) return '⟪multiple⟫'
    return '⟪a⟫'
  })

  return out
}

/** True when a banded claim still contains any digit outside ⟪⟫ markers. */
export function bandLeaksFigures(banded: string): boolean {
  const outsideMarkers = banded.replace(/⟪[^⟫]*⟫/g, '')
  return /\d/.test(outsideMarkers)
}

// ---------------------------------------------------------------------------
// The public projection
// ---------------------------------------------------------------------------

export interface PublicArcCard {
  category: string
  /** Claim text; ⟪…⟫ spans mark banded segments. */
  text: string
  banded: boolean
  sourceRole: string
  /** '' when employers are hidden. */
  sourceCompany: string
}

export interface PublicArcNode {
  title: string
  company: string
  year: string
  isCurrent: boolean
}

export interface PublicArcChapter {
  span: string
  name: string
  summary: string
  isBreak: boolean
}

export interface PublicArc {
  displayName: string
  period: string
  tenureLine: string
  sharedOn: string
  expiresOn: string | null
  glance: Array<{ value: number; label: string }>
  nodes: PublicArcNode[]
  chapters: PublicArcChapter[]
  cards: PublicArcCard[]
  anyBanded: boolean
  employersHidden: boolean
}

interface BuildInputs {
  sections: CareerProfileSections
  evidence: EvidenceRow[]
  settings: ShareSettings
  sharedOn: string
  expiresOn: string | null
}

export function buildPublicArc({ sections, evidence, settings, sharedOn, expiresOn }: BuildInputs): PublicArc {
  const fullName = sections.identity?.name?.trim() || ''
  const displayName = settings.firstNameOnly && fullName ? fullName.split(/\s+/)[0] : fullName

  const tenureYears = sections.growth?.tenureYears ?? null
  const years = (sections.timeline ?? [])
    .flatMap((t) => [parseYear(t.start), parseYear(t.end)])
    .filter((y): y is number => y !== null)
  const hasPresent = (sections.timeline ?? []).some((t) => /present|now|current/i.test(t.end ?? ''))
  const lo = years.length ? Math.min(...years) : null
  const hi = years.length ? (hasPresent ? new Date().getFullYear() : Math.max(...years)) : null
  const datePeriod = lo !== null && hi !== null ? (lo === hi ? String(lo) : `${lo} — ${hi}`) : ''
  const tenureLine = tenureYears ? `${Math.round(tenureYears)} years` : datePeriod
  const period = settings.hideDates ? tenureLine : datePeriod || tenureLine

  const chapters: PublicArcChapter[] = (sections.chapters ?? [])
    .map((ch) => ({
      span: settings.hideDates ? '' : ch.span,
      name: ch.name,
      summary: ch.summary,
      isBreak: isBreakChapter(ch.name),
    }))
    .filter((ch) => settings.includeBreak || !ch.isBreak)

  const timeline = sections.timeline ?? []
  const nodes: PublicArcNode[] = timeline.map((role, i) => ({
    title: role.title,
    company: settings.hideEmployers ? '' : role.company,
    year: settings.hideDates ? '' : String(parseYear(role.start) ?? ''),
    isCurrent: i === timeline.length - 1,
  }))

  const cards: PublicArcCard[] = []
  for (const row of [...evidence].sort((a, b) => a.sort_order - b.sort_order)) {
    if (row.hidden) continue
    const redaction: ClaimRedaction = settings.claimRedactions[row.id] ?? 'full'
    if (redaction === 'hide') continue
    const base = row.rephrased_text ?? row.claim
    const text = redaction === 'band' ? bandClaim(base) : base
    cards.push({
      category: row.category,
      text,
      banded: redaction === 'band',
      sourceRole: row.source_role,
      sourceCompany: settings.hideEmployers ? '' : row.source_company,
    })
  }

  const employerCount = settings.hideEmployers ? 0 : (sections.organisations?.length ?? 0)
  const glance: Array<{ value: number; label: string }> = []
  if (chapters.length > 0) {
    glance.push({ value: chapters.length, label: tenureYears ? `Chapters · ${Math.round(tenureYears)} yrs` : 'Chapters' })
  }
  if (employerCount > 0) glance.push({ value: employerCount, label: employerCount === 1 ? 'Employer' : 'Employers' })
  glance.push({ value: cards.length, label: 'Proofs shared' })

  return {
    displayName,
    period,
    tenureLine,
    sharedOn,
    expiresOn,
    glance,
    nodes,
    chapters,
    cards,
    anyBanded: cards.some((c) => c.banded),
    employersHidden: settings.hideEmployers,
  }
}

// ---------------------------------------------------------------------------
// Settings validation for the share APIs
// ---------------------------------------------------------------------------

const REDACTIONS = new Set<string>(['full', 'band', 'hide'])

/**
 * Validate a client-supplied settings patch against the caller's own card ids.
 * Returns null on any unknown key, unknown value, or wrong shape.
 */
export function validateShareSettings(raw: unknown, ownCardIds: Set<string>): ShareSettings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>

  const redactions: Record<string, ClaimRedaction> = {}
  if (o.claimRedactions !== undefined) {
    if (typeof o.claimRedactions !== 'object' || o.claimRedactions === null || Array.isArray(o.claimRedactions)) return null
    const entries = Object.entries(o.claimRedactions as Record<string, unknown>)
    if (entries.length > 200) return null
    for (const [id, value] of entries) {
      if (!ownCardIds.has(id)) return null
      if (typeof value !== 'string' || !REDACTIONS.has(value)) return null
      redactions[id] = value as ClaimRedaction
    }
  }

  for (const flag of ['firstNameOnly', 'hideEmployers', 'hideDates', 'includeBreak'] as const) {
    if (o[flag] !== undefined && typeof o[flag] !== 'boolean') return null
  }

  return {
    claimRedactions: redactions,
    firstNameOnly: (o.firstNameOnly as boolean | undefined) ?? DEFAULT_SHARE_SETTINGS.firstNameOnly,
    hideEmployers: (o.hideEmployers as boolean | undefined) ?? DEFAULT_SHARE_SETTINGS.hideEmployers,
    hideDates: (o.hideDates as boolean | undefined) ?? DEFAULT_SHARE_SETTINGS.hideDates,
    includeBreak: (o.includeBreak as boolean | undefined) ?? DEFAULT_SHARE_SETTINGS.includeBreak,
  }
}
