/**
 * Availability, interview rounds, and the decisions that come out of them.
 *
 * Steps 4–6 of the loop (AGENCIES_SCHEMA.md §5.5). The read side already
 * existed — getHiringDashboard has been rendering these tables since the shell
 * shipped — so this is the half that writes them.
 *
 * Who does what, and why it is split this way:
 *   - The HIRING MANAGER offers and withdraws availability. Times belong to
 *     the person whose diary they are; a recruiter inventing slots on their
 *     behalf is how double-bookings and resentment start.
 *   - The RECRUITER schedules a round: they own the process, they know which
 *     candidate is ready, and they are the one holding both sides.
 *   - The HIRING MANAGER decides the outcome. Append-only, because a reversal
 *     is a new decision rather than an edit to the old one.
 *
 * CAPTURE CONSENT IS DELIBERATELY NOT SET HERE. interview_rounds carries
 * capture_consent_status / capture_consent_at / consent_token_hash, and every
 * round created by this module leaves them at their 'pending' default. Consent
 * is the CANDIDATE's to give, against copy they read, and that copy is part of
 * the DPIA/notice sign-off gate that has not happened. A recruiter or client
 * asserting consent on a candidate's behalf is exactly the thing the schema
 * was shaped to prevent, so there is no function here that can do it.
 *
 * Every table below is audit-coupled: no authenticated write policies, so all
 * writes go through the service role in the same operation as the audit row.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type {
  AgencyContext,
  HiringContext,
  RoundDecision,
  RoundStatus,
} from "./types"

const MAX_SLOT_HOURS = 12
const MAX_URL = 500

/** The HM-side authorisation boundary: they may only act on their own links. */
function linkFor(ctx: HiringContext, contactId: string) {
  const link = ctx.links.find((l) => l.contactId === contactId)
  if (!link) throw new AgencyAccessError("not linked to that client contact")
  return link
}

// ============================================================
// Availability — the hiring manager's own diary
// ============================================================

export interface OfferSlotInput {
  contactId: string
  startsAt: string
  endsAt: string
  /** Optional: a slot offered for one role rather than generally. */
  roleId?: string | null
}

/**
 * Offer a window. Validated rather than trusted: the DB has a
 * `ends_at > starts_at` constraint, but a 3-week "slot" would satisfy it and
 * is almost certainly a date-picker mistake rather than an offer.
 */
export async function offerSlot(
  ctx: HiringContext,
  input: OfferSlotInput
): Promise<{ slotId: string }> {
  const link = linkFor(ctx, input.contactId)

  const starts = new Date(input.startsAt)
  const ends = new Date(input.endsAt)
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime())) {
    throw new Error("start and end must be valid times")
  }
  if (ends.getTime() <= starts.getTime()) {
    throw new Error("the end of a slot must be after its start")
  }
  if (ends.getTime() - starts.getTime() > MAX_SLOT_HOURS * 3600_000) {
    throw new Error(`a slot cannot be longer than ${MAX_SLOT_HOURS} hours`)
  }
  if (ends.getTime() <= Date.now()) {
    throw new Error("that time has already passed")
  }

  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("availability_slots")
    .insert({
      agency_id: link.agencyId,
      contact_id: link.contactId,
      role_id: input.roleId ?? null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
    })
    .select("id")
    .single()
  if (error) throw error

  await writeAudit(admin, {
    agencyId: link.agencyId,
    roleId: input.roleId ?? null,
    actorId: ctx.userId,
    entityType: "availability",
    entityRef: link.company,
    action: "offered",
    toValue: { slot_id: data.id as string, starts_at: starts.toISOString() },
  })

  return { slotId: data.id as string }
}

/**
 * Withdraw a window.
 *
 * Refuses if a round already references the slot: the recruiter has booked a
 * person into it and someone is expecting that call. Withdrawing underneath
 * them would leave a round pointing at a time nobody is offering, so the HM is
 * told to cancel the interview instead — a decision with a different weight.
 */
export async function withdrawSlot(ctx: HiringContext, slotId: string): Promise<void> {
  const admin = agencyAdmin()

  const { data: slot, error } = await admin
    .from("availability_slots")
    .select("id, agency_id, contact_id, role_id, revoked_at")
    .eq("id", slotId)
    .maybeSingle()
  if (error) throw error
  if (!slot) throw new AgencyAccessError("slot not found")
  const link = linkFor(ctx, slot.contact_id as string)
  if (slot.agency_id !== link.agencyId) throw new AgencyAccessError("slot not found")
  if (slot.revoked_at) return

  const { data: booked, error: bookedError } = await admin
    .from("interview_rounds")
    .select("id, status")
    .eq("slot_id", slotId)
    .neq("status", "cancelled")
    .maybeSingle()
  if (bookedError) throw bookedError
  if (booked) {
    throw new AgencyAccessError(
      "an interview is booked in that slot — cancel the interview to free the time"
    )
  }

  const { error: updateError } = await admin
    .from("availability_slots")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", slotId)
    .eq("agency_id", link.agencyId)
    .is("revoked_at", null)
  if (updateError) throw updateError

  await writeAudit(admin, {
    agencyId: link.agencyId,
    roleId: (slot.role_id as string | null) ?? null,
    actorId: ctx.userId,
    entityType: "availability",
    entityRef: link.company,
    action: "withdrawn",
    toValue: { slot_id: slotId },
  })
}

// ============================================================
// Rounds — the recruiter books, because they own the process
// ============================================================

export interface OpenSlot {
  id: string
  contactId: string
  company: string
  contactName: string
  startsAt: string
  endsAt: string
}

/** Slots a recruiter can actually book: this agency's, live, still ahead, and
 * not already taken by a round that has not been cancelled. */
export async function listOpenSlots(ctx: AgencyContext, roleId?: string): Promise<OpenSlot[]> {
  const admin = agencyAdmin()
  const nowIso = new Date().toISOString()

  let query = admin
    .from("availability_slots")
    .select("id, contact_id, role_id, starts_at, ends_at")
    .eq("agency_id", ctx.agencyId)
    .is("revoked_at", null)
    .gt("ends_at", nowIso)
    .order("starts_at", { ascending: true })
  const { data: slots, error } = await query
  if (error) throw error
  if (!slots || slots.length === 0) return []

  // A slot offered against one role is not on offer for another.
  const relevant = roleId
    ? slots.filter((s) => !s.role_id || s.role_id === roleId)
    : slots

  const { data: taken } = await admin
    .from("interview_rounds")
    .select("slot_id")
    .eq("agency_id", ctx.agencyId)
    .neq("status", "cancelled")
    .not("slot_id", "is", null)
  const takenIds = new Set((taken ?? []).map((r) => r.slot_id as string))

  const free = relevant.filter((s) => !takenIds.has(s.id as string))
  if (free.length === 0) return []

  const contactIds = [...new Set(free.map((s) => s.contact_id as string))]
  const { data: contacts } = await admin
    .from("client_contacts")
    .select("id, company, full_name")
    .eq("agency_id", ctx.agencyId)
    .in("id", contactIds)
  const byId = new Map(
    (contacts ?? []).map((c) => [
      c.id as string,
      { company: (c.company as string) ?? "", fullName: (c.full_name as string) ?? "" },
    ])
  )

  return free.map((s) => ({
    id: s.id as string,
    contactId: s.contact_id as string,
    company: byId.get(s.contact_id as string)?.company ?? "",
    contactName: byId.get(s.contact_id as string)?.fullName ?? "",
    startsAt: s.starts_at as string,
    endsAt: s.ends_at as string,
  }))
}

export interface ScheduleRoundInput {
  roleId: string
  candidateId: string
  slotId: string
  durationMinutes?: number
  meetingUrl?: string
}

/**
 * Book a candidate into one of the client's offered windows.
 *
 * The round number is derived, never supplied: it is one more than the highest
 * round this candidate already has for this role, so it cannot be skipped,
 * duplicated or back-dated by a caller.
 *
 * capture_consent_status stays 'pending'. See the module header — nobody here
 * may assert consent on the candidate's behalf.
 */
export async function scheduleRound(
  ctx: AgencyContext,
  input: ScheduleRoundInput
): Promise<{ roundId: string; roundNumber: number }> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: role } = await admin
    .from("job_roles")
    .select("id, ref")
    .eq("id", input.roleId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (!role) throw new AgencyAccessError("role not found in your agency")

  const { data: candidate } = await admin
    .from("candidates")
    .select("id, ref, role_id")
    .eq("id", input.candidateId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (!candidate || candidate.role_id !== input.roleId) {
    throw new AgencyAccessError("candidate not found on that role")
  }

  const { data: slot } = await admin
    .from("availability_slots")
    .select("id, contact_id, role_id, starts_at, ends_at, revoked_at")
    .eq("id", input.slotId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (!slot || slot.revoked_at) throw new AgencyAccessError("that time is no longer offered")
  if (slot.role_id && slot.role_id !== input.roleId) {
    throw new AgencyAccessError("that time was offered for a different role")
  }
  if (new Date(slot.ends_at as string).getTime() <= Date.now()) {
    throw new AgencyAccessError("that time has already passed")
  }

  const { data: existing } = await admin
    .from("interview_rounds")
    .select("round_number")
    .eq("role_id", input.roleId)
    .eq("candidate_id", input.candidateId)
    .order("round_number", { ascending: false })
    .limit(1)
  const roundNumber = ((existing?.[0]?.round_number as number) ?? 0) + 1

  const { data: round, error } = await admin
    .from("interview_rounds")
    .insert({
      agency_id: ctx.agencyId,
      role_id: input.roleId,
      candidate_id: input.candidateId,
      contact_id: slot.contact_id as string,
      round_number: roundNumber,
      slot_id: input.slotId,
      scheduled_at: slot.starts_at as string,
      duration_minutes: input.durationMinutes ?? 45,
      meeting_url: (input.meetingUrl ?? "").slice(0, MAX_URL),
      status: "scheduled",
    })
    .select("id")
    .single()
  // The partial unique index on slot_id IS the booking mechanism: a race
  // surfaces here as a duplicate-key error rather than two people in one slot.
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new AgencyAccessError("someone was booked into that time a moment ago")
    }
    throw error
  }

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: input.roleId,
    candidateId: input.candidateId,
    actorId: ctx.userId,
    entityType: "round",
    entityRef: (candidate.ref as string) ?? "",
    action: "scheduled",
    toValue: {
      round_id: round.id as string,
      round_number: roundNumber,
      slot_id: input.slotId,
      scheduled_at: slot.starts_at as string,
    },
  })

  return { roundId: round.id as string, roundNumber }
}

/**
 * Cancel or complete a round. Cancelling frees the slot (the open-slot query
 * ignores cancelled rounds), which is why withdrawSlot points here.
 */
export async function setRoundStatus(
  ctx: AgencyContext,
  roundId: string,
  status: Extract<RoundStatus, "completed" | "cancelled">
): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: round } = await admin
    .from("interview_rounds")
    .select("id, agency_id, role_id, candidate_id, round_number, status")
    .eq("id", roundId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (!round) throw new AgencyAccessError("round not found in your agency")
  if (round.status === status) return

  const { error } = await admin
    .from("interview_rounds")
    .update({ status })
    .eq("id", roundId)
    .eq("agency_id", ctx.agencyId)
  if (error) throw error

  const { data: candidate } = await admin
    .from("candidates")
    .select("ref")
    .eq("id", round.candidate_id as string)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: round.role_id as string,
    candidateId: round.candidate_id as string,
    actorId: ctx.userId,
    entityType: "round",
    entityRef: (candidate?.ref as string) ?? "",
    action: status,
    fromValue: { status: round.status as string },
    toValue: { status, round_id: roundId },
  })
}

// ============================================================
// Decisions — the client's call, append-only
// ============================================================

/**
 * Record what the hiring manager decided after a round.
 *
 * Append-only: a reversal INSERTS a new row and the latest wins, so the whole
 * sequence of minds-changed stays readable. Nothing here touches candidate
 * visibility — 'decline' is a state for THE ROUND, never a removal of the
 * person, and no code path anywhere turns it into one.
 */
export async function decideRound(
  ctx: HiringContext,
  roundId: string,
  decision: RoundDecision,
  note?: string
): Promise<void> {
  const admin = agencyAdmin()

  const { data: round, error } = await admin
    .from("interview_rounds")
    .select("id, agency_id, contact_id, role_id, candidate_id, status")
    .eq("id", roundId)
    .maybeSingle()
  if (error) throw error
  if (!round) throw new AgencyAccessError("round not found")
  // The HM may only decide rounds run with them.
  const link = linkFor(ctx, round.contact_id as string)
  if (round.agency_id !== link.agencyId) throw new AgencyAccessError("round not found")

  const { data: candidate } = await admin
    .from("candidates")
    .select("ref")
    .eq("id", round.candidate_id as string)
    .maybeSingle()
  const candidateRef = (candidate?.ref as string) ?? ""

  const { error: insertError } = await admin.from("round_decisions").insert({
    agency_id: link.agencyId,
    round_id: roundId,
    contact_id: round.contact_id as string,
    decided_by: ctx.userId,
    decision,
    note: (note ?? "").slice(0, 2000),
    candidate_ref: candidateRef,
  })
  if (insertError) throw insertError

  await writeAudit(admin, {
    agencyId: link.agencyId,
    roleId: round.role_id as string,
    candidateId: round.candidate_id as string,
    actorId: ctx.userId,
    entityType: "decision",
    entityRef: candidateRef,
    action: decision,
    toValue: { round_id: roundId, decision },
  })
}
