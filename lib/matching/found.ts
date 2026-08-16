/**
 * "A role found you" — the consumer side of quiet matching.
 *
 * Everything here runs on the USER-SCOPED client, deliberately. The whole
 * §5.3 design is enforced in RLS: role_recommendations is SELECT-own,
 * published_roles is visible only-if-recommended, and the state machine is a
 * column grant plus a trigger. Reading through the user's own session means
 * those policies are load-bearing in production, not just in the verification
 * runbook — if a policy regresses, this page breaks visibly instead of a
 * service-role read papering over it.
 *
 * What this module will NOT do:
 *   - set state to 'applied'. That is the apply route's job (service role,
 *     consent event first, disclosure manifest). The trigger blocks it from
 *     a client session anyway; we do not even offer the string.
 *   - read match_scan_marks (no grants — scan bookkeeping is the scan's).
 *   - touch anything agency-side. The recommendation and the snapshot are
 *     the person's entire window onto the role.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ConsentSubject } from "./limits"
import type { Weight } from "@/lib/agency/types"

export interface FoundRequirement {
  ref: string
  text: string
  weight: Weight
  /** The person's own evidence against this requirement. Null quote ⇔ missing. */
  strength: "strong" | "transferable" | "partial" | "missing"
  quote: string | null
}

export interface FoundRole {
  /** role_recommendations.id — what the PATCH route addresses. */
  id: string
  state: "new" | "seen" | "dismissed" | "applied"
  /** 0–100, as scored on arrival. The UI rounds for display. */
  score: number
  foundAt: string
  role: {
    title: string
    company: string
    agencyName: string
    location: string
    salaryBand: string
    seniority: string
    summary: string
    /** 'live' | 'paused' | 'expired' — anything not live cannot be applied to. */
    status: string
  }
  requirements: FoundRequirement[]
}

interface RecRow {
  id: string
  published_role_id: string
  state: string
  score: number | string
  created_at: string
  evidence: Array<{ requirement_ref: string; strength: string; quote: string | null }>
}

interface RoleRow {
  id: string
  title: string
  company: string
  agency_name: string
  location: string
  salary_band: string
  seniority: string
  summary: string
  status: string
  requirements: Array<{ ref: string; text: string; weight: Weight }>
}

/**
 * Pure join, exported for tests: the recommendation's evidence map laid over
 * the snapshot's requirement list, in the snapshot's order. A requirement the
 * evidence map somehow lacks renders as missing — never invented, never
 * dropped, same rule as everywhere else in the product.
 */
export function joinFound(recs: RecRow[], roles: RoleRow[]): FoundRole[] {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const out: FoundRole[] = []

  for (const rec of recs) {
    const role = roleById.get(rec.published_role_id)
    // A recommendation whose snapshot RLS will not show us should not exist;
    // skipping quietly would hide a policy bug, so it is dropped loudly in
    // the sense that the count no longer matches — but never rendered
    // half-empty.
    if (!role) continue

    const byRef = new Map(rec.evidence.map((e) => [e.requirement_ref, e]))
    const requirements: FoundRequirement[] = (role.requirements ?? []).map((req) => {
      const found = byRef.get(req.ref)
      const strength = (found?.strength ?? "missing") as FoundRequirement["strength"]
      const quote = (found?.quote ?? "").trim()
      return {
        ref: req.ref,
        text: req.text,
        weight: req.weight,
        strength: quote === "" ? "missing" : strength,
        quote: quote === "" ? null : quote,
      }
    })

    out.push({
      id: rec.id,
      state: rec.state as FoundRole["state"],
      score: typeof rec.score === "string" ? parseFloat(rec.score) : rec.score,
      foundAt: rec.created_at,
      role: {
        title: role.title,
        company: role.company,
        agencyName: role.agency_name,
        location: role.location,
        salaryBand: role.salary_band,
        seniority: role.seniority,
        summary: role.summary,
        status: role.status,
      },
      requirements,
    })
  }

  // Newest first; dismissed sink to the bottom rather than vanish server-side
  // (the page decides how quietly to render them).
  const rank = (s: string) => (s === "dismissed" ? 1 : 0)
  return out.sort(
    (a, b) => rank(a.state) - rank(b.state) || b.foundAt.localeCompare(a.foundAt)
  )
}

/** The list, plus whether matching is on at all — the empty state needs to
 *  know the difference between "nothing yet" and "you have not opted in". */
export async function listFound(
  db: SupabaseClient
): Promise<{ found: FoundRole[]; matchingOn: boolean }> {
  const [{ data: recs, error: recErr }, { data: pref }] = await Promise.all([
    db
      .from("role_recommendations")
      .select("id, published_role_id, state, score, created_at, evidence"),
    db.from("match_preferences").select("matching_opt_in").maybeSingle(),
  ])
  if (recErr) throw recErr

  const recRows = (recs ?? []) as RecRow[]
  let roleRows: RoleRow[] = []
  if (recRows.length > 0) {
    const { data: roles, error: roleErr } = await db
      .from("published_roles")
      .select(
        "id, title, company, agency_name, location, salary_band, seniority, summary, status, requirements"
      )
      .in("id", [...new Set(recRows.map((r) => r.published_role_id))])
    if (roleErr) throw roleErr
    roleRows = (roles ?? []) as RoleRow[]
  }

  return {
    found: joinFound(recRows, roleRows),
    matchingOn: Boolean(pref?.matching_opt_in),
  }
}

/** Counts for the header pill. Dismissed and applied are settled — only new
 *  and seen mean "there is something here for you". */
export async function foundSummary(
  db: SupabaseClient
): Promise<{ open: number; unseen: number }> {
  const { data, error } = await db.from("role_recommendations").select("state")
  if (error) throw error
  const states = (data ?? []).map((r) => r.state as string)
  return {
    open: states.filter((s) => s === "new" || s === "seen").length,
    unseen: states.filter((s) => s === "new").length,
  }
}

/**
 * The two transitions a person may make from this page. 'applied' is not in
 * this type on purpose — offering it here would be offering a lie, since only
 * the apply route can make it true.
 */
export type FoundTransition = "seen" | "dismissed"

export async function setFoundState(
  db: SupabaseClient,
  recommendationId: string,
  to: FoundTransition
): Promise<boolean> {
  // seen only lifts 'new'; dismissing works from either live state. Neither
  // touches dismissed/applied rows — those are settled, and the DB trigger
  // backs this up if the filter is ever wrong.
  const from = to === "seen" ? ["new"] : ["new", "seen"]
  const { data, error } = await db
    .from("role_recommendations")
    .update({ state: to })
    .eq("id", recommendationId)
    .in("state", from)
    .select("id")
  if (error) throw error
  return (data ?? []).length > 0
}

/** Re-exported so the page has one import for its settings link copy. */
export type { ConsentSubject }
