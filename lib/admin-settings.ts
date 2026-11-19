/**
 * Admin settings as the running server sees them (19 Nov 2026). Server-only.
 *
 * One read of public.admin_settings per lambda per minute, so a switch costs
 * nothing per request and takes effect within about a minute everywhere.
 *
 * FAILS TOWARDS THE ENVIRONMENT. If the table is missing or unreadable, no
 * switch is off and no extra address is allowed: everything behaves exactly
 * as the environment variables say, which is how it behaved before this
 * existed. A broken settings read must never turn a feature off, and must
 * never widen who staging can email.
 *
 * Builds its own client rather than importing lib/supabase/server, so that
 * lib/email.ts can use it without pulling next/headers into every importer.
 */
import { createClient } from "@supabase/supabase-js"
import { extraAllowlist, isKilled, type KillKey, type Settings } from "@/lib/admin-config"

const TTL_MS = 60_000
let cache: { at: number; settings: Settings } | null = null

export async function readSettings(opts: { fresh?: boolean } = {}): Promise<Settings> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.settings
  let settings: Settings = {}
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      const { data, error } = await createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
        .from("admin_settings")
        .select("key, value")
      if (error) throw error
      for (const row of data ?? []) (settings as Record<string, unknown>)[row.key as string] = row.value
    }
  } catch (e) {
    console.error("[admin-settings] read failed, following the environment:", e instanceof Error ? e.message : e)
    settings = {}
  }
  cache = { at: Date.now(), settings }
  return settings
}

/** Drop the cached copy — call after a change so this lambda sees it at once. */
export function forgetSettings(): void {
  cache = null
}

/** True when ANY of these off switches is set. */
export async function anyKilled(keys: KillKey[]): Promise<boolean> {
  const settings = await readSettings()
  return keys.some((k) => isKilled(settings, k))
}

/** Extra addresses non-production may email. Never consulted in production. */
export async function stagingAllowlistExtras(): Promise<string[]> {
  return extraAllowlist(await readSettings())
}

/**
 * Record a scheduled run. Never throws and never blocks the job: a cron that
 * did its work must not fail because the bookkeeping could not be written.
 */
export async function recordCronRun(job: string, startedAt: Date, ok: boolean, summary: Record<string, number | string | boolean>): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const { error } = await createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
      .from("cron_runs")
      .insert({ job, started_at: startedAt.toISOString(), ok, summary })
    if (error) console.error("[cron-runs] not recorded:", error.message)
  } catch (e) {
    console.error("[cron-runs] not recorded:", e instanceof Error ? e.message : e)
  }
}
