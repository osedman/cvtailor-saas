/**
 * Write one row to the admin activity log (public.admin_audit_log).
 *
 * For admin actions that are not wrapped in a database function of their
 * own. Called AFTER the action succeeds. A failure here is thrown, so the
 * admin is told the change happened but was not logged — never silently.
 * Server-only.
 */
import { createAdminClient } from "@/lib/supabase/server"
import type { AuditArea } from "@/lib/admin-roles"

export async function logAdminAction(input: {
  actorId: string
  area: AuditArea
  action: string
  targetType: string
  targetId: string
  reason: string
  from?: Record<string, unknown> | null
  to?: Record<string, unknown> | null
}): Promise<void> {
  const { error } = await createAdminClient().from("admin_audit_log").insert({
    actor_id: input.actorId,
    area: input.area,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    from_value: input.from ?? null,
    to_value: input.to ?? null,
    reason: input.reason.trim(),
  })
  if (error) throw new Error(`The change was made but could not be written to the activity log: ${error.message}`)
}
