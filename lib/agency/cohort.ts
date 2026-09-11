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
import { listOpenSlots, listRoundsForRole } from "./rounds"
import { cohortStatus, needsChasing, statusRank, type CohortRoundFacts, type CohortStatus } from "./cohort-status"
import type { AgencyContext } from "./types"

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

  // Which wave this is. Derived from what has already gone out, never
  // supplied — the same rule round numbers follow.
  const { data: waves } = await admin
    .from("interview_rounds")
    .select("wave")
    .eq("agency_id", agencyId)
    .eq("role_id", roleId)
    .order("wave", { ascending: false })
    .limit(1)
  const wave = ((waves?.[0]?.wave as number) ?? 0) + 1

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
        wave,
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
      toValue: { round_id: roundId, round_number: roundNumber, wave, self_booking: true, invite_sent: sent.sent },
    })

    result.invited.push({ candidateRef: ref, sent: sent.sent, reason: sent.reason })
  }

  return result
}


export interface CohortMember {
  roundId: string
  candidateRef: string
  /** The name the caller is entitled to. Refs only where they are not. */
  candidateName: string
  roundNumber: number
  status: CohortStatus
  scheduledAt: string | null
  durationMinutes: number
  /** An unanswered invitation that has waited long enough to chase. */
  chase: boolean
}

export interface CohortBoard {
  members: CohortMember[]
  /** Windows still free for the people who have not booked. */
  openWindows: number
  now: string
}

/**
 * The scheduling board for one role: everyone invited, where they stand, and
 * how many windows are left for those who have not chosen yet.
 *
 * ONE DERIVATION, TWO BOARDS. The client's and the recruiter's read this
 * same function, so they cannot disagree about who is booked. What differs
 * is only what each is entitled to see, and that is the caller's job — the
 * recruiter route passes names through, the client route matches them
 * against their own submission snapshot.
 */
export async function getCohortBoard(ctx: AgencyContext, roleId: string): Promise<CohortBoard> {
  const now = new Date()
  const [rounds, openSlots] = await Promise.all([listRoundsForRole(ctx, roleId), listOpenSlots(ctx, roleId)])

  const members: CohortMember[] = rounds.map((r) => {
    const facts: CohortRoundFacts = {
      status: r.status,
      candidateResponse: r.candidateResponse,
      scheduledAt: r.scheduledAt,
      hasDebrief: r.hasDebrief,
      createdAt: r.createdAt,
    }
    return {
      roundId: r.id,
      candidateRef: r.candidateRef,
      candidateName: r.candidateName,
      roundNumber: r.roundNumber,
      status: cohortStatus(facts, now),
      scheduledAt: r.scheduledAt,
      durationMinutes: r.durationMinutes,
      chase: needsChasing(facts, now),
    }
  })

  // What needs somebody first, then what is settled; inside a status, the
  // soonest interview leads.
  members.sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "") ||
      a.candidateRef.localeCompare(b.candidateRef)
  )

  return { members, openWindows: openSlots.length, now: now.toISOString() }
}

/**
 * Send somebody's booking link again.
 *
 * A FRESH TOKEN, AND THE OLD ONE STOPS WORKING. Minting is the only way to
 * hand out a link — the stored hash cannot be reversed — so a reminder is
 * necessarily a new link. Better that than a reminder that quietly cannot be
 * sent, but the board says so rather than letting someone wonder why the
 * first email stopped working.
 */
export async function remindCohortMember(
  ctx: AgencyContext,
  roleId: string,
  roundId: string
): Promise<{ sent: boolean; reason?: string }> {
  const admin = agencyAdmin()
  const { data: round } = await admin
    .from("interview_rounds")
    .select("id, agency_id, role_id, candidate_id, slot_id, status")
    .eq("agency_id", ctx.agencyId)
    .eq("role_id", roleId)
    .eq("id", roundId)
    .maybeSingle()
  if (!round) return { sent: false, reason: "not_found" }
  if (round.status === "cancelled") return { sent: false, reason: "cancelled" }
  // Nothing to remind them of: they already hold a time.
  if (round.slot_id) return { sent: false, reason: "already_booked" }

  const token = await mintBookingToken(admin, roundId)
  const sent = await sendSelfBookingInvite(admin, roundId, token)

  const { data: candidate } = await admin
    .from("candidates")
    .select("ref")
    .eq("id", round.candidate_id as string)
    .maybeSingle()

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    candidateId: round.candidate_id as string,
    actorId: ctx.userId,
    entityType: "round",
    entityRef: (candidate?.ref as string) ?? "",
    action: "booking_reminded",
    reason: "link sent again; the previous one no longer works",
    toValue: { round_id: roundId, sent: sent.sent },
  })
  return sent
}
