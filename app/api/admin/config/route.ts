import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/admin-access"
import { validReason } from "@/lib/admin-agencies"
import {
  ALLOWLIST_KEY,
  ALLOWLIST_MAX,
  KILL_KEYS,
  SWITCHES,
  extraAllowlist,
  isKillKey,
  isKilled,
  parseAllowlistAddress,
  type KillKey,
} from "@/lib/admin-config"
import { forgetSettings, readSettings } from "@/lib/admin-settings"
import { isMarketEnabled } from "@/lib/job-market"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

/**
 * Configuration, for the admin area.
 *
 * GET  — the off switches (what the environment says, whether a switch is
 *        set, and by whom), the staging email allowlist, and recent
 *        scheduled runs. Support and up.
 * POST — set or clear an off switch, or add or remove one staging address.
 *        Admin, two-step, reason. Written through admin_set_setting(), which
 *        logs the change in the same transaction.
 *
 * This route never reports the value of an environment variable — only
 * whether the environment has a feature on, and how many addresses its own
 * allowlist holds.
 */

/** Whether the ENVIRONMENT has each feature on, before any off switch. */
function environmentOn(key: KillKey): boolean {
  const all = process.env.COURSE_SOURCES_ENABLED !== "0"
  switch (key) {
    case "kill.market_insights": return isMarketEnabled()
    case "kill.course_sources": return all
    case "kill.course_youtube": return all && process.env.YOUTUBE_COURSES_ENABLED !== "0" && Boolean(process.env.YOUTUBE_API_KEY)
    case "kill.course_microsoft_learn": return all && process.env.MICROSOFT_LEARN_ENABLED !== "0"
  }
}

async function GET_handler() {
  try {
    const gate = await requireAdmin("support")
    if (!gate.ok) return gate.response

    const admin = createAdminClient()
    const settings = await readSettings({ fresh: true })
    const [meta, syncRuns, cronRuns] = await Promise.all([
      admin.from("admin_settings").select("key, updated_by, updated_at"),
      admin.from("course_sync_runs")
        .select("id, source, status, started_at, finished_at, discovered_count, candidate_count")
        .order("started_at", { ascending: false }).limit(12),
      admin.from("cron_runs").select("id, job, started_at, finished_at, ok, summary")
        .order("finished_at", { ascending: false }).limit(12),
    ])
    // A missing table (migration not run) must read as "could not load", not
    // as "nothing set" — an empty Configuration screen would look healthy.
    if (meta.error) throw meta.error
    if (cronRuns.error) throw cronRuns.error

    const rows = (meta.data ?? []) as Array<{ key: string; updated_by: string | null; updated_at: string }>
    const byIds = [...new Set(rows.map((r) => r.updated_by).filter((v): v is string => !!v))]
    const { data: profiles } = byIds.length
      ? await admin.from("profiles").select("id, full_name, email").in("id", byIds)
      : { data: [] }
    const nameOf = new Map(((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
      .map((p) => [p.id, p.full_name || p.email || "Unknown"]))
    const metaOf = new Map(rows.map((r) => [r.key, r]))

    const production = process.env.VERCEL_ENV === "production"
    const envList = (process.env.EMAIL_ALLOWLIST ?? "").split(",").map((a) => a.trim()).filter(Boolean)
    const allowMeta = metaOf.get(ALLOWLIST_KEY)

    return NextResponse.json({
      switches: KILL_KEYS.map((key) => {
        const m = metaOf.get(key)
        const off = isKilled(settings, key)
        return {
          key,
          ...SWITCHES[key],
          environmentOn: environmentOn(key),
          switchedOff: off,
          by: off && m?.updated_by ? nameOf.get(m.updated_by) ?? "Unknown" : null,
          at: off ? m?.updated_at ?? null : null,
        }
      }),
      allowlist: {
        production,
        // How many, and where from — never the addresses themselves.
        environmentCount: envList.length,
        environmentSet: envList.length > 0,
        extras: extraAllowlist(settings),
        by: allowMeta?.updated_by ? nameOf.get(allowMeta.updated_by) ?? "Unknown" : null,
        at: allowMeta?.updated_at ?? null,
        max: ALLOWLIST_MAX,
      },
      runs: [
        ...((cronRuns.data ?? []) as Array<{ id: number; job: string; started_at: string; finished_at: string; ok: boolean; summary: Record<string, unknown> }>).map((r) => ({
          id: `cron-${r.id}`, kind: "cron" as const, job: r.job, at: r.finished_at, ok: r.ok, summary: r.summary,
        })),
        ...((syncRuns.data ?? []) as Array<{ id: string; source: string; status: string; started_at: string; discovered_count: number; candidate_count: number }>).map((r) => ({
          id: `sync-${r.id}`, kind: "course_sync" as const, job: r.source, at: r.started_at,
          ok: r.status === "succeeded" || r.status === "partial", status: r.status,
          summary: { found: r.discovered_count, for_review: r.candidate_count },
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 15),
    })
  } catch (err) {
    console.error("[admin/config GET]", errorMessage(err))
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

const RPC_ERRORS: Record<string, { message: string; status: number }> = {
  no_change: { message: "Nothing changed: it is already set that way.", status: 409 },
  reason_required: { message: "Give a short reason for this change.", status: 400 },
}

async function POST_handler(req: NextRequest) {
  try {
    const gate = await requireAdmin("admin", { twoStep: true })
    if (!gate.ok) return gate.response

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!validReason(body?.reason)) {
      return NextResponse.json({ error: "Give a short reason for this change." }, { status: 400 })
    }

    let key: string
    let value: Record<string, unknown> | null
    if (body?.type === "switch") {
      if (!isKillKey(body.key) || typeof body.off !== "boolean") {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 })
      }
      key = body.key
      // Clearing the row — not storing {off:false} — is "back to the environment".
      value = body.off ? { off: true } : null
    } else if (body?.type === "allowlist") {
      if (body.action !== "add" && body.action !== "remove") {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 })
      }
      const parsed = parseAllowlistAddress(body.email)
      if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
      const current = extraAllowlist(await readSettings({ fresh: true }))
      let next: string[]
      if (body.action === "add") {
        if (current.includes(parsed.email)) return NextResponse.json({ error: "That address is already allowed." }, { status: 409 })
        if (current.length >= ALLOWLIST_MAX) return NextResponse.json({ error: `The list is full (${ALLOWLIST_MAX}). Remove one first.` }, { status: 409 })
        next = [...current, parsed.email]
      } else {
        if (!current.includes(parsed.email)) return NextResponse.json({ error: "That address is not on the list." }, { status: 404 })
        next = current.filter((a) => a !== parsed.email)
      }
      key = ALLOWLIST_KEY
      value = next.length ? { addresses: next } : null
    } else {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.rpc("admin_set_setting", {
      p_actor: gate.admin.userId, p_key: key, p_value: value, p_reason: body!.reason.trim(),
    })
    if (error) {
      const known = Object.keys(RPC_ERRORS).find((k) => error.message?.includes(k))
      if (known) return NextResponse.json({ error: RPC_ERRORS[known].message }, { status: RPC_ERRORS[known].status })
      throw error
    }

    // Verify the effect: read the row back, past the cache.
    forgetSettings()
    const { data: row, error: readErr } = await admin.from("admin_settings").select("value").eq("key", key).maybeSingle()
    if (readErr) throw readErr
    if (JSON.stringify(row?.value ?? null) !== JSON.stringify(value)) throw new Error("The change did not take effect.")
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[admin/config POST]", errorMessage(err))
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export const GET = withTiming("/api/admin/config", "GET", GET_handler)
export const POST = withTiming("/api/admin/config", "POST", POST_handler)
