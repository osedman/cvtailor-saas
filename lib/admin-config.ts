/**
 * Admin configuration — the pure definitions (19 Nov 2026). Client-safe.
 * Phase 3 of the admin area. Database half:
 * supabase/migrations/20261119120000_admin_config.sql.
 *
 * OFF SWITCHES ONLY TURN THINGS OFF. A feature is live when the environment
 * has it on AND no off switch is set. An admin can therefore stop something
 * within a minute and with no deploy, but can never turn on a feature the
 * environment was not set up for (no API key, deliberately disabled).
 */

export const KILL_KEYS = [
  "kill.market_insights",
  "kill.course_sources",
  "kill.course_youtube",
  "kill.course_microsoft_learn",
] as const
export type KillKey = (typeof KILL_KEYS)[number]

export const ALLOWLIST_KEY = "email.staging_allowlist" as const
export type SettingKey = KillKey | typeof ALLOWLIST_KEY

export function isKillKey(v: unknown): v is KillKey {
  return typeof v === "string" && (KILL_KEYS as readonly string[]).includes(v)
}

export const SWITCHES: Record<KillKey, { label: string; description: string }> = {
  "kill.market_insights": {
    label: "Live job market",
    description: "Job counts and employers on the career path, from Reed.",
  },
  "kill.course_sources": {
    label: "Course sync",
    description: "The scheduled collection of new courses from every source.",
  },
  "kill.course_youtube": {
    label: "YouTube courses",
    description: "Course collection from YouTube only.",
  },
  "kill.course_microsoft_learn": {
    label: "Microsoft Learn courses",
    description: "Course collection from Microsoft Learn only.",
  },
}

/** Which off switches stop a given course source. */
export function courseSourceKillKeys(sourceId: string): KillKey[] {
  const keys: KillKey[] = ["kill.course_sources"]
  if (sourceId === "youtube") keys.push("kill.course_youtube")
  if (sourceId === "microsoft-learn") keys.push("kill.course_microsoft_learn")
  return keys
}

export type Settings = Partial<Record<SettingKey, unknown>>

export function isKilled(settings: Settings, key: KillKey): boolean {
  const v = settings[key]
  return !!v && typeof v === "object" && (v as { off?: unknown }).off === true
}

export function extraAllowlist(settings: Settings): string[] {
  const v = settings[ALLOWLIST_KEY]
  const list = v && typeof v === "object" ? (v as { addresses?: unknown }).addresses : null
  return Array.isArray(list) ? list.filter((a): a is string => typeof a === "string") : []
}

export const ALLOWLIST_MAX = 50

/**
 * One exact address, or the sentence saying why not. Whole domains ("@x.com")
 * are refused on purpose: staging holds real CVs, and one careless domain
 * entry would let it email every stranger at a mail provider. Domains stay an
 * environment decision.
 */
export function parseAllowlistAddress(v: unknown): { email: string } | { error: string } {
  if (typeof v !== "string") return { error: "Enter an email address." }
  const email = v.trim().toLowerCase()
  if (email.startsWith("@")) return { error: "Whole domains can only be allowed in the environment settings. Enter one exact address." }
  if (!/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(email) || email.length > 254) return { error: "Enter one exact email address." }
  return { email }
}

/** What a cron summary may carry: counts and short status words only. */
export function safeCronSummary(input: unknown): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {}
  if (!input || typeof input !== "object") return out
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "number" || typeof v === "boolean") out[k] = v
    // No "@": a summary is never a place for an address.
    else if (typeof v === "string" && v.length <= 80 && !v.includes("@")) out[k] = v
  }
  return out
}
