/**
 * Role ownership. Its own module — not db.ts — for the same reason consent
 * and briefs are: tests mock ./db, and a function living inside db.ts calls
 * the module's own agencyAdmin binding, which no mock can reach.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

/**
 * Reassign a role to a member. Commission attribution, so it is service-role
 * + audit in one operation like every other money-adjacent write — the field
 * editor's RLS path is deliberately not enough here.
 *
 * The new owner must be an ACTIVE, non-viewer member of this agency: handing
 * a role to a viewer creates a desk nobody can work, and handing it to a
 * suspended member is handing it to nobody.
 */
export async function setRoleOwner(
  ctx: AgencyContext,
  roleId: string,
  newOwnerId: string
): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: member } = await admin
    .from("members")
    .select("user_id, role, status")
    .eq("agency_id", ctx.agencyId)
    .eq("user_id", newOwnerId)
    .maybeSingle()
  if (!member || member.status !== "active" || member.role === "viewer") {
    throw new AgencyAccessError("the owner must be an active recruiter or owner in this agency")
  }

  const { data: role } = await admin
    .from("job_roles")
    .select("id, ref, owner_id")
    .eq("id", roleId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (!role) throw new AgencyAccessError("role not found in your agency")
  if (role.owner_id === newOwnerId) return

  // Captured BEFORE the update: the audit row is the record of what changed,
  // and reading it off the row object after the write is a use-after-update
  // waiting for a client that returns live references.
  const previousOwner = (role.owner_id as string | null) ?? null

  const { error } = await admin
    .from("job_roles")
    .update({ owner_id: newOwnerId })
    .eq("id", roleId)
    .eq("agency_id", ctx.agencyId)
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    actorId: ctx.userId,
    entityType: "role",
    entityRef: (role.ref as string) ?? "",
    action: "owner_changed",
    fromValue: { owner_id: previousOwner },
    toValue: { owner_id: newOwnerId },
  })
}
