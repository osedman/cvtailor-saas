/**
 * The interview cohort: the people the client chose to interview.
 *
 * Ose's vocabulary, 11 Sep 2026. Tailr submits a shortlist; the client picks
 * from it; the subset they pick is the **cohort**. "Recommended candidates"
 * was rejected because `role_recommendations` already means a role
 * recommended TO a person — the same word pointing the other way, which is
 * the trap "shortlist" already cost us once.
 *
 * Inviting a cohort creates one round per candidate with NO TIME on it. That
 * is the whole self-booking model: the round is the invitation, the window
 * is chosen later by the candidate, and the partial unique index on
 * (slot_id) settles who gets it. The recruiter is not in this path at all —
 * they have visibility of what was booked, not the booking.
 *
 * Idempotent per candidate: a candidate who already has a live round on the
 * role is skipped rather than invited twice, because two links to the same
 * person for the same round is how somebody ends up holding two windows.
 */

import { agencyAdmin, writeAudit } from "./db"
import { mintBookingToken, sendSelfBookingInvite } from "./booking"

export interface CohortInviteResult {
  invited: Array<{ candidateRef: string; sent: boolean; reason?: string }>
  skipped: Array<{ candidateRef: string; because: string }>
}

/**
 * Invite the chosen candidates to book. `contactId` is the client contact
 * the round belongs to — the person whose diary the windows came from.
 */
export async function inviteCohort(
  agencyId: string,
  roleId: string,
  contactId: string,
  candidateRefs: string[],
  actorId: string | null
): Promise<CohortInviteResult> {
  const admin = agencyAdmin()
  const refs = [...new Set(candidateRefs.filter(Boolean))].slice(0, 50)
  const result: CohortInviteResult = { invited: [], skipped: [] }
  if (refs.length === 0) return result

  const { data: candidates, error } = await admin
    .from("candidates")
    .select("id, ref")
    .eq("agency_id", agencyId)
    .eq("role_id", roleId)
    .in("ref", refs)
  if (error) throw error

  const found = new Map((candidates ?? []).map((c) => [c.ref as string, c.id as string]))
  for (const ref of refs) {
    if (!found.has(ref)) result.skipped.push({ candidateRef: ref, because: "not on this role" })
  }

  for (const [ref, candidateId] of found) {
    // A live round already means they have been invited; two links to the
    // same person is how somebody ends up holding two windows.
    const { data: existing } = await admin
      .from("interview_rounds")
      .select("id, round_number, status")
      .eq("agency_id", agencyId)
      .eq("role_id", roleId)
      .eq("candidate_id", candidateId)
      .order("round_number", { ascending: false })
    const live = (existing ?? []).find((r) => r.status !== "cancelled")
    if (live) {
      result.skipped.push({ candidateRef: ref, because: "already invited" })
      continue
    }

    // Round numbers are derived, never supplied.
    const roundNumber = ((existing?.[0]?.round_number as number) ?? 0) + 1
    const { data: round, error: insertError } = await admin
      .from("interview_rounds")
      .insert({
        agency_id: agencyId,
        role_id: roleId,
        candidate_id: candidateId,
        contact_id: contactId,
        round_number: roundNumber,
        // No slot and no time: this IS the invitation to choose.
        slot_id: null,
        scheduled_at: null,
        status: "scheduled",
        candidate_response: "pending",
      })
      .select("id")
      .single()
    if (insertError) throw insertError

    const roundId = round.id as string
    const token = await mintBookingToken(admin, roundId)
    const sent = await sendSelfBookingInvite(admin, roundId, token)

    await writeAudit(admin, {
      agencyId,
      roleId,
      candidateId,
      actorId,
      entityType: "round",
      entityRef: ref,
      action: "cohort_invited",
      toValue: { round_id: roundId, round_number: roundNumber, self_booking: true, invite_sent: sent.sent },
    })

    result.invited.push({ candidateRef: ref, sent: sent.sent, reason: sent.reason })
  }

  return result
}
