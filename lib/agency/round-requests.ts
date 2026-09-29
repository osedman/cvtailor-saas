/**
 * The hiring manager asks for another round — Figma board 33 (approved
 * 29 Sep 2026). See the migration 20260929120000_round_requests.sql for the
 * lines this keeps: a request is not a round, the reason is required, and
 * every step is an append-only, audited row.
 *
 * Two sides:
 *   · the hiring manager asks (or takes it back) — link proven, and only for
 *     people they took forward, since a round is for someone still in it;
 *   · the recruiter answers — 'added' raises job_roles.planned_rounds by one
 *     in the same operation, so the existing wave/invite flow reaches the
 *     people asked for; 'replied' closes it without a round.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import { getClientShortlist } from "./client-shortlist"
import { hasAdvanceDecision } from "./placements"
import type { AgencyContext, HiringContext } from "./types"

export const MAX_NOTE = 2000
export const MAX_PLANNED_ROUNDS = 6

export class RoundRequestInputError extends Error {}

export interface RoundRequest {
  id: string
  candidateRefs: string[]
  note: string
  roundNumber: number | null
  at: string
  byContactId: string | null
}

type Row = Record<string, unknown>

/**
 * The open request on a role, or null. Pure over rows in ANY order; exported
 * for tests. A request is open while its 'asked' row has no closing row.
 * Only one can be open: asking again while one is open is refused, so the
 * newest open one is the one.
 */
export function openRequest(rows: Row[]): RoundRequest | null {
  const closed = new Set(rows.filter((r) => r.action !== "asked").map((r) => r.request_id as string))
  const open = rows
    .filter((r) => r.action === "asked" && !closed.has(r.id as string))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
  if (!open) return null
  return {
    id: open.id as string,
    candidateRefs: (open.candidate_refs as string[]) ?? [],
    note: (open.note as string) ?? "",
    roundNumber: (open.round_number as number | null) ?? null,
    at: open.created_at as string,
    byContactId: (open.by_contact_id as string | null) ?? null,
  }
}

async function readRows(admin: ReturnType<typeof agencyAdmin>, agencyId: string, roleId: string): Promise<Row[]> {
  const { data, error } = await admin
    .from("round_requests")
    .select("id, request_id, action, candidate_refs, note, round_number, by_contact_id, created_at")
    .eq("agency_id", agencyId)
    .eq("role_id", roleId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error
  return data ?? []
}

/** Open requests for many roles at once — for the role-facts ladder. */
export async function openRequestsForRoles(
  admin: ReturnType<typeof agencyAdmin>,
  agencyId: string,
  roleIds: string[]
): Promise<Map<string, RoundRequest>> {
  const out = new Map<string, RoundRequest>()
  if (roleIds.length === 0) return out
  const { data, error } = await admin
    .from("round_requests")
    .select("id, role_id, request_id, action, candidate_refs, note, round_number, by_contact_id, created_at")
    .eq("agency_id", agencyId)
    .in("role_id", roleIds)
  // A table not there yet (migration not run) must not take the whole
  // dashboard down with it — it reads as "no requests".
  if (error) return out
  const byRole = new Map<string, Row[]>()
  for (const r of data ?? []) byRole.set(r.role_id as string, [...(byRole.get(r.role_id as string) ?? []), r])
  for (const [roleId, rows] of byRole) {
    const o = openRequest(rows)
    if (o) out.set(roleId, o)
  }
  return out
}

/** Validates the hiring manager's ask. Pure; exported for tests. */
export function validateAsk(input: { candidateRefs?: unknown; note?: unknown }):
  | { ok: true; refs: string[]; note: string }
  | { ok: false; error: string } {
  const refs = Array.isArray(input.candidateRefs)
    ? [...new Set(input.candidateRefs.filter((r): r is string => typeof r === "string" && r.trim() !== "").map((r) => r.trim()))]
    : []
  if (refs.length === 0) return { ok: false, error: "choose who the round is with" }
  if (refs.length > 20) return { ok: false, error: "too many people for one round" }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE) : ""
  if (!note) return { ok: false, error: "say what you still need to find out — it is the brief for the round" }
  return { ok: true, refs, note }
}

async function linkedRole(ctx: HiringContext, roleId: string) {
  const admin = agencyAdmin()
  const { data: role, error } = await admin
    .from("job_roles")
    .select("id, agency_id, ref, contact_id, planned_rounds")
    .eq("id", roleId)
    .maybeSingle()
  if (error) throw error
  if (!role) throw new AgencyAccessError("role not found")
  const link = ctx.links.find((l) => l.agencyId === role.agency_id && l.contactId === (role.contact_id as string | null))
  if (!link) throw new AgencyAccessError("role not found")
  return { admin, role }
}

/** The hiring manager's view of the open request on their role. */
export async function requestForHiringRole(ctx: HiringContext, roleId: string): Promise<RoundRequest | null> {
  const { admin, role } = await linkedRole(ctx, roleId)
  return openRequest(await readRows(admin, role.agency_id as string, roleId))
}

/** The hiring manager asks for another round, or takes an open ask back. */
export async function recordHiringRoundRequest(
  ctx: HiringContext,
  roleId: string,
  input: { action?: unknown; candidateRefs?: unknown; note?: unknown }
): Promise<RoundRequest | null> {
  const { admin, role } = await linkedRole(ctx, roleId)
  const agencyId = role.agency_id as string
  const open = openRequest(await readRows(admin, agencyId, roleId))

  if (input.action === "withdrawn") {
    if (!open) throw new RoundRequestInputError("there is no open request to take back")
    await admin.from("round_requests").insert({
      agency_id: agencyId, role_id: roleId, request_id: open.id, action: "withdrawn",
      by_contact_id: role.contact_id, decided_by: ctx.userId,
    }).then(({ error }) => { if (error) throw error })
    await writeAudit(admin, {
      agencyId, roleId, actorId: ctx.userId, entityType: "role", entityRef: (role.ref as string) ?? "",
      action: "round_request_withdrawn", fromValue: { request_id: open.id }, toValue: null,
    })
    return null
  }

  if (input.action !== "asked") throw new RoundRequestInputError("unknown action")
  if (open) throw new RoundRequestInputError("you already asked for another round — take that back first")
  const v = validateAsk(input)
  if (!v.ok) throw new RoundRequestInputError(v.error)

  // The submission is the gate: only people sent to this manager, and only
  // people they took forward — a round is for someone still in the process.
  const shortlist = await getClientShortlist(ctx, roleId)
  const sent = new Set((shortlist?.entries ?? []).map((e) => e.ref))
  const { data: cands, error: cErr } = await admin
    .from("candidates").select("id, ref").eq("agency_id", agencyId).eq("role_id", roleId).in("ref", v.refs)
  if (cErr) throw cErr
  for (const ref of v.refs) {
    const c = (cands ?? []).find((x) => x.ref === ref)
    if (!c || !sent.has(ref)) throw new AgencyAccessError("candidate not found")
    if (!(await hasAdvanceDecision(admin, agencyId, roleId, c.id as string))) {
      throw new RoundRequestInputError(`${ref} is not someone you took forward`)
    }
  }

  const planned = (role.planned_rounds as number | null) ?? 2
  const roundNumber = Math.min(planned + 1, MAX_PLANNED_ROUNDS + 1)
  const { data: saved, error } = await admin.from("round_requests").insert({
    agency_id: agencyId, role_id: roleId, action: "asked", candidate_refs: v.refs, note: v.note,
    round_number: roundNumber, by_contact_id: role.contact_id, decided_by: ctx.userId,
  }).select("id, request_id, action, candidate_refs, note, round_number, by_contact_id, created_at").single()
  if (error) throw error
  await writeAudit(admin, {
    agencyId, roleId, actorId: ctx.userId, entityType: "role", entityRef: (role.ref as string) ?? "",
    action: "round_requested", fromValue: null, toValue: { candidate_refs: v.refs, note: v.note, round_number: roundNumber },
  })
  return openRequest([saved])
}

/** The recruiter's view — RLS scopes the read to their agency. */
export async function requestForAgencyRole(ctx: AgencyContext, roleId: string): Promise<RoundRequest | null> {
  const admin = agencyAdmin()
  return openRequest(await readRows(admin, ctx.agencyId, roleId))
}

/**
 * The recruiter answers the open request. 'added' raises planned_rounds by
 * one in the same operation — the plan changes only by the recruiter's act,
 * and the existing wave flow then invites the people asked for.
 */
export async function answerRoundRequest(
  ctx: AgencyContext,
  roleId: string,
  action: unknown
): Promise<{ plannedRounds: number | null }> {
  assertWriter(ctx)
  if (action !== "added" && action !== "replied") throw new RoundRequestInputError("unknown action")
  const admin = agencyAdmin()
  const { data: role, error } = await admin
    .from("job_roles").select("id, agency_id, ref, planned_rounds").eq("id", roleId).eq("agency_id", ctx.agencyId).maybeSingle()
  if (error) throw error
  if (!role) throw new AgencyAccessError("role not found")
  const open = openRequest(await readRows(admin, ctx.agencyId, roleId))
  if (!open) throw new RoundRequestInputError("there is no open request on this role")

  const before = (role.planned_rounds as number | null) ?? 2
  let after: number | null = null
  if (action === "added") {
    if (before >= MAX_PLANNED_ROUNDS) {
      throw new RoundRequestInputError(`this role already plans ${MAX_PLANNED_ROUNDS} rounds, the most it can`)
    }
    after = before + 1
    const { error: upErr } = await admin.from("job_roles").update({ planned_rounds: after }).eq("id", roleId).eq("agency_id", ctx.agencyId)
    if (upErr) throw upErr
  }
  const { error: insErr } = await admin.from("round_requests").insert({
    agency_id: ctx.agencyId, role_id: roleId, request_id: open.id, action,
    candidate_refs: open.candidateRefs, round_number: open.roundNumber, decided_by: ctx.userId,
  })
  if (insErr) throw insErr
  await writeAudit(admin, {
    agencyId: ctx.agencyId, roleId, actorId: ctx.userId, entityType: "role", entityRef: (role.ref as string) ?? "",
    action: action === "added" ? "round_request_added" : "round_request_replied",
    fromValue: { request_id: open.id, planned_rounds: before },
    toValue: { planned_rounds: after ?? before, candidate_refs: open.candidateRefs },
  })
  return { plannedRounds: after ?? before }
}
