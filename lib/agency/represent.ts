/**
 * Right to represent: the candidate's answer to "may we put you forward?"
 *
 * A candidate who applied consented explicitly — the manifest they confirmed
 * is the record, written in the same transaction as their candidate row. An
 * uploaded candidate never agreed to anything, and this is where they do, on
 * the rights doorway they already hold a link to. Per role, never blanket:
 * candidate rows are per (agency, role, person), so the schema's own grain
 * enforces it.
 *
 * THE ANSWER GATES ONE ACT ONLY: submission to a client. It never filters,
 * ranks or hides anyone (guardrail test), and declining is not withdrawal
 * from consideration.
 *
 * 'withdrawn' is distinct from 'declined' on purpose. A revoked yes and a
 * plain no are different facts, and the audit trail must say which happened.
 * Withdrawal stops FUTURE submissions and does not unsend past ones — the
 * doorway says exactly that rather than implying time travel.
 */

import { agencyAdmin, writeAudit } from "./db"

/** Stamped on every agreement so the record says which copy they saw. Bump on
 * any wording change to the ask. */
export const REPRESENT_COPY_VERSION = "rtr-v1"

export type RepresentStatus = "unanswered" | "agreed" | "declined" | "withdrawn"
export type RepresentOutcome = RepresentStatus | "not_found" | "unchanged"

/**
 * Record the candidate's answer, keyed by their rights token — the same
 * credential the doorway already runs on. 'decline' from an agreed state is
 * recorded as WITHDRAWN, not declined: the candidate is not answering the
 * original question again, they are revoking their earlier answer.
 */
export async function answerRepresent(
  rawToken: string,
  answer: "agree" | "decline"
): Promise<RepresentOutcome> {
  if (!rawToken || rawToken.length < 24 || rawToken.length > 96 || !/^[a-f0-9]+$/i.test(rawToken)) {
    return "not_found"
  }
  const admin = agencyAdmin()
  const { data: candidate } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, ref, represent_status")
    .eq("rights_token", rawToken)
    .maybeSingle()
  if (!candidate) return "not_found"

  const current = candidate.represent_status as RepresentStatus
  const next: RepresentStatus =
    answer === "agree" ? "agreed" : current === "agreed" ? "withdrawn" : "declined"

  // People click twice; a repeat is not a new fact and writes no new row.
  if (next === current) return "unchanged"

  const { error } = await admin
    .from("candidates")
    .update({
      represent_status: next,
      represent_answered_at: new Date().toISOString(),
      represent_copy_version: REPRESENT_COPY_VERSION,
    })
    .eq("id", candidate.id as string)
  if (error) throw error

  await writeAudit(admin, {
    agencyId: candidate.agency_id as string,
    roleId: candidate.role_id as string,
    candidateId: candidate.id as string,
    // The candidate is not an auth user; the action names who acted.
    actorId: null,
    entityType: "candidate",
    entityRef: (candidate.ref as string) ?? "",
    action: `represent_${next}`,
    reason: "candidate decision",
    toValue: { copy_version: REPRESENT_COPY_VERSION, from: current },
  })

  return next
}

/**
 * The submission gate, in one place so the route stays thin and the rule
 * cannot drift: declined and withdrawn REFUSE outright — the candidate
 * answered, and a recruiter cannot answer over them. Unanswered needs the
 * per-submission override, which the caller must have made loud and which is
 * audited here so the trail shows who overrode for whom.
 */
export async function checkRepresentGate(
  admin: ReturnType<typeof agencyAdmin>,
  input: {
    agencyId: string
    roleId: string
    actorId: string
    candidateIds: string[]
    overrideUnanswered: boolean
  }
): Promise<
  | { ok: true }
  | { ok: false; refused: string[]; kind: "answered_no" }
  | { ok: false; refused: string[]; kind: "needs_override" }
> {
  if (input.candidateIds.length === 0) return { ok: true }

  const { data: rows } = await admin
    .from("candidates")
    .select("id, ref, represent_status")
    .in("id", input.candidateIds)

  const refOf = (status: RepresentStatus) =>
    (rows ?? []).filter((r) => r.represent_status === status).map((r) => r.ref as string)

  const saidNo = [...refOf("declined"), ...refOf("withdrawn")]
  if (saidNo.length > 0) return { ok: false, refused: saidNo.sort(), kind: "answered_no" }

  const unanswered = refOf("unanswered")
  if (unanswered.length === 0) return { ok: true }

  if (!input.overrideUnanswered) {
    return { ok: false, refused: unanswered.sort(), kind: "needs_override" }
  }

  await writeAudit(admin, {
    agencyId: input.agencyId,
    roleId: input.roleId,
    actorId: input.actorId,
    entityType: "submission",
    entityRef: unanswered.sort().join(", "),
    action: "represent_overridden",
    reason: "submitted without the candidate's answer",
    toValue: { candidates: unanswered.length },
  })
  return { ok: true }
}
