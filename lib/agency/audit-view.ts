/**
 * Reading the audit log.
 *
 * Every AUDIT LOGGED pill in this product writes a row to agency.audit_log,
 * and until now no human could read one. That is the same shape of gap as the
 * revocation one: an interface making a promise the product could not keep.
 *
 * READS GO THROUGH THE USER-SCOPED CLIENT, NOT THE SERVICE ROLE. The log's own
 * RLS policy already scopes it to the caller's agency, and this is a pure read
 * with no audit coupling of its own — so there is nothing here that needs to
 * bypass RLS, and using the service role would only widen the blast radius of
 * a mistake. Writes still cannot happen at all: audit_log has no insert, update
 * or delete policy for anyone, which is what makes it append-only.
 *
 * WHO DID IT is the part worth care. actor_id is nullable and its absence is
 * meaningful rather than missing: a candidate answering a consent link and a
 * referee replying are not auth users and never will be, so a null actor on
 * those actions is THEM, not a gap in the record. Rendering that as "unknown"
 * would misattribute the most consequential rows in the log.
 */

import type { AgencyClient } from "./db"
import type { AgencyContext } from "./types"

export type AuditActorKind = "you" | "teammate" | "candidate" | "referee" | "client" | "system"

export interface AuditEntry {
  id: number
  at: string
  actor: { kind: AuditActorKind; label: string }
  entityType: string
  entityRef: string
  action: string
  /** Plain-English summary; falls back to the raw action if unmapped. */
  what: string
  detail: string
  roleId: string | null
  candidateId: string | null
}

/** Filter groups, matching the chips on the screen. */
export const AUDIT_GROUPS: Record<string, string[]> = {
  candidates: ["candidate", "override"],
  decisions: ["decision", "brief"],
  access: ["client_invite", "submission"],
  interviews: ["round", "artifact", "availability"],
  rights: ["notice", "rights_request", "reference", "handover"],
}

const ACTION_TEXT: Record<string, string> = {
  "candidate:erased": "Erased a candidate",
  "override:overridden": "Overrode a requirement",
  "decision:advance": "Advanced a candidate",
  "decision:hold": "Put a candidate on hold",
  "decision:decline": "Declined a candidate for this round",
  "submission:generated": "Sent a shortlist",
  "submission:recipient_revoked": "Revoked a portal link",
  "client_invite:created": "Invited a client contact",
  "client_invite:accepted": "A client accepted their invite",
  "client_invite:rejected": "A wrong account tried an invite link",
  "client_invite:revoked": "Revoked a client invite",
  "brief:created": "A client sent a brief",
  "brief:accepted": "Accepted a brief",
  "brief:declined": "Declined a brief",
  "round:scheduled": "Booked an interview",
  "round:completed": "Marked an interview done",
  "round:cancelled": "Cancelled an interview",
  "round:capture_requested": "Asked about recording",
  "round:capture_granted": "Agreed to recording",
  "round:capture_declined": "Declined recording",
  "round:capture_withdrawn": "Withdrew recording consent",
  "artifact:debrief_recorded": "Wrote up an interview",
  "artifact:debrief_updated": "Edited an interview write-up",
  "availability:offered": "Offered interview times",
  "availability:withdrawn": "Withdrew interview times",
  "reference:referee_added": "Added a referee",
  "reference:reference_requested": "Asked for a reference",
  "reference:reference_chased": "Chased a reference",
  "reference:reference_received": "Gave a reference",
  "reference:reference_declined": "Declined to give a reference",
  "handover:generated": "Generated a handover pack",
  "handover:delivered": "Handed over to the employer",
  "notice:sent": "Sent a candidate notice",
}

/**
 * Who acted, from what the row can actually prove.
 *
 * A null actor is not "unknown". These actions are only ever taken by someone
 * with no account, through a token link — so the absence IS the attribution.
 */
function resolveActor(
  entityType: string,
  action: string,
  actorId: string | null,
  callerId: string
): { kind: AuditActorKind; label: string } {
  if (actorId) {
    if (actorId === callerId) return { kind: "you", label: "You" }
    // Teammate names would mean reading auth.users; the log does not need a
    // name to be useful and this keeps colleagues' addresses out of a screen
    // that is mostly read for other reasons.
    return { kind: "teammate", label: "A teammate" }
  }
  if (entityType === "round" && action.startsWith("capture_")) {
    return { kind: "candidate", label: "The candidate" }
  }
  if (entityType === "reference" && action.startsWith("reference_")) {
    return { kind: "referee", label: "The referee" }
  }
  if (entityType === "submission" || entityType === "brief") {
    return { kind: "client", label: "The client" }
  }
  return { kind: "system", label: "The system" }
}

/** A readable line from the row's own from/to values — never invented. */
function describe(row: Record<string, unknown>): string {
  const from = row.from_value as Record<string, unknown> | null
  const to = row.to_value as Record<string, unknown> | null
  const reason = (row.reason as string | null) ?? ""

  if (row.entity_type === "override" && from && to) {
    return `was ${String(from.strength ?? from.to ?? "")} · now ${String(to.strength ?? to.to ?? "")}${reason ? ` — ${reason}` : ""}`
  }
  if (row.action === "erased" && from) {
    return "Retention expired. Reference and score kept; everything else deleted."
  }
  if (reason) return reason
  if (to && typeof to === "object") {
    const bits = Object.entries(to)
      .filter(([k, v]) => typeof v === "number" || typeof v === "boolean")
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    if (bits.length > 0) return bits.join(" · ")
  }
  return ""
}

export interface AuditFilters {
  group?: string
  roleId?: string
  candidateId?: string
  limit?: number
}

export async function listAuditEntries(
  db: AgencyClient,
  ctx: AgencyContext,
  filters: AuditFilters = {}
): Promise<AuditEntry[]> {
  let q = db
    .from("audit_log")
    .select(
      "id, created_at, actor_id, entity_type, entity_ref, action, from_value, to_value, reason, role_id, candidate_id"
    )
    .eq("agency_id", ctx.agencyId)
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 200, 500))

  const types = filters.group ? AUDIT_GROUPS[filters.group] : undefined
  if (types) q = q.in("entity_type", types)
  if (filters.roleId) q = q.eq("role_id", filters.roleId)
  if (filters.candidateId) q = q.eq("candidate_id", filters.candidateId)

  const { data, error } = await q
  if (error) throw error

  return (data ?? []).map((row) => {
    const entityType = (row.entity_type as string) ?? ""
    const action = (row.action as string) ?? ""
    return {
      id: row.id as number,
      at: row.created_at as string,
      actor: resolveActor(entityType, action, (row.actor_id as string | null) ?? null, ctx.userId),
      entityType,
      entityRef: (row.entity_ref as string) ?? "",
      action,
      what: ACTION_TEXT[`${entityType}:${action}`] ?? `${action} ${entityType}`.trim(),
      detail: describe(row as Record<string, unknown>),
      roleId: (row.role_id as string | null) ?? null,
      candidateId: (row.candidate_id as string | null) ?? null,
    }
  })
}
