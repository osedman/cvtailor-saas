/**
 * The tailor brief: what /tailor is given when entered from a recommendation.
 *
 * Role mode tailors against the role AS IT FOUND THE PERSON — the frozen
 * published_roles snapshot — never the live agency-side role. The brief text
 * is rendered deterministically from the snapshot here on the server, and the
 * tailor route uses THIS text regardless of what the client posts, so
 * "tailored against this role's frozen requirements" is true by construction
 * rather than by trusting a textarea.
 *
 * Reads run on the USER-SCOPED client on purpose (same reasoning as
 * found.ts): role_recommendations is SELECT-own and published_roles is
 * visible only-if-recommended, so RLS stays load-bearing. Nothing here can
 * see a role that has not already been shown to this person.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Weight } from "@/lib/agency/types"

interface SnapshotForBrief {
  title: string
  company: string
  agency_name: string
  role_ref: string
  seniority: string
  location: string
  salary_band: string
  summary: string
  requirements: Array<{ ref: string; text: string; weight: Weight }>
}

const WEIGHT_LINE: Record<Weight, string> = {
  must: "Must have",
  important: "Important",
  nice: "Nice to have",
}

/**
 * Deterministic: same snapshot, same text, byte for byte — the brief takes
 * part in the tailor cache key, so an identical re-entry must hit the cache
 * instead of burning a pipeline run.
 */
export function renderSnapshotJd(snapshot: SnapshotForBrief): string {
  const head = [
    snapshot.title,
    [snapshot.company, snapshot.seniority, snapshot.location, snapshot.salary_band]
      .filter(Boolean)
      .join(" · "),
  ]
    .filter(Boolean)
    .join("\n")

  const summary = snapshot.summary?.trim()

  const reqs = (snapshot.requirements ?? [])
    .map((r) => `- [${WEIGHT_LINE[r.weight] ?? r.weight}] ${r.text.trim()}`)
    .join("\n")

  return [head, summary, "Requirements:", reqs].filter(Boolean).join("\n\n")
}

export interface TailorBrief {
  recommendationId: string
  jd: string
  roleTitle: string
  company: string
  agencyName: string
  roleRef: string
  /** The hash the tailored CV will be linked against. */
  requirementsHash: string
}

export type TailorBriefResult =
  | { ok: true; brief: TailorBrief }
  | { ok: false; reason: "not_found" | "settled" | "not_live" }

/**
 * Load the brief for one recommendation. Mirrors the apply route's status
 * mapping: someone else's recommendation reads as not found (its existence is
 * itself information), settled recommendations refuse, and so does a role
 * that is no longer live — tailoring against a role you can no longer apply
 * to would be busywork with a deadline that already passed.
 */
export async function loadTailorBrief(
  db: SupabaseClient,
  recommendationId: string
): Promise<TailorBriefResult> {
  const { data: rec, error: recErr } = await db
    .from("role_recommendations")
    .select("id, state, published_role_id")
    .eq("id", recommendationId)
    .maybeSingle()
  if (recErr) throw recErr
  if (!rec) return { ok: false, reason: "not_found" }
  if (rec.state === "dismissed" || rec.state === "applied") {
    return { ok: false, reason: "settled" }
  }

  const { data: snapshot, error: snapErr } = await db
    .from("published_roles")
    .select(
      "id, title, company, agency_name, role_ref, seniority, location, salary_band, summary, status, requirements, requirements_hash"
    )
    .eq("id", rec.published_role_id)
    .maybeSingle()
  if (snapErr) throw snapErr
  if (!snapshot || snapshot.status !== "live") return { ok: false, reason: "not_live" }

  return {
    ok: true,
    brief: {
      recommendationId: rec.id as string,
      jd: renderSnapshotJd(snapshot as SnapshotForBrief),
      roleTitle: snapshot.title as string,
      company: snapshot.company as string,
      agencyName: snapshot.agency_name as string,
      roleRef: snapshot.role_ref as string,
      requirementsHash: snapshot.requirements_hash as string,
    },
  }
}
