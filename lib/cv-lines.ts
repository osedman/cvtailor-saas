/**
 * Line classification for plain-text CVs, shared by the on-screen preview
 * (FormattedCV) and the Word export (lib/word.ts) so the downloaded file
 * always matches what the user saw.
 *
 * Two job-entry shapes exist in the wild:
 *  - single line:   "Senior Analyst, Northwind — 2021 to Present"
 *  - three stacked lines:  role title / company / dates
 * The stacked shape is recognised from its date-only line and classified
 * upward, so a company renders the same whether or not it is written in
 * capitals (an ALL-CAPS company must not become a section heading).
 */

export const isSectionHeading = (t: string) =>
  /^[A-Z][A-Z\s&/,'()-]+$/.test(t) && t.length >= 3

export const isBulletLine = (t: string) => /^[•\-\*·]/.test(t)

/** Single-line role: contains a 4-digit year or "Present", reasonably short. */
export const isRoleLine = (t: string) =>
  (/\b(19|20)\d{2}\b|Present/i.test(t)) && t.length < 130

const DATE_PART = String.raw`(?:[A-Za-z]{3,9}\.?\s+)?(?:19|20)\d{2}|Present|Current|Now`
const dateOnlyRe = new RegExp(
  String.raw`^\(?(?:${DATE_PART})\)?(?:\s*[,–—-]\s*\(?(?:${DATE_PART})\)?)?\s*$`,
  "i",
)

/** A line that is nothing but a date or date range, e.g. "March 2025, September 2025". */
export const isDateOnlyLine = (s: string) => dateOnlyRe.test(s.trim())

export const nextContentIdx = (lines: string[], i: number) => {
  let j = i + 1
  while (j < lines.length && !lines[j].trim()) j++
  return j
}

export const prevContentIdx = (lines: string[], i: number) => {
  let j = i - 1
  while (j >= 0 && !lines[j].trim()) j--
  return j
}

/** Company line of a stacked block: the next content line is date-only. */
export const isStackedCompanyLine = (lines: string[], i: number) => {
  const s = lines[i]?.trim() ?? ""
  if (!s || s.length >= 90 || isBulletLine(s) || isDateOnlyLine(s)) return false
  const j = nextContentIdx(lines, i)
  return j < lines.length && isDateOnlyLine(lines[j])
}

/** Role-title line of a stacked block: the next content line is a company. */
export const isStackedRoleTitleLine = (lines: string[], i: number) => {
  const s = lines[i]?.trim() ?? ""
  if (!s || s.length >= 130 || isBulletLine(s) || isDateOnlyLine(s)) return false
  return isStackedCompanyLine(lines, nextContentIdx(lines, i))
}

/** Date line of a stacked block: date-only, directly under a company. */
export const isStackedDateLine = (lines: string[], i: number) => {
  const s = lines[i]?.trim() ?? ""
  return !!s && isDateOnlyLine(s) && isStackedCompanyLine(lines, prevContentIdx(lines, i))
}
