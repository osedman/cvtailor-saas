/**
 * The client's projection of a role: which roles are theirs, and the header
 * for one of them. Shared by /api/hiring/roles/[roleId]/header and
 * /api/hiring/today so the tie check and the coarsening cannot fork.
 *
 * A contact is tied to a role four ways — the brief they wrote, a submission
 * they received, a round they sit on, a window they offered — and any one
 * will do. All four are read with the service role and then checked against
 * the caller's own contact ids, never the other way round.
 *
 * In the shortlist phase the sub-state is coarsened to SHORTLIST IN
 * PROGRESS: the recruiter's counts (how many candidates, how many screened)
 * are the agency's working, not the client's. From the submission on, the
 * ladder speaks in refs, as the hiring payload already does.
 */

import { agencyAdmin } from "./db"
import { getRoleFacts } from "./role-facts"
import { deriveSubState, handoffFor, nextAction, type Handoff, type NextAction } from "./next-action"
import type { HiringContext } from "./types"
import type { PhaseKey } from "./phases"

export interface ClientRoleTie {
  roleId: string
  agencyId: string
  contactId: string
}

/** Every role the caller is tied to, with the agency and contact that ties it. */
export async function listClientRoles(ctx: HiringContext): Promise<ClientRoleTie[]> {
  const contactIds = ctx.links.map((l) => l.contactId)
  if (contactIds.length === 0) return []
  const admin = agencyAdmin()
  const [briefs, recipients, rounds, slots] = await Promise.all([
    admin.from("role_briefs").select("role_id, agency_id, contact_id").in("contact_id", contactIds).not("role_id", "is", null),
    admin.from("submission_recipients").select("agency_id, contact_id, submissions!inner(role_id)").in("contact_id", contactIds),
    admin.from("interview_rounds").select("role_id, agency_id, contact_id").in("contact_id", contactIds),
    admin.from("availability_slots").select("role_id, agency_id, contact_id").in("contact_id", contactIds).not("role_id", "is", null),
  ])
  const ties = new Map<string, ClientRoleTie>()
  const add = (roleId: unknown, agencyId: unknown, contactId: unknown) => {
    if (typeof roleId !== "string" || typeof agencyId !== "string" || typeof contactId !== "string") return
    const link = ctx.links.find((l) => l.contactId === contactId && l.agencyId === agencyId)
    if (!link || ties.has(roleId)) return
    ties.set(roleId, { roleId, agencyId, contactId })
  }
  for (const r of briefs.data ?? []) add(r.role_id, r.agency_id, r.contact_id)
  for (const r of recipients.data ?? []) {
    const sub = (r as { submissions?: { role_id?: string } | { role_id?: string }[] }).submissions
    const roleId = Array.isArray(sub) ? sub[0]?.role_id : sub?.role_id
    add(roleId, r.agency_id, r.contact_id)
  }
  for (const r of rounds.data ?? []) add(r.role_id, r.agency_id, r.contact_id)
  for (const r of slots.data ?? []) add(r.role_id, r.agency_id, r.contact_id)
  return [...ties.values()]
}

export interface ClientRoleHeader {
  role: { id: string; ref: string; title: string; company: string; recruiterName: string | null }
  phase: PhaseKey
  subState: { key: string; chip: string }
  next: NextAction
  handoff: Handoff | null
  now: string
}

/** The header for one role the caller is tied to, or null when it is not theirs. */
export async function getClientRoleHeader(ctx: HiringContext, tie: ClientRoleTie): Promise<ClientRoleHeader | null> {
  const facts = await getRoleFacts({ agencyId: tie.agencyId, userId: ctx.userId, role: "viewer" }, tie.roleId)
  if (!facts) return null
  const sub = deriveSubState(facts)
  const next = nextAction(facts, "client", tie.roleId)
  const inShortlist = facts.phase === "shortlist"
  return {
    role: { id: facts.roleId, ref: facts.ref, title: facts.title, company: facts.company, recruiterName: facts.ownerName },
    phase: facts.phase,
    subState: inShortlist ? { key: "shortlist-in-progress", chip: "SHORTLIST IN PROGRESS" } : { key: sub.key, chip: sub.chip },
    next: inShortlist ? { ...next, key: "shortlist-in-progress" as NextAction["key"], chip: "SHORTLIST IN PROGRESS", since: null } : next,
    handoff: inShortlist ? null : handoffFor(facts, "client", tie.roleId),
    now: facts.now,
  }
}
