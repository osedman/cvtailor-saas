/**
 * The handover checklist: what must be true before the pack is handed over.
 *
 * Five items. Four are DERIVED from facts that already exist and cannot be
 * ticked by hand — a reference is received or it is not. The fifth, terms
 * confirmed, has no fact behind it and is the recruiter's word. Any item
 * the facts do not settle can be resolved by a recruiter as done, waived
 * with a reason, or not applicable, and every resolution is an audited
 * fact in agency.handover_items.
 *
 * deliverHandoverPack calls `assertChecklistComplete` before it writes, so
 * the gate is the server's. The close-out screen's disabled button is the
 * courtesy, not the enforcement.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

export type ChecklistItemKey = "references" | "right_to_work" | "placement" | "start_date" | "terms"
export type ChecklistState = "done" | "waived" | "not_applicable"

export interface ChecklistItem {
  key: ChecklistItemKey
  label: string
  /** What settles it without anyone ticking a box. */
  derivedFrom: string
  /** True when the facts settle it. A derived-done item cannot be waived; there is nothing to waive. */
  derived: boolean
  /** A recruiter's recorded resolution, when the facts did not settle it. */
  resolution: { state: ChecklistState; reason: string; at: string } | null
  resolved: boolean
}

export const CHECKLIST: Array<{ key: ChecklistItemKey; label: string; derivedFrom: string }> = [
  { key: "references", label: "References received", derivedFrom: "at least one reference with status received" },
  { key: "right_to_work", label: "Right to work seen", derivedFrom: "compliance record says the evidence was seen" },
  { key: "placement", label: "Placement recorded", derivedFrom: "a placement row that is offered, accepted or started" },
  { key: "start_date", label: "Start date agreed", derivedFrom: "a start date on the placement" },
  { key: "terms", label: "Terms confirmed with the client", derivedFrom: "nothing — this is your word" },
]

export async function getChecklist(ctx: AgencyContext, roleId: string, candidateId: string): Promise<ChecklistItem[]> {
  const admin = agencyAdmin()
  const [refs, compliance, placement, items] = await Promise.all([
    admin.from("candidate_references").select("status").eq("agency_id", ctx.agencyId).eq("candidate_id", candidateId),
    admin.from("candidate_compliance").select("rtw_evidence").eq("agency_id", ctx.agencyId).eq("candidate_id", candidateId).maybeSingle(),
    admin.from("placements").select("status, start_date").eq("agency_id", ctx.agencyId).eq("role_id", roleId).eq("candidate_id", candidateId).maybeSingle(),
    admin.from("handover_items").select("item, state, reason, resolved_at").eq("agency_id", ctx.agencyId).eq("role_id", roleId).eq("candidate_id", candidateId),
  ])
  for (const r of [refs, compliance, placement, items]) if (r.error) throw r.error

  const derived: Record<ChecklistItemKey, boolean> = {
    references: (refs.data ?? []).some((r) => r.status === "received"),
    right_to_work: compliance.data?.rtw_evidence === "seen",
    placement: !!placement.data && ["offered", "accepted", "started"].includes(placement.data.status as string),
    start_date: !!placement.data?.start_date,
    terms: false,
  }
  const recorded = new Map((items.data ?? []).map((i) => [i.item as ChecklistItemKey, i]))

  return CHECKLIST.map((c) => {
    const row = recorded.get(c.key)
    const resolution = row ? { state: row.state as ChecklistState, reason: (row.reason as string) ?? "", at: row.resolved_at as string } : null
    return { ...c, derived: derived[c.key], resolution, resolved: derived[c.key] || resolution !== null }
  })
}

/** Record a recruiter's resolution of one item. A derived-done item is refused: there is nothing to resolve. */
export async function resolveChecklistItem(
  ctx: AgencyContext,
  input: { roleId: string; candidateId: string; item: ChecklistItemKey; state: ChecklistState; reason?: string }
): Promise<ChecklistItem[]> {
  assertWriter(ctx)
  if (!CHECKLIST.some((c) => c.key === input.item)) throw new AgencyAccessError("unknown checklist item")
  const reason = (input.reason ?? "").trim().slice(0, 500)
  if (input.state !== "done" && reason.length === 0) throw new AgencyAccessError("a waiver needs a reason")
  const before = await getChecklist(ctx, input.roleId, input.candidateId)
  const current = before.find((i) => i.key === input.item)
  if (current?.derived) throw new AgencyAccessError("that item is settled by the record; there is nothing to resolve")

  const admin = agencyAdmin()
  const { data: candidate } = await admin.from("candidates").select("ref, role_id").eq("agency_id", ctx.agencyId).eq("id", input.candidateId).maybeSingle()
  if (!candidate || candidate.role_id !== input.roleId) throw new AgencyAccessError("candidate not on this role")

  const { error } = await admin.from("handover_items").upsert(
    {
      agency_id: ctx.agencyId,
      role_id: input.roleId,
      candidate_id: input.candidateId,
      item: input.item,
      state: input.state,
      reason,
      resolved_by: ctx.userId,
      resolved_at: new Date().toISOString(),
    },
    { onConflict: "role_id,candidate_id,item" }
  )
  if (error) throw error

  // Shape only, not content: the reason may mention the person, and the
  // audit log is agency-wide readable — the same rule compliance follows.
  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: input.roleId,
    candidateId: input.candidateId,
    actorId: ctx.userId,
    entityType: "handover",
    entityRef: (candidate.ref as string) ?? "",
    action: `checklist_${input.state}`,
    fromValue: current?.resolution ? { item: input.item, state: current.resolution.state } : null,
    toValue: { item: input.item, state: input.state, has_reason: reason.length > 0 },
  })
  return getChecklist(ctx, input.roleId, input.candidateId)
}

/** Refuses with the outstanding items named, so the message is the fix. */
export async function assertChecklistComplete(ctx: AgencyContext, roleId: string, candidateId: string): Promise<void> {
  const items = await getChecklist(ctx, roleId, candidateId)
  const outstanding = items.filter((i) => !i.resolved)
  if (outstanding.length > 0) {
    throw new AgencyAccessError(`the handover checklist is not complete: ${outstanding.map((i) => i.label.toLowerCase()).join(", ")}`)
  }
}
