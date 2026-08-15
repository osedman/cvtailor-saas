/**
 * Publish-for-matching: the recruiter side of quiet matching.
 *
 * What a recruiter controls: whether this role is findable, and the minimum
 * score. What a recruiter gets back: whether it is on, and when the scan last
 * ran. NOTHING person-shaped crosses this boundary at all — not who matched,
 * and (decided 15 Aug) not how many either. A count is information about
 * people who never chose to be visible to this agency, and the signed-off
 * frame promises "until someone applies, you see nobody".
 *
 * If you find yourself adding a richer return value to this module, you are
 * probably building the thing the product promised not to be.
 *
 * Audit-coupled in the standard way: agency.role_matching has no
 * authenticated write policies, every mutation below runs on the service
 * role with its agency.audit_log row in the same operation, and the UI shows
 * the AUDIT LOGGED pill.
 *
 * PUBLISHING FREEZES A SNAPSHOT. public.published_roles gets a copy of the
 * title, context and requirements as they stand. The person reads THAT, is
 * scored against THAT, and applies against THAT — so a recruiter editing the
 * live role cannot retroactively change what somebody agreed to send.
 * Re-publishing refreshes the snapshot in place (same row id, so existing
 * recommendations keep their FK) and stamps a new requirements_hash, which
 * makes the next scan re-assess everyone.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { createHash } from "crypto"
import {
  agencyAdmin,
  assertWriter,
  writeAudit,
  type AgencyClient,
} from "./db"
import type { AgencyContext, Weight } from "./types"
import { MIN_SCORE_CEILING, MIN_SCORE_FLOOR } from "@/lib/matching/limits"
import { queueMatchScan } from "@/lib/matching/scan"

/**
 * What a recruiter may know about matching on their own role.
 *
 * THERE IS NO COUNT HERE, AND THAT IS THE POINT (decided 15 Aug, Ose).
 * The signed-off frame promises "until someone applies, you see nobody", and
 * a rounded count is still something: it is information about people who
 * never chose to be visible to this agency. `agency.role_matching.matched_bucket`
 * is still maintained by the scan for operations, but it stops at the
 * database — it is deliberately absent from this type, so a recruiter surface
 * cannot render it by accident. Making it structural beats remembering.
 *
 * `lastScanAt` / `nextScanAllowedAt` exist to solve the other half: without
 * them, publishing is a black hole where "found nobody", "found people who
 * haven't applied" and "the scan is broken" all look identical — the
 * 200 {enabled:false} trap in CLAUDE.md. Liveness without disclosure.
 */
export interface MatchingStatus {
  enabled: boolean
  minScore: number
  lastScanAt: string | null
  nextScanAllowedAt: string | null
  scanQueued: boolean
}

interface SnapshotRequirement {
  ref: string
  text: string
  weight: Weight
}

/** Same shape scan-core hashes — order-independent, content-sensitive. */
function hashRequirements(requirements: SnapshotRequirement[]): string {
  const canonical = [...requirements]
    .sort((a, b) => (a.ref < b.ref ? -1 : 1))
    .map((r) => `${r.ref} ${r.weight} ${r.text.trim()}`)
    .join("")
  return createHash("sha256").update(canonical).digest("hex")
}

/** Read the recruiter-visible state. User-scoped client: RLS re-checks. */
export async function getMatchingStatus(
  db: AgencyClient,
  roleId: string
): Promise<MatchingStatus | null> {
  const { data, error } = await db
    .from("role_matching")
    // matched_bucket is deliberately NOT selected — see MatchingStatus.
    .select("enabled, min_score, last_scan_at, next_scan_allowed_at")
    .eq("role_id", roleId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    enabled: Boolean(data.enabled),
    minScore: data.min_score as number,
    lastScanAt: (data.last_scan_at as string | null) ?? null,
    nextScanAllowedAt: (data.next_scan_allowed_at as string | null) ?? null,
    scanQueued: false,
  }
}

/**
 * Publish (or re-publish) a role for matching, freeze the snapshot, and
 * queue the scan if the cooldown allows. Returns the new status; the caller
 * hands the queued job to `after()`.
 */
export async function publishForMatching(
  ctx: AgencyContext,
  roleId: string,
  minScore: number
): Promise<MatchingStatus & { queuedJobId: string | null }> {
  assertWriter(ctx)
  if (
    !Number.isInteger(minScore) ||
    minScore < MIN_SCORE_FLOOR ||
    minScore > MIN_SCORE_CEILING
  ) {
    throw new Error(`minScore must be an integer between ${MIN_SCORE_FLOOR} and ${MIN_SCORE_CEILING}`)
  }

  const admin = agencyAdmin()
  const publicAdmin = createAdminClient()

  // The role and its requirements, cross-tenant-checked.
  const { data: role, error: roleErr } = await admin
    .from("job_roles")
    .select("id, agency_id, ref, title, company, company_context, salary_band, location, seniority, status")
    .eq("id", roleId)
    .maybeSingle()
  if (roleErr) throw roleErr
  if (!role || role.agency_id !== ctx.agencyId) {
    throw new Error("role not found in caller's agency")
  }
  if (role.status === "closed") {
    throw new Error("a closed role cannot be published for matching")
  }

  const { data: reqRows, error: reqErr } = await admin
    .from("requirements")
    .select("ref, text, weight")
    .eq("role_id", roleId)
    .order("sort_order", { ascending: true })
  if (reqErr) throw reqErr
  const requirements = (reqRows ?? []) as SnapshotRequirement[]
  if (requirements.length === 0) {
    // An unrequirement'd role must find nobody — refusing at publish beats
    // scanning the whole pool against nothing.
    throw new Error("parse the role's requirements before publishing for matching")
  }

  const { data: agencyRow } = await admin
    .from("agencies")
    .select("name")
    .eq("id", ctx.agencyId)
    .single()

  const requirementsHash = hashRequirements(requirements)

  // Freeze (or refresh) the snapshot. Upsert on role_id keeps the same
  // published row id across re-publishes so recommendations' FK holds.
  const { data: snapshot, error: snapErr } = await publicAdmin
    .from("published_roles")
    .upsert(
      {
        agency_id: ctx.agencyId,
        role_id: roleId,
        agency_name: (agencyRow?.name as string) ?? "",
        role_ref: role.ref as string,
        title: role.title as string,
        company: (role.company as string) ?? "",
        location: (role.location as string) ?? "",
        seniority: (role.seniority as string) ?? "",
        salary_band: (role.salary_band as string) ?? "",
        summary: (role.company_context as string) ?? "",
        requirements,
        requirements_hash: requirementsHash,
        min_score: minScore,
        status: "live",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "role_id" }
    )
    .select("id")
    .single()
  if (snapErr) throw snapErr

  const { data: existing } = await admin
    .from("role_matching")
    .select("enabled, min_score, next_scan_allowed_at")
    .eq("role_id", roleId)
    .maybeSingle()

  const { error: rmErr } = await admin.from("role_matching").upsert(
    {
      role_id: roleId,
      agency_id: ctx.agencyId,
      enabled: true,
      min_score: minScore,
      published_role_id: snapshot.id as string,
      requirements_hash: requirementsHash,
      created_by: ctx.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "role_id" }
  )
  if (rmErr) throw rmErr

  // The audit row, same operation. Publishing is a disclosure decision.
  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    actorId: ctx.userId,
    entityType: "matching",
    entityRef: role.ref as string,
    action: existing ? "matching_updated" : "matching_published",
    fromValue: existing
      ? { enabled: existing.enabled, minScore: existing.min_score }
      : null,
    toValue: { enabled: true, minScore, requirementsHash },
  })

  // Queue the scan unless the cooldown says no. The cooldown is the
  // anti-probing control — a min-score change inside the window updates what
  // the NEXT scan means, it does not buy an extra scan.
  const coolUntil = existing?.next_scan_allowed_at
    ? new Date(existing.next_scan_allowed_at as string)
    : null
  let queuedJobId: string | null = null
  if (!coolUntil || coolUntil.getTime() <= Date.now()) {
    queuedJobId = await queueMatchScan(ctx.agencyId, roleId)
  }

  return {
    enabled: true,
    minScore,
    lastScanAt: null,
    nextScanAllowedAt: existing?.next_scan_allowed_at as string | null,
    scanQueued: queuedJobId != null,
    queuedJobId,
  }
}

/**
 * Pause matching. The published role stops being visible to anyone new
 * (status leaves 'live'); existing recommendations remain — a person's
 * record of what was shown to them is theirs, and pausing must not erase it.
 */
export async function pauseMatching(ctx: AgencyContext, roleId: string): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const publicAdmin = createAdminClient()

  const { data: existing, error } = await admin
    .from("role_matching")
    .select("enabled, min_score, published_role_id")
    .eq("role_id", roleId)
    .maybeSingle()
  if (error) throw error
  if (!existing) return

  const { data: role } = await admin
    .from("job_roles")
    .select("agency_id, ref")
    .eq("id", roleId)
    .maybeSingle()
  if (!role || role.agency_id !== ctx.agencyId) {
    throw new Error("role not found in caller's agency")
  }

  const { error: rmErr } = await admin
    .from("role_matching")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("role_id", roleId)
  if (rmErr) throw rmErr

  if (existing.published_role_id) {
    const { error: prErr } = await publicAdmin
      .from("published_roles")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", existing.published_role_id as string)
    if (prErr) throw prErr
  }

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    actorId: ctx.userId,
    entityType: "matching",
    entityRef: role.ref as string,
    action: "matching_paused",
    fromValue: { enabled: existing.enabled, minScore: existing.min_score },
    toValue: { enabled: false },
  })
}
