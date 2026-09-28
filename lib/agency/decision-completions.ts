/**
 * "That's all my decisions" — the client's own statement that they have
 * finished deciding on a role.
 *
 * WHY THIS EXISTS. Until 14 Sep 2026 the product read this off the round
 * count: next-action.ts fired "take to close-out" when the last completed
 * round decided advance at or beyond `planned_rounds`. The same file's
 * header calls the plan "a plan, never a gate" — and there it was, gating.
 * A client who decided early was told to keep going; one who wanted an extra
 * round was told to close out. And the measure the plan asks for,
 * submission → all decisions, had no end timestamp to measure to.
 *
 * A FACT OUTRANKS AN INFERENCE, BUT DOES NOT REPLACE IT. Completion adds a
 * rung ABOVE the derived one. A role whose client never presses the button
 * behaves exactly as it did before — see nextAction.
 *
 * APPEND-ONLY, NEWEST WINS. The same shape agency.round_decisions uses: a
 * client who reopens writes a 'withdrawn' row rather than editing history,
 * so the record says what happened and not only where it ended up.
 *
 * AUDIT-COUPLED. agency.role_decision_completions has no authenticated write
 * grants, so this module is the only writer — service role, link asserted,
 * audit row in the same operation.
 *
 * IT IS NOT A HIRE DECISION. There is still no 'hire' value anywhere. This
 * says the client has finished DECIDING, which is a fact about the process.
 * Who got the job is the placement. And completion closes nothing: the role
 * stays open, the recruiter can still add a candidate, and the retention
 * clock does not start. Closing remains the recruiter's deliberate act.
 */

import { agencyAdmin, writeAudit, AgencyAccessError } from "./db"
import type { HiringContext } from "./types"

export type CompletionAction = "completed" | "withdrawn"

export interface DecisionCompletion {
  action: CompletionAction
  note: string
  at: string
}

const MAX_NOTE = 2000

/**
 * The latest completion state for a set of roles.
 *
 * Newest row wins, and a 'withdrawn' newest row means NOT complete — it
 * resolves to null rather than to a timestamp, so a reopened role falls back
 * to the derived rung on its own with nothing to clean up.
 */
export async function latestCompletions(
  admin: ReturnType<typeof agencyAdmin>,
  agencyId: string,
  roleIds: string[]
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (roleIds.length === 0) return out

  const { data } = await admin
    .from("role_decision_completions")
    .select("role_id, action, created_at")
    .eq("agency_id", agencyId)
    .in("role_id", roleIds)
    .order("created_at", { ascending: false })

  for (const row of data ?? []) {
    const roleId = row.role_id as string
    // Ordered newest first, so the first row seen for a role is the live one
    // and every later row is history.
    if (out.has(roleId)) continue
    out.set(roleId, row.action === "completed" ? (row.created_at as string) : null)
  }
  return out
}

/** Record the client's statement. Append-only; never updates a prior row. */
export async function recordDecisionCompletion(
  ctx: HiringContext,
  roleId: string,
  action: CompletionAction,
  note?: string
): Promise<DecisionCompletion> {
  if (action !== "completed" && action !== "withdrawn") {
    throw new AgencyAccessError("unknown completion action")
  }
  const admin = agencyAdmin()

  const { data: role, error } = await admin
    .from("job_roles")
    .select("id, agency_id, ref, contact_id")
    .eq("id", roleId)
    .maybeSingle()
  if (error) throw error
  if (!role) throw new AgencyAccessError("role not found")

  // The hiring manager may only speak for a role held by a contact they are
  // linked to. Linkage is invite-only and proven here, never inferred from
  // the email on the session.
  const link = ctx.links.find(
    (l) => l.agencyId === role.agency_id && l.contactId === (role.contact_id as string | null)
  )
  if (!link) throw new AgencyAccessError("role not found")

  const { data: saved, error: insertError } = await admin
    .from("role_decision_completions")
    .insert({
      agency_id: role.agency_id as string,
      role_id: roleId,
      action,
      note: (note ?? "").slice(0, MAX_NOTE),
      by_contact_id: role.contact_id as string | null,
    })
    .select("action, note, created_at")
    .single()
  if (insertError) throw insertError

  await writeAudit(admin, {
    agencyId: role.agency_id as string,
    roleId,
    actorId: ctx.userId,
    entityType: "role",
    entityRef: (role.ref as string) ?? "",
    action: action === "completed" ? "decisions_complete" : "decisions_reopened",
    fromValue: null,
    toValue: { action, note: (note ?? "").slice(0, MAX_NOTE) },
  })

  return {
    action: saved.action as CompletionAction,
    note: (saved.note as string) ?? "",
    at: saved.created_at as string,
  }
}

/**
 * The live completion state for one role, for the hiring manager who owns
 * it. Same link proof as the writer: a role held by a contact this manager
 * is not linked to reads as not found, never as forbidden, because saying
 * "forbidden" would confirm the role exists.
 */
export async function completionForHiringRole(
  ctx: HiringContext,
  roleId: string
): Promise<{ completeAt: string | null }> {
  const admin = agencyAdmin()
  const { data: role } = await admin
    .from("job_roles")
    .select("id, agency_id, contact_id")
    .eq("id", roleId)
    .maybeSingle()
  if (!role) throw new AgencyAccessError("role not found")

  const link = ctx.links.find(
    (l) => l.agencyId === role.agency_id && l.contactId === (role.contact_id as string | null)
  )
  if (!link) throw new AgencyAccessError("role not found")

  const map = await latestCompletions(admin, role.agency_id as string, [roleId])
  return { completeAt: map.get(roleId) ?? null }
}
