import type { RequirementMapping } from "@/lib/anthropic"

/**
 * Living-path compute layer. Pure functions — no AI, no DB — that turn the
 * data Tailr already stores (tailor_history + job_tracker) into the living
 * path's intelligence: which target the user is aiming at, how ready they are,
 * and which gaps unlock the most of their real saved jobs. Tested in isolation
 * like lib/career-signal.ts.
 */

/** A tailor run reduced to what the path needs. */
export interface HistoryEntry {
  historyId: string
  jobTitle: string
  createdAt: string
  coverage: RequirementMapping[]
}

/** A tracked job reduced to what the path needs. */
export interface TrackerJob {
  historyId: string | null
  status: "saved" | "applied" | "interview" | "offer"
  jobTitle: string
}

export interface RankedGap {
  skill: string
  /** distinct active tracker jobs that need this skill */
  unlockCount: number
  /** titles of those jobs, for "unlocks: Data Lead, …" */
  sourceJobs: string[]
}

export interface Readiness {
  pct: number
  have: number
  total: number
  /** target requirements still not evidenced, most-common first */
  missing: string[]
  /** target requirements already evidenced, most-common first — the "have" side
   * of the map, so the UI can show the full picture (fixes "55 of 60 — where are
   * the other items?"). */
  haveList: string[]
}

/** One skill the target role's market demands, and whether the candidate's CV
 * evidences it. The full set is the "60" a user wants to see and click. */
export interface TargetSkill {
  skill: string
  have: boolean
}

const WEAK = new Set(["partial", "none"])
const STRONG = new Set(["strong", "transferable"])

/** Two-way substring match so "sql" ↔ "SQL", "stakeholder" ↔ "stakeholder management". */
export function skillMatches(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

/**
 * Reattach model-generated plans to the exact skill names the app owns.
 *
 * Models occasionally shorten "Stakeholder management" to "Stakeholder".
 * Exact-only matching silently discarded those otherwise valid plans. Match
 * exact names first, then safe substring variants, and only use positional
 * fallback when the model returned the complete requested batch.
 */
export function alignPlansToSkills<T extends { skill: string }>(
  skills: string[],
  planned: T[],
): Array<T & { skill: string }> {
  const used = new Set<number>()
  const completeBatch = planned.length === skills.length

  return skills.flatMap((skill, position) => {
    const normalized = skill.trim().toLowerCase()
    let index = planned.findIndex(
      (item, i) => !used.has(i) && item.skill.trim().toLowerCase() === normalized,
    )
    if (index < 0) {
      index = planned.findIndex(
        (item, i) => !used.has(i) && skillMatches(item.skill, skill),
      )
    }
    if (index < 0 && completeBatch) {
      index = !used.has(position)
        ? position
        : planned.findIndex((_, i) => !used.has(i))
    }
    if (index < 0) return []

    used.add(index)
    return [{ ...planned[index], skill }]
  })
}

/** Most-frequent recent job title — seeds the target so the intake form can die. */
export function deriveTargetRole(history: HistoryEntry[]): string {
  if (history.length === 0) return ""
  const counts = new Map<string, { n: number; last: string; display: string }>()
  for (const h of history) {
    const title = h.jobTitle.trim()
    if (!title) continue
    const key = title.toLowerCase()
    const cur = counts.get(key)
    if (cur) {
      cur.n += 1
      if (h.createdAt > cur.last) cur.last = h.createdAt
    } else {
      counts.set(key, { n: 1, last: h.createdAt, display: title })
    }
  }
  const ranked = Array.from(counts.values()).sort(
    (a, b) => b.n - a.n || b.last.localeCompare(a.last),
  )
  return ranked[0]?.display ?? ""
}

/**
 * Rank candidate gap skills by how many of the user's ACTIVE tracked jobs
 * (saved/applied — the ones still in play) need them. A gap that blocks six
 * saved jobs matters more than one that blocks one.
 */
export function rankGapsByUnlock(
  gaps: string[],
  tracker: TrackerJob[],
  historyById: Map<string, HistoryEntry>,
): RankedGap[] {
  const active = tracker.filter((t) => t.status === "saved" || t.status === "applied")

  return gaps
    .map((skill) => {
      const sourceJobs: string[] = []
      const seen = new Set<string>()
      for (const job of active) {
        if (!job.historyId) continue
        const entry = historyById.get(job.historyId)
        if (!entry) continue
        const needs = entry.coverage.some(
          (r) =>
            (WEAK.has(r.strength) || r.type === "must") &&
            (r.keywords ?? []).some((k) => skillMatches(k, skill)),
        )
        const label = (job.jobTitle || entry.jobTitle || "A saved job").trim()
        if (needs && !seen.has(label.toLowerCase())) {
          seen.add(label.toLowerCase())
          sourceJobs.push(label)
        }
      }
      return { skill, unlockCount: sourceJobs.length, sourceJobs }
    })
    .sort((a, b) => b.unlockCount - a.unlockCount)
}

/**
 * Readiness for the target role: of the requirements the user's tailors for
 * that role surface, how many do they now have strong evidence for — counting
 * skills they've closed on the path as evidence. Powers the readiness ring.
 */
export function computeReadiness(
  targetRole: string,
  history: HistoryEntry[],
  closedSkills: string[],
): Readiness {
  const target = targetRole.trim().toLowerCase()
  // Requirements from tailors against the target role (fall back to all history
  // if nothing matches the target title, so a new target still says something).
  const relevant = target
    ? history.filter((h) => skillMatches(h.jobTitle, target))
    : []
  const pool = relevant.length > 0 ? relevant : history

  // Dedupe requirements by their primary keyword; track best strength seen and
  // how often the requirement appears (to order the misses sensibly).
  const reqs = new Map<string, { best: string; count: number; label: string }>()
  for (const h of pool) {
    for (const r of h.coverage) {
      const kw = (r.keywords ?? [])[0]?.trim().toLowerCase()
      if (!kw) continue
      const cur = reqs.get(kw)
      const strengthRank = STRONG.has(r.strength) ? 2 : r.strength === "partial" ? 1 : 0
      if (cur) {
        cur.count += 1
        if (strengthRank > (STRONG.has(cur.best) ? 2 : cur.best === "partial" ? 1 : 0)) cur.best = r.strength
      } else {
        reqs.set(kw, { best: r.strength, count: 1, label: (r.keywords ?? [])[0] })
      }
    }
  }

  const total = reqs.size
  if (total === 0) return { pct: 0, have: 0, total: 0, missing: [], haveList: [] }

  const haveItems: Array<{ label: string; count: number }> = []
  const missing: Array<{ label: string; count: number }> = []
  for (const [kw, v] of reqs) {
    const evidenced = STRONG.has(v.best) || closedSkills.some((s) => skillMatches(s, kw))
    if (evidenced) haveItems.push({ label: v.label, count: v.count })
    else missing.push({ label: v.label, count: v.count })
  }

  haveItems.sort((a, b) => b.count - a.count)
  missing.sort((a, b) => b.count - a.count)
  return {
    pct: Math.round((haveItems.length / total) * 100),
    have: haveItems.length,
    total,
    missing: missing.map((m) => m.label),
    haveList: haveItems.map((m) => m.label),
  }
}

/**
 * Readiness against a chosen North Star, driven by the role's demanded skill
 * set (from AI market research) rather than tailor history. A skill counts as
 * evidenced if the CV already had it (`have`) OR the user has since closed it on
 * their path. Same shape as computeReadiness so the UI renders identically.
 */
export function readinessFromTargetSkills(
  target: TargetSkill[],
  closedSkills: string[],
): Readiness {
  const total = target.length
  if (total === 0) return { pct: 0, have: 0, total: 0, missing: [], haveList: [] }

  const haveList: string[] = []
  const missing: string[] = []
  for (const t of target) {
    const evidenced = t.have || closedSkills.some((s) => skillMatches(s, t.skill))
    if (evidenced) haveList.push(t.skill)
    else missing.push(t.skill)
  }
  return {
    pct: Math.round((haveList.length / total) * 100),
    have: haveList.length,
    total,
    missing,
    haveList,
  }
}

/**
 * Pace forecast — the date is an OUTPUT, not an input. No deadlines exist:
 * the forecast simply shifts with pace, like a delivery estimate, so there is
 * never an "overdue" state to feel ashamed of.
 */
export const EST_HOURS_PER_SKILL = 10

export interface PaceForecast {
  /** e.g. "October 2026" — null when nothing is open (path complete) */
  readyByLabel: string | null
  weeks: number
}

export function forecastReadyDate(
  openSkillCount: number,
  hoursPerWeek: number | null,
  now: Date = new Date(),
): PaceForecast {
  if (openSkillCount <= 0) return { readyByLabel: null, weeks: 0 }
  const pace = hoursPerWeek && hoursPerWeek > 0 ? hoursPerWeek : 3
  const weeks = Math.max(1, Math.ceil((openSkillCount * EST_HOURS_PER_SKILL) / pace))
  const ready = new Date(now)
  ready.setDate(ready.getDate() + weeks * 7)
  const readyByLabel = ready.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
  return { readyByLabel, weeks }
}

/** Days since the most recent item activity (touchedAt), or null if never. */
export function daysSinceLastStitch(
  items: Array<{ touchedAt?: string }>,
  now: Date = new Date(),
): number | null {
  const times = items
    .map((i) => (i.touchedAt ? Date.parse(i.touchedAt) : NaN))
    .filter((t) => !Number.isNaN(t))
  if (times.length === 0) return null
  return Math.max(0, Math.floor((now.getTime() - Math.max(...times)) / 86_400_000))
}

// ── Upskill vs core path ──────────────────────────────────────────────────

/** A skill closable in about a week of spare time auto-captures. */
export const QUICK_WIN_MAX_HOURS = 5

/**
 * Split generated skills into what can be auto-captured and what has to be
 * offered.
 *
 * A quick win is small enough to finish in roughly a week of spare evenings, so
 * adding it to the user's list costs them nothing and needs no permission. A
 * course, a certification or a multi-week project is a real commitment: it is
 * returned as a candidate for the user to accept onto their path, never written
 * silently. That distinction is what stops the quick lane filling with
 * "learn Kubernetes" and keeps the promise of the section honest.
 *
 * Items with no usable estimate are treated as candidates, not quick wins —
 * when in doubt, ask rather than assume.
 */
export function splitByEffort<T extends { effortHours?: number }>(
  items: T[],
  maxQuickHours: number = QUICK_WIN_MAX_HOURS,
): { quick: T[]; candidates: T[] } {
  const quick: T[] = []
  const candidates: T[] = []
  for (const item of items) {
    const hours = typeof item.effortHours === "number" && Number.isFinite(item.effortHours)
      ? item.effortHours
      : null
    if (hours !== null && hours > 0 && hours <= maxQuickHours) quick.push(item)
    else candidates.push(item)
  }
  return { quick, candidates }
}

/** A skill this many runs keep surfacing is a pattern, not a one-off job. */

