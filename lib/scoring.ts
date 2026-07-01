import type { RequirementMapping } from '@/lib/anthropic'

// ── Computed match score — arithmetic, not model vibes ──────────────────

const STRENGTH_VALUE: Record<string, number> = { strong: 1, transferable: 0.6, partial: 0.25, none: 0 }

export function computeMatchScore(requirements: RequirementMapping[]): number {
  if (requirements.length === 0) return 0
  let earned = 0
  let possible = 0
  for (const r of requirements) {
    const weight = r.type === 'must' ? 2 : 1
    earned += (STRENGTH_VALUE[r.strength] ?? 0) * weight
    possible += weight
  }
  return Math.round((earned / possible) * 100)
}

// ── Deterministic keyword check against the final CV text ───────────────

export function checkKeywords(requirements: RequirementMapping[], cvText: string) {
  const cv = cvText.toLowerCase()
  const seen = new Set<string>()
  const present: string[] = []
  const missing: string[] = []
  for (const r of requirements) {
    for (const kw of r.keywords ?? []) {
      const k = kw.trim()
      const key = k.toLowerCase()
      if (!k || seen.has(key)) continue
      seen.add(key)
      // Only flag keywords the CV can truthfully carry — a "none" requirement's
      // keyword being absent is a gap, not an ATS mistake.
      if (cv.includes(key)) present.push(k)
      else if (r.strength !== 'none') missing.push(k)
    }
  }
  return { present, missing }
}
