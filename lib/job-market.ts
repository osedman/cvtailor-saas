/**
 * Live job-market insight for the career path. Pure helpers here are unit
 * tested; the network call is isolated in fetchMarket().
 *
 * Design notes (see docs/PROJECT.md):
 * - Snapshots are cached by (role, region), never per user — every user aiming
 *   at the same role shares one weekly-refreshed row, so a handful of API calls
 *   a month serves everyone.
 * - Provider is Reed.co.uk's free jobseeker API (swapped from Adzuna 28 Jul
 *   2026 — Adzuna's commercial-consent requirement blocked GA). Reed salaries
 *   are employer-posted, so no predicted-salary filtering is needed.
 * - "Opens N more roles" is honest keyword presence across real descriptions,
 *   not an AI judgement — cheap, explainable, and reproducible.
 */

export interface MarketJob {
  title: string
  company: string
  location: string
  salaryMin: number | null
  salaryMax: number | null
  url: string
  description: string
}

export interface SalaryBand {
  p25: number
  median: number
  p75: number
  /** how many postings carried a real (non-predicted) salary */
  sampleSize: number
}

export interface SkillUnlock {
  skill: string
  /** live postings that ask for this skill */
  roles: number
}

export interface MarketSnapshot {
  role: string
  region: string
  totalRoles: number
  band: SalaryBand | null
  topCompanies: string[]
  unlocks: SkillUnlock[]
  fetchedAt: string
}

/** Cache key — same role typed slightly differently shouldn't split the cache. */
export function normaliseRoleKey(role: string, region: string): string {
  return `${region.toUpperCase()}:${role.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120)}`
}

/** Percentile band from real advertised salaries. Predicted ones are dropped by
 * the caller, so an empty list means "we genuinely don't know" — return null
 * rather than inventing a range. */
export function salaryBand(salaries: number[]): SalaryBand | null {
  const clean = salaries.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (clean.length === 0) return null
  const at = (p: number) => clean[Math.min(clean.length - 1, Math.floor((clean.length - 1) * p))]
  return { p25: Math.round(at(0.25)), median: Math.round(at(0.5)), p75: Math.round(at(0.75)), sampleSize: clean.length }
}

const SKILL_STOPWORDS = new Set(["and", "the", "of", "for", "with", "in", "to", "a", "an", "&"])

/** Word-boundary, case-insensitive presence. Long skill labels are reduced to
 * their first two significant words, because postings phrase things their own
 * way ("Capacity planning basics" must still match "leads capacity planning").
 * Single tokens stay exact: "SQL" must not match "MySQLite". */
export function mentionsSkill(text: string, skill: string): boolean {
  const s = skill.trim().toLowerCase()
  if (s.length < 2) return false
  const words = s
    .split(/[(/,:;—-]/)[0]
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !SKILL_STOPWORDS.has(w))
  const needle = (words.length >= 2 ? words.slice(0, 2).join(" ") : words[0] || s).trim()
  if (needle.length < 2) return false
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text)
}

/** How many live postings each still-open skill appears in — "close this, open
 * these". Sorted by impact, zero-mention skills dropped (never show "0 roles",
 * it reads as a scolding). */
export function computeUnlocks(jobs: MarketJob[], openSkills: string[]): SkillUnlock[] {
  const haystacks = jobs.map((j) => `${j.title}\n${j.description}`)
  return openSkills
    .map((skill) => ({ skill, roles: haystacks.filter((h) => mentionsSkill(h, skill)).length }))
    .filter((u) => u.roles > 0)
    .sort((a, b) => b.roles - a.roles)
}

/** Most frequent employers in the sample — social proof for the target role. */
export function topCompanies(jobs: MarketJob[], limit = 4): string[] {
  const counts = new Map<string, number>()
  for (const j of jobs) {
    const name = j.company.trim()
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name)
}

export function isMarketEnabled(): boolean {
  return (
    process.env.MARKET_INSIGHTS_ENABLED === "1" &&
    !!process.env.REED_API_KEY
  )
}

/** True while a cached snapshot is still fresh (7 days). */
export function isFresh(fetchedAt: string, now: Date = new Date(), days = 7): boolean {
  const t = Date.parse(fetchedAt)
  if (Number.isNaN(t)) return false
  return now.getTime() - t < days * 86_400_000
}

/** Reed jobseeker API result — https://www.reed.co.uk/developers/Jobseeker.
 * Salaries are employer-posted (no "predicted" flag to filter, unlike Adzuna);
 * yearly* fields normalise hourly/daily rates to annual. */
interface ReedResult {
  jobId?: number
  jobTitle?: string
  jobDescription?: string
  jobUrl?: string
  minimumSalary?: number
  maximumSalary?: number
  yearlyMinimumSalary?: number
  yearlyMaximumSalary?: number
  employerName?: string
  locationName?: string
}

export interface MarketFetch {
  totalRoles: number
  band: SalaryBand | null
  topCompanies: string[]
  /** the sampled postings — cached so per-user unlock counts can be recomputed
   * without another API call */
  jobs: MarketJob[]
  fetchedAt: string
}

/** Fetch live postings for a role via Reed's jobseeker API. Reed is UK-only,
 * which matches Tailr's market; non-GB regions return null and the UI renders
 * nothing, exactly like the disabled state. Returns null when the integration
 * is off or the upstream fails — callers must degrade silently, never block
 * the path. */
export async function fetchMarket(role: string, region: string): Promise<MarketFetch | null> {
  if (!isMarketEnabled()) return null
  if ((region || "GB").toUpperCase() !== "GB") return null
  const url = new URL("https://www.reed.co.uk/api/1.0/search")
  url.searchParams.set("keywords", role.slice(0, 120))
  url.searchParams.set("resultsToTake", "100")

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      // Reed auths with the API key as the Basic username, empty password.
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.REED_API_KEY}:`).toString("base64")}`,
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { totalResults?: number; results?: ReedResult[] }
    const jobs: MarketJob[] = (data.results ?? []).map((r) => ({
      title: (r.jobTitle ?? "").slice(0, 160),
      company: (r.employerName ?? "").slice(0, 80),
      location: (r.locationName ?? "").slice(0, 80),
      // Prefer the yearly-normalised fields so an hourly rate never lands in
      // an annual band; fall back to the raw fields (annual for most listings).
      salaryMin: r.yearlyMinimumSalary ?? r.minimumSalary ?? null,
      salaryMax: r.yearlyMaximumSalary ?? r.maximumSalary ?? null,
      url: r.jobUrl ?? "",
      description: (r.jobDescription ?? "").slice(0, 2000),
    }))
    const salaries = jobs
      .flatMap((j) => {
        if (j.salaryMin && j.salaryMax) return [(j.salaryMin + j.salaryMax) / 2]
        return j.salaryMin ? [j.salaryMin] : j.salaryMax ? [j.salaryMax] : []
      })
      // When Reed's yearly-normalised fields are absent the raw figure can be
      // an hourly or daily rate; a £15 or £450 "salary" would wreck an annual
      // band, so anything implausibly small for a yearly wage is dropped.
      .filter((s) => s >= 5_000)
    return {
      totalRoles: data.totalResults ?? jobs.length,
      band: salaryBand(salaries),
      topCompanies: topCompanies(jobs),
      jobs,
      fetchedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}
