/**
 * Screening questions the recruiter writes (frame 37, approved 2 Oct 2026).
 *
 * Two scopes, one table (agency.screening_questions):
 *   - candidateId null → every candidate on the role. On every call's list
 *     automatically (Ose, 2 Oct); answers go into each candidate's
 *     call_answers under the question's key.
 *   - candidateId set  → added on that one call.
 *
 * Audit-coupled: the browser holds SELECT only, every write is here, beside
 * its audit row. Removing is a stamp, never a delete — an answer already
 * given must still read against its question.
 */

import { randomBytes } from "crypto"
import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"
import { WRITTEN_KEY, type WrittenQuestion } from "./call-trail"

export type { WrittenQuestion }

const toQuestion = (r: Record<string, unknown>): WrittenQuestion => ({
  id: r.id as string,
  key: r.key as string,
  text: r.text as string,
  candidateId: (r.candidate_id as string | null) ?? null,
  removedAt: (r.removed_at as string | null) ?? null,
})

/** Every written question on a role, removed ones included (they still label answers). */
export async function listWrittenQuestions(agencyId: string, roleId: string): Promise<WrittenQuestion[]> {
  const { data, error } = await agencyAdmin()
    .from("screening_questions")
    .select("id, key, text, candidate_id, removed_at, created_at")
    .eq("agency_id", agencyId)
    .eq("role_id", roleId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map(toQuestion)
}

export async function addWrittenQuestion(
  ctx: AgencyContext,
  input: { roleId: string; candidateId: string | null; text: string }
): Promise<WrittenQuestion> {
  assertWriter(ctx)
  const text = (input.text ?? "").trim().replace(/\s+/g, " ").slice(0, 300)
  if (!text) throw new AgencyAccessError("type the question first")
  const admin = agencyAdmin()
  const { data: role } = await admin.from("job_roles").select("id, ref").eq("id", input.roleId).eq("agency_id", ctx.agencyId).is("discarded_at", null).maybeSingle()
  if (!role) throw new AgencyAccessError("that role is not on this agency")
  let candidateRef: string | null = null
  if (input.candidateId) {
    const { data: cand } = await admin.from("candidates").select("id, ref").eq("id", input.candidateId).eq("role_id", input.roleId).eq("agency_id", ctx.agencyId).maybeSingle()
    if (!cand) throw new AgencyAccessError("that candidate is not on this role")
    candidateRef = cand.ref as string
  }

  // 'Q' + 8 hex: inside call_answers' 10-character key cap. A collision on
  // (role_id, key) is astronomically rare; one retry covers it.
  let row: Record<string, unknown> | null = null
  for (let attempt = 0; attempt < 2 && !row; attempt++) {
    const key = `Q${randomBytes(4).toString("hex")}`
    if (!WRITTEN_KEY.test(key)) continue
    const { data, error } = await admin
      .from("screening_questions")
      .insert({ agency_id: ctx.agencyId, role_id: input.roleId, candidate_id: input.candidateId, key, text, added_by: ctx.userId })
      .select("id, key, text, candidate_id, removed_at")
      .single()
    if (error && (error as { code?: string }).code !== "23505") throw error
    row = (data as Record<string, unknown> | null) ?? null
  }
  if (!row) throw new Error("could not save the question")

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: input.roleId,
    candidateId: input.candidateId,
    actorId: ctx.userId,
    entityType: input.candidateId ? "candidate" : "role",
    entityRef: candidateRef ?? (role.ref as string),
    action: "screening_question_added",
    toValue: { key: row.key, text, scope: input.candidateId ? "call" : "role" },
  })
  return toQuestion(row)
}

/** Take a written question off. Answers already given keep it as their label. */
export async function removeWrittenQuestion(ctx: AgencyContext, roleId: string, questionId: string): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const { data: q } = await admin
    .from("screening_questions")
    .select("id, key, text, candidate_id, removed_at")
    .eq("id", questionId)
    .eq("role_id", roleId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (!q) throw new AgencyAccessError("that question is not on this role")
  if (q.removed_at) return
  const { data: role } = await admin.from("job_roles").select("ref").eq("id", roleId).maybeSingle()
  const { error } = await admin
    .from("screening_questions")
    .update({ removed_at: new Date().toISOString(), removed_by: ctx.userId })
    .eq("id", questionId)
    .is("removed_at", null)
  if (error) throw error
  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    candidateId: (q.candidate_id as string | null) ?? null,
    actorId: ctx.userId,
    entityType: "role",
    entityRef: (role?.ref as string) ?? "",
    action: "screening_question_removed",
    fromValue: { key: q.key, text: q.text },
  })
}
