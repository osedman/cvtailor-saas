/**
 * THE data-access layer for Tailr for Agencies.
 *
 * Rules (from docs/AGENCIES_SCHEMA.md — enforced here, not in routes):
 *
 * 1. This is the only module that builds queries against the `agency` schema.
 *    Route handlers never touch Supabase directly.
 * 2. Every function takes an AgencyContext as its first argument. The context
 *    is resolved from the session by requireAgencyContext() — agency_id is
 *    NEVER accepted from the client.
 * 3. Audit-coupled tables (requirements, constraints, reviews, overrides,
 *    decisions, scores, submissions, notices) are written ONLY through the
 *    service-role client here, in the same function that writes the
 *    agency.audit_log row. RLS blocks direct client writes as the backstop.
 * 4. Because the service role bypasses RLS, every admin write is preceded by
 *    an explicit agency ownership assertion (assertAgencyRow / ctx checks).
 */

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseJs, type SupabaseClient } from "@supabase/supabase-js"
import type { AgencyContext, AuditEntry, JobRole, MemberRole, Requirement, Weight } from "./types"

/** Schema-bound client. Loose generics on purpose: the repo carries no
 * generated DB types, and the ssr/js clients disagree on schema literals. */
export type AgencyClient = SupabaseClient<any, any, any, any, any>

// ============================================================
// Clients
// ============================================================

/** User-scoped client bound to the `agency` schema. RLS applies. */
export async function agencyDb(): Promise<AgencyClient> {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "agency" },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Read-only in route handlers; the proxy refreshes sessions.
        },
      },
    }
  )
}

/** Service-role client bound to the `agency` schema. Bypasses RLS — every
 * write through this MUST assert agency ownership first. */
export function agencyAdmin(): AgencyClient {
  return createSupabaseJs(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: "agency" },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}

// ============================================================
// Context
// ============================================================

export type ContextFailure = "unauthenticated" | "no_agency"

/** Cookie naming the agency the caller is currently working in. It is a
 * PREFERENCE, never a permission: the value is matched against the caller's
 * own active memberships on every request, and anything unrecognised falls
 * back to the default. Forging it gains nothing. */
export const AGENCY_COOKIE = "ag_agency"

/**
 * Resolve the caller's agency membership from the session. Returns the
 * user-scoped agency client alongside the context so routes reuse one client.
 *
 * Most people are in exactly one agency (they are provisioned by hand), and
 * for them nothing here has ever mattered. For anyone in two, the old rule —
 * oldest membership wins, silently — meant the second agency was invisible
 * with no switcher and no indication it existed. So the caller may name the
 * agency they are working in via AGENCY_COOKIE, and every membership comes
 * back on the context so the chrome can say which one that is.
 *
 * The cookie is validated against real memberships here; it can only ever
 * select between agencies the caller already belongs to.
 */
export async function requireAgencyContext(): Promise<
  | { ok: true; ctx: AgencyContext; db: AgencyClient }
  | { ok: false; failure: ContextFailure }
> {
  const db = await agencyDb()
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) return { ok: false, failure: "unauthenticated" }

  const { data: rows, error } = await db
    .from("members")
    .select("agency_id, role, created_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })

  if (error || !rows || rows.length === 0) {
    return { ok: false, failure: "no_agency" }
  }

  // Names come from agency.agencies, which members may read under RLS.
  const ids = rows.map((r) => r.agency_id as string)
  const { data: named } = await db.from("agencies").select("id, name").in("id", ids)
  const nameById = new Map<string, string>(
    (named ?? []).map((a) => [a.id as string, (a.name as string) ?? ""])
  )

  const memberships = rows.map((r) => ({
    agencyId: r.agency_id as string,
    agencyName: nameById.get(r.agency_id as string) ?? "",
    role: r.role as MemberRole,
  }))

  // Preference, then the long-standing default of the oldest membership.
  const cookieStore = await cookies()
  const preferred = cookieStore.get(AGENCY_COOKIE)?.value
  const active = memberships.find((m) => m.agencyId === preferred) ?? memberships[0]

  return {
    ok: true,
    db,
    ctx: {
      agencyId: active.agencyId,
      agencyName: active.agencyName,
      userId: user.id,
      role: active.role,
      memberships,
    },
  }
}

/** Viewers read everything; only owners and recruiters change anything. */
export function assertWriter(ctx: AgencyContext): void {
  if (ctx.role === "viewer") {
    throw new AgencyAccessError("viewers have read-only access")
  }
}

export class AgencyAccessError extends Error {}

/** Guard for service-role writes: the target row must belong to the caller's
 * agency. Throws on cross-tenant access — never returns silently. */
async function assertAgencyRow(
  admin: AgencyClient,
  table: string,
  id: string,
  agencyId: string
): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from(table).select("*").eq("id", id).maybeSingle()
  if (error) throw error
  if (!data || data.agency_id !== agencyId) {
    throw new AgencyAccessError(`${table} row not found in caller's agency`)
  }
  return data
}

// ============================================================
// Audit
// ============================================================

/** Append-only. Called inside every audit-coupled mutation below — if you are
 * writing one of those tables and not calling this, you are writing a bug. */
export async function writeAudit(admin: AgencyClient, entry: AuditEntry): Promise<void> {
  const { error } = await admin.from("audit_log").insert({
    agency_id: entry.agencyId,
    role_id: entry.roleId ?? null,
    candidate_id: entry.candidateId ?? null,
    actor_id: entry.actorId ?? null,
    entity_type: entry.entityType,
    entity_ref: entry.entityRef,
    action: entry.action,
    from_value: entry.fromValue ?? null,
    to_value: entry.toValue ?? null,
    reason: entry.reason ?? null,
  })
  if (error) throw error
}

// ============================================================
// Roles
// ============================================================

export async function listJobRoles(db: AgencyClient, ctx: AgencyContext): Promise<JobRole[]> {
  const { data, error } = await db
    .from("job_roles")
    .select("*")
    .eq("agency_id", ctx.agencyId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as JobRole[]
}

export async function getJobRole(
  db: AgencyClient,
  ctx: AgencyContext,
  roleId: string
): Promise<JobRole | null> {
  const { data, error } = await db
    .from("job_roles")
    .select("*")
    .eq("id", roleId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (error) throw error
  return (data as JobRole) ?? null
}

export async function createJobRole(
  db: AgencyClient,
  ctx: AgencyContext,
  input: Partial<Pick<JobRole, "title" | "company" | "company_context" | "salary_band" | "location" | "seniority" | "jd_raw" | "recruiter_notes">>
): Promise<JobRole> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: ref, error: refError } = await admin.rpc("next_role_ref", {
    p_agency: ctx.agencyId,
  })
  if (refError) throw refError

  // Insert through the USER client so RLS re-checks membership and role.
  const { data, error } = await db
    .from("job_roles")
    .insert({
      agency_id: ctx.agencyId,
      ref,
      title: input.title ?? "Untitled role",
      company: input.company ?? "",
      company_context: input.company_context ?? "",
      salary_band: input.salary_band ?? "",
      location: input.location ?? "",
      seniority: input.seniority ?? "",
      jd_raw: input.jd_raw ?? "",
      recruiter_notes: input.recruiter_notes ?? "",
      created_by: ctx.userId,
    })
    .select("*")
    .single()
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: data.id,
    actorId: ctx.userId,
    entityType: "role",
    entityRef: ref as string,
    action: "created",
    toValue: { title: data.title },
  })

  return data as JobRole
}

// ============================================================
// Requirements (audit-coupled: service-role writes only)
// ============================================================

/** Persist the parse output for a role. Replaces any existing parsed set that
 * has not been recruiter-edited; one audit row per requirement created. */
export async function saveParsedRequirements(
  ctx: AgencyContext,
  roleId: string,
  parsed: Array<{ text: string; weight: Weight; category?: string }>
): Promise<Requirement[]> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  await assertAgencyRow(admin, "job_roles", roleId, ctx.agencyId)

  const rows = parsed.map((p, i) => ({
    agency_id: ctx.agencyId,
    role_id: roleId,
    ref: `R${String(i + 1).padStart(2, "0")}`,
    text: p.text,
    weight: p.weight,
    category: p.category ?? "",
    origin: "parsed" as const,
    sort_order: i,
  }))

  const { data, error } = await admin
    .from("requirements")
    .upsert(rows, { onConflict: "role_id,ref" })
    .select("*")
  if (error) throw error

  for (const row of data ?? []) {
    await writeAudit(admin, {
      agencyId: ctx.agencyId,
      roleId,
      actorId: ctx.userId,
      entityType: "requirement",
      entityRef: row.ref,
      action: "created",
      toValue: { text: row.text, weight: row.weight },
      reason: "jd_parse",
    })
  }

  return (data ?? []) as Requirement[]
}

/** Persist parsed role constraints (C01…). Same audit coupling as requirements. */
export async function saveParsedConstraints(
  ctx: AgencyContext,
  roleId: string,
  parsed: Array<{ text: string; kind: "location" | "work-mode" | "comp" | "other" }>
): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  await assertAgencyRow(admin, "job_roles", roleId, ctx.agencyId)

  const rows = parsed.map((c, i) => ({
    agency_id: ctx.agencyId,
    role_id: roleId,
    ref: `C${String(i + 1).padStart(2, "0")}`,
    text: c.text,
    kind: c.kind,
    sort_order: i,
  }))
  if (rows.length === 0) return

  const { data, error } = await admin
    .from("role_constraints")
    .upsert(rows, { onConflict: "role_id,ref" })
    .select("ref, text")
  if (error) throw error

  for (const row of data ?? []) {
    await writeAudit(admin, {
      agencyId: ctx.agencyId,
      roleId,
      actorId: ctx.userId,
      entityType: "constraint",
      entityRef: row.ref,
      action: "created",
      toValue: { text: row.text },
      reason: "jd_parse",
    })
  }
}

/** Recruiter edit of a single requirement (text, weight, or both). */
export async function updateRequirement(
  ctx: AgencyContext,
  requirementId: string,
  patch: Partial<Pick<Requirement, "text" | "weight" | "category" | "sort_order">>,
  reason?: string
): Promise<Requirement> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const existing = await assertAgencyRow(admin, "requirements", requirementId, ctx.agencyId)

  const { data, error } = await admin
    .from("requirements")
    .update({ ...patch, origin: "recruiter" })
    .eq("id", requirementId)
    .select("*")
    .single()
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: existing.role_id as string,
    actorId: ctx.userId,
    entityType: "requirement",
    entityRef: existing.ref as string,
    action: "edited",
    fromValue: { text: existing.text, weight: existing.weight },
    toValue: { text: data.text, weight: data.weight },
    reason,
  })

  return data as Requirement
}

export async function deleteRequirement(
  ctx: AgencyContext,
  requirementId: string,
  reason?: string
): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const existing = await assertAgencyRow(admin, "requirements", requirementId, ctx.agencyId)

  const { error } = await admin.from("requirements").delete().eq("id", requirementId)
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: existing.role_id as string,
    actorId: ctx.userId,
    entityType: "requirement",
    entityRef: existing.ref as string,
    action: "deleted",
    fromValue: { text: existing.text, weight: existing.weight },
    reason,
  })
}
