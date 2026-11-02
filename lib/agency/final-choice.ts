/**
 * The hiring manager's final choice, with their reason — Figma board 31,
 * bands B and C (approved 28 Sep 2026).
 *
 * WHY. Ose advanced two candidates at the last planned round of ROL-2419 and
 * the product said "You took 2 forward" and stopped. The choice between them
 * happened on the recruiter's close-out screen, where the client never is,
 * and the recruiter guessed: "Suggested" appeared only when exactly one
 * person had been taken forward. And nothing recorded WHY — the hiring
 * manager's justification for a selection existed nowhere.
 *
 * A PREFERENCE, NOT A HIRE. There is still no 'hire' value on the client's
 * side. The hire, the offer and the placement stay the recruiter's acts; a
 * fact outranks a preference (placements.ts). Choosing one person writes
 * nothing about anyone else: the people not chosen stay "taken forward"
 * until the recruiter closes the loop with them. No code path here turns a
 * choice into a decline.
 *
 * THE REASON IS REQUIRED, and it is the hiring manager's own words. It
 * travels to the recruiter with the choice and into the handover pack.
 *
 * APPEND-ONLY, NEWEST WINS — round_decisions' shape. Changing a choice
 * writes a new row; 'withdrawn' returns the role to "not chosen yet".
 *
 * AUDIT-COUPLED. agency.client_final_choices has no authenticated write
 * grants; this module is the only writer — service role, link proven, audit
 * row in the same operation.
 */

import { agencyAdmin, writeAudit, AgencyAccessError } from "./db"
import { assertNotRevoked } from "./revocation"
import { getClientShortlist } from "./client-shortlist"
import { hasAdvanceDecision } from "./placements"
import type { HiringContext } from "./types"

export type FinalChoiceAction = "chosen" | "neither" | "withdrawn"

export const MAX_REASON = 2000

/** The request was understood and refused on its content — a 400, not a 404. */
export class FinalChoiceInputError extends Error {}

export interface FinalChoice {
  action: FinalChoiceAction
  candidateId: string | null
  candidateRef: string | null
  reason: string
  at: string
  byContactId: string | null
}

/**
 * The live choice for a role, or null when nobody has chosen (or the newest
 * row withdrew it). Pure over rows ordered newest first; exported for tests.
 */
export function liveChoice(rows: Array<Record<string, unknown>>): FinalChoice | null {
  const newest = rows[0]
  if (!newest || newest.action === "withdrawn") return null
  return {
    action: newest.action as FinalChoiceAction,
    candidateId: (newest.candidate_id as string | null) ?? null,
    candidateRef: (newest.candidate_ref as string | null) ?? null,
    reason: (newest.reason as string) ?? "",
    at: newest.created_at as string,
    byContactId: (newest.by_contact_id as string | null) ?? null,
  }
}

/** Server-side read for either side of the process. Caller proves access. */
export async function readFinalChoice(
  admin: ReturnType<typeof agencyAdmin>,
  agencyId: string,
  roleId: string
): Promise<FinalChoice | null> {
  const { data, error } = await admin
    .from("client_final_choices")
    .select("action, candidate_id, candidate_ref, reason, created_at, by_contact_id")
    .eq("agency_id", agencyId)
    .eq("role_id", roleId)
    .order("created_at", { ascending: false })
    .limit(1)
  if (error) throw error
  return liveChoice(data ?? [])
}

async function linkedRole(ctx: HiringContext, roleId: string) {
  const admin = agencyAdmin()
  const { data: role, error } = await admin
    .from("job_roles")
    .select("id, agency_id, ref, contact_id")
    .eq("id", roleId)
    .maybeSingle()
  if (error) throw error
  if (!role) throw new AgencyAccessError("role not found")
  // Linkage is invite-only and proven here. A role held by a contact this
  // manager is not linked to reads as not found — never "forbidden", which
  // would confirm it exists.
  const link = ctx.links.find(
    (l) => l.agencyId === role.agency_id && l.contactId === (role.contact_id as string | null)
  )
  if (!link) throw new AgencyAccessError("role not found")
  await assertNotRevoked(roleId, link.contactId)
  return { admin, role, link }
}

/** The hiring manager's view of their own live choice. */
export async function finalChoiceForHiringRole(ctx: HiringContext, roleId: string): Promise<FinalChoice | null> {
  const { admin, role } = await linkedRole(ctx, roleId)
  return readFinalChoice(admin, role.agency_id as string, roleId)
}

/**
 * Validates the input shape. Pure; exported for the test. Returns the
 * normalised input or a sentence saying what is wrong.
 */
export function validateChoiceInput(input: {
  action?: unknown
  candidateRef?: unknown
  reason?: unknown
}): { ok: true; action: FinalChoiceAction; candidateRef: string | null; reason: string } | { ok: false; error: string } {
  const action = input.action
  if (action !== "chosen" && action !== "neither" && action !== "withdrawn") {
    return { ok: false, error: "unknown action" }
  }
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, MAX_REASON) : ""
  const candidateRef = typeof input.candidateRef === "string" ? input.candidateRef.trim() : ""
  if (action === "chosen" && !candidateRef) return { ok: false, error: "say who you are choosing" }
  if (action !== "withdrawn" && !reason) {
    return {
      ok: false,
      error:
        action === "chosen"
          ? "say why, in a sentence — it goes to your recruiter with your choice"
          : "say why neither, in a sentence — it goes to your recruiter",
    }
  }
  return { ok: true, action, candidateRef: action === "chosen" ? candidateRef : null, reason: action === "withdrawn" ? "" : reason }
}

/** Record the hiring manager's choice. Append-only; never updates a prior row. */
export async function recordFinalChoice(
  ctx: HiringContext,
  roleId: string,
  input: { action?: unknown; candidateRef?: unknown; reason?: unknown }
): Promise<FinalChoice | null> {
  const v = validateChoiceInput(input)
  if (!v.ok) throw new FinalChoiceInputError(v.error)
  const { admin, role } = await linkedRole(ctx, roleId)
  const agencyId = role.agency_id as string

  let candidateId: string | null = null
  if (v.action === "chosen") {
    // THE SUBMISSION IS THE GATE: a manager can only choose somebody the
    // recruiter actually sent them. The same read every /hiring disclosure
    // uses; a ref outside it reads as not found.
    const shortlist = await getClientShortlist(ctx, roleId)
    if (!shortlist || !shortlist.entries.some((e) => e.ref === v.candidateRef)) {
      throw new AgencyAccessError("candidate not found")
    }
    const { data: cand, error: candErr } = await admin
      .from("candidates")
      .select("id, ref")
      .eq("agency_id", agencyId)
      .eq("role_id", roleId)
      .eq("ref", v.candidateRef)
      .maybeSingle()
    if (candErr) throw candErr
    if (!cand) throw new AgencyAccessError("candidate not found")
    // Only someone they took forward. A declined or held candidate is not a
    // choice the loop can express — they would advance them first.
    if (!(await hasAdvanceDecision(admin, agencyId, roleId, cand.id as string))) {
      throw new FinalChoiceInputError("you can choose someone you advanced — advance them first")
    }
    candidateId = cand.id as string
  }

  const previous = await readFinalChoice(admin, agencyId, roleId)

  const { error: insertError } = await admin.from("client_final_choices").insert({
    agency_id: agencyId,
    role_id: roleId,
    candidate_id: candidateId,
    candidate_ref: v.candidateRef,
    action: v.action,
    reason: v.reason,
    by_contact_id: role.contact_id as string | null,
    decided_by: ctx.userId,
  })
  if (insertError) throw insertError

  await writeAudit(admin, {
    agencyId,
    roleId,
    candidateId,
    actorId: ctx.userId,
    entityType: "role",
    entityRef: (role.ref as string) ?? "",
    action: v.action === "chosen" ? "client_final_choice" : v.action === "neither" ? "client_final_neither" : "client_final_choice_withdrawn",
    fromValue: previous ? { action: previous.action, candidate_ref: previous.candidateRef } : null,
    toValue: { action: v.action, candidate_ref: v.candidateRef, reason: v.reason },
  })

  return readFinalChoice(admin, agencyId, roleId)
}
