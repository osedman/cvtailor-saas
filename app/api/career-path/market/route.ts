import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errMessage } from "@/lib/err"
import {
  fetchMarket, isMarketEnabled, isFresh, normaliseRoleKey, computeUnlocks,
  type MarketJob, type SalaryBand,
} from "@/lib/job-market"
import type { CareerRoadmapItem } from "@/lib/anthropic"
import { loadItems } from "@/lib/roadmap-store"

export const maxDuration = 60

/**
 * Live market insight for the user's locked North Star: salary band, live role
 * count, and "close this skill → N more roles open".
 *
 * Flagged off by default (MARKET_INSIGHTS_ENABLED + REED_API_KEY). When off, or
 * when upstream fails, this returns `{ enabled: false }` and the UI renders
 * nothing — the career path behaves exactly as it does today.
 *
 * Snapshots are cached by (role, region), shared across all users.
 */
/** Get-or-fetch the shared (role, region) snapshot; returns just the summary
 * fields. Used by the chooser to price candidate roles BEFORE one is locked. */
async function summarise(
  admin: ReturnType<typeof createAdminClient>,
  role: string,
  region: string,
): Promise<{ band: SalaryBand | null; totalRoles: number; topCompanies: string[] } | null> {
  const key = normaliseRoleKey(role, region)
  const { data: cached } = await admin
    .from("market_snapshots").select("total_roles, band, top_companies, fetched_at").eq("role_key", key).maybeSingle()
  if (cached && isFresh(cached.fetched_at as string)) {
    return {
      band: (cached.band as SalaryBand | null) ?? null,
      totalRoles: (cached.total_roles as number) ?? 0,
      topCompanies: (cached.top_companies as string[]) ?? [],
    }
  }
  const fresh = await fetchMarket(role, region)
  if (!fresh) return null
  try {
    await admin.from("market_snapshots").upsert({
      role_key: key, role, region,
      total_roles: fresh.totalRoles, band: fresh.band,
      top_companies: fresh.topCompanies, jobs: fresh.jobs,
      fetched_at: fresh.fetchedAt,
    }, { onConflict: "role_key" })
  } catch { /* caching is best-effort */ }
  return { band: fresh.band, totalRoles: fresh.totalRoles, topCompanies: fresh.topCompanies }
}

/**
 * Batch market summaries for the role CHOOSER — salary band + live role count
 * per suggested target, so the choice is priced before it's made (the sync's
 * "role search was missing salary" note, S2). Bounded to 4 roles; each is one
 * cached weekly snapshot shared across users, so a cold chooser costs at most
 * 4 upstream calls and a warm one costs none.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    if (!isMarketEnabled()) return NextResponse.json({ enabled: false })

    const body = await req.json().catch(() => ({}))
    const roles = (Array.isArray(body?.roles) ? body.roles : [])
      .map((r: unknown) => String(r ?? "").trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 4)
    if (roles.length === 0) return NextResponse.json({ enabled: true, summaries: {} })

    const { data: prof } = await supabase.from("profiles").select("country").eq("id", user.id).maybeSingle()
    const region = ((prof?.country as string) || "GB").toUpperCase()

    const admin = createAdminClient()
    const results = await Promise.all(roles.map((r: string) => summarise(admin, r, region)))
    const summaries: Record<string, { band: SalaryBand | null; totalRoles: number; topCompanies: string[] }> = {}
    roles.forEach((r: string, i: number) => { if (results[i]) summaries[r] = results[i]! })
    return NextResponse.json({ enabled: true, summaries })
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    if (!isMarketEnabled()) return NextResponse.json({ enabled: false })

    const { data: rm } = await supabase
      .from("career_roadmaps").select("target_role").eq("user_id", user.id).maybeSingle()
    const role = ((rm?.target_role as string) ?? "").trim()
    if (!role) return NextResponse.json({ enabled: true, snapshot: null })

    // Core only. "Closing X opens N roles" is a statement about the North Star;
    // letting run-surfaced quick wins in would make the number swing with
    // whatever job the user last tailored for.
    const items = await loadItems(supabase, user.id, { horizon: "core" })
    const openSkills = items.filter((i) => i.status !== "done").map((i) => i.skill)

    const { data: prof } = await supabase.from("profiles").select("country").eq("id", user.id).maybeSingle()
    const region = ((prof?.country as string) || "GB").toUpperCase()
    const key = normaliseRoleKey(role, region)

    // Cached snapshot: shared by every user targeting this role.
    const admin = createAdminClient()
    const { data: cached } = await admin
      .from("market_snapshots").select("*").eq("role_key", key).maybeSingle()

    if (cached && isFresh(cached.fetched_at as string)) {
      const jobs = (cached.jobs as MarketJob[]) ?? []
      return NextResponse.json({
        enabled: true,
        snapshot: {
          role: cached.role,
          region: cached.region,
          totalRoles: cached.total_roles,
          band: (cached.band as SalaryBand | null) ?? null,
          topCompanies: (cached.top_companies as string[]) ?? [],
          // Unlocks are per-user (their open skills), recomputed from cached jobs.
          unlocks: computeUnlocks(jobs, openSkills).slice(0, 5),
          fetchedAt: cached.fetched_at,
        },
        cached: true,
      })
    }

    const fresh = await fetchMarket(role, region)
    if (!fresh) return NextResponse.json({ enabled: true, snapshot: null })

    // Cache the sampled postings so later users targeting this role get their
    // own unlock counts computed without another upstream call.
    try {
      await admin.from("market_snapshots").upsert({
        role_key: key,
        role,
        region,
        total_roles: fresh.totalRoles,
        band: fresh.band,
        top_companies: fresh.topCompanies,
        jobs: fresh.jobs,
        fetched_at: fresh.fetchedAt,
      }, { onConflict: "role_key" })
    } catch { /* caching is best-effort */ }

    return NextResponse.json({
      enabled: true,
      cached: false,
      snapshot: {
        role,
        region,
        totalRoles: fresh.totalRoles,
        band: fresh.band,
        topCompanies: fresh.topCompanies,
        unlocks: computeUnlocks(fresh.jobs, openSkills).slice(0, 5),
        fetchedAt: fresh.fetchedAt,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: errMessage(err) }, { status: 500 })
  }
}
