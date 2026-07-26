import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { errMessage } from "@/lib/err"
import {
  fetchMarket, isMarketEnabled, isFresh, normaliseRoleKey, computeUnlocks,
  type MarketJob, type SalaryBand,
} from "@/lib/job-market"
import type { CareerRoadmapItem } from "@/lib/anthropic"

export const maxDuration = 60

/**
 * Live market insight for the user's locked North Star: salary band, live role
 * count, and "close this skill → N more roles open".
 *
 * Flagged off by default (MARKET_INSIGHTS_ENABLED + Adzuna keys). When off, or
 * when upstream fails, this returns `{ enabled: false }` and the UI renders
 * nothing — the career path behaves exactly as it does today.
 *
 * Snapshots are cached by (role, region), shared across all users.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
    if (!isMarketEnabled()) return NextResponse.json({ enabled: false })

    const { data: rm } = await supabase
      .from("career_roadmaps").select("target_role, items").eq("user_id", user.id).maybeSingle()
    const role = ((rm?.target_role as string) ?? "").trim()
    if (!role) return NextResponse.json({ enabled: true, snapshot: null })

    const items = (rm?.items as CareerRoadmapItem[]) ?? []
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
