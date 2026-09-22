/**
 * Placements — the event the business is paid for.
 *
 * The loop ran decision → references → handover with no record of who
 * actually got the job, which meant an agency could not compute fill rate,
 * time-to-fill, fee value or rebate exposure from its own data.
 *
 * Audit-coupled because placements are money: agency.placements has NO
 * authenticated write grants, so this module is the only writer — service
 * role, ownership asserted, audit row in the same operation.
 *
 * Two lines this module holds:
 *
 * - STATUS IS AN OUTCOME, NEVER A JUDGEMENT. 'declined' records that the
 *   candidate said no to an offer. It is not a mark against them, it must
 *   never filter or rank anyone, and a guardrail test scans every agency
 *   source for exactly that. Same rule as rtw_status and client declines.
 *
 * - RECORDING A PLACEMENT DOES NOT CLOSE THE ROLE. Closing is the
 *   recruiter's deliberate act because it starts the retention clock. A
 *   role can also place more than one person, so an automatic close would
 *   be wrong as often as it was right.
 *
 * - A HIRE THAT SKIPPED THE LOOP SAYS SO (14 Sep 2026). Until now this
 *   module read no decisions at all, so a placement — the fee, the rebate
 *   window, the start date — could be recorded against a candidate nobody
 *   ever advanced, silently. That happens legitimately: the client hires
 *   someone you introduced, off-process. It is not an error to record, it
 *   is an error not to say so. Whether an advance decision exists is
 *   DERIVED here at write time, never typed by the recruiter; the reason is
 *   asked for only when the trail is actually missing.
 */

import { agencyAdmin, writeAudit, assertWriter, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

export const PLACEMENT_STATUSES = [
  "offered",
  "accepted",
  "declined",
  "started",
  "fell_through",
] as const
export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number]

const MAX_NOTES = 2000
const MAX_REASON = 500

export interface PlacementInput {
  status: PlacementStatus
  /** ISO date (yyyy-mm-dd). The day they actually start, not when it was agreed. */
  startDate?: string | null
  feePercent?: number | null
  feeValue?: number | null
  currency?: string
  rebateWeeks?: number | null
  fellThroughReason?: string
  notes?: string
  /** Required only when the candidate has no advance decision on this role. */
  outsideProcessReason?: string
}

export interface PlacementView {
  id: string
  candidateId: string
  candidateRef: string
  candidateName: string
  status: PlacementStatus
  offeredAt: string
  acceptedAt: string | null
  declinedAt: string | null
  startDate: string | null
  fellThroughAt: string | null
  fellThroughReason: string
  feePercent: number | null
  feeValue: number | null
  currency: string
  rebateWeeks: number | null
  /** This hire did not come through the interview loop. A fact about how it
   *  happened, never a judgement about the person: it must not filter, rank
   *  or sort anyone, exactly as 'declined' must not. */
  outsideProcess: boolean
  outsideProcessReason: string
  /** Derived, never stored: start_date + rebate_weeks. Null when either is. */
  rebateUntil: string | null
  /** Whether that window is still open as of now. */
  inRebateWindow: boolean
  notes: string
}

const cap = (v: string | null | undefined, n: number) => (v ?? "").trim().slice(0, n)

/**
 * The client's latest word on this candidate: the latest decision on their
 * most recent decided round, or null.
 *
 * 21 Sep 2026: this used to be "was there EVER an advance row", so CAN-12 —
 * advanced at round 1, declined at round 2 — counted as having come through
 * the process, and a placement for them would not have asked how the hire
 * happened. round_decisions is append-only and the latest row wins, per
 * round; across rounds, the most recent decided round is the client's
 * current position. Cancelled rounds carry no decision that counts.
 *
 * Pure, and exported for the test.
 */
export function latestLoopDecision(
  rounds: Array<{ id: string; round_number: number; status: string }>,
  decisions: Array<{ round_id: string; decision: string; created_at: string }>
): string | null {
  const latestByRound = new Map<string, { decision: string; at: string }>()
  for (const d of decisions) {
    const seen = latestByRound.get(d.round_id)
    if (!seen || d.created_at > seen.at) latestByRound.set(d.round_id, { decision: d.decision, at: d.created_at })
  }
  const decided = rounds
    .filter((r) => r.status !== "cancelled" && latestByRound.has(r.id))
    .sort((a, b) => b.round_number - a.round_number)
  return decided.length ? latestByRound.get(decided[0].id)!.decision : null
}

/**
 * Did the client take this candidate forward on this role?
 *
 * True only when their latest decision (see latestLoopDecision) is
 * 'advance'. Hold and decline do not count, and a candidate with no rounds
 * at all has no advance decision either.
 *
 * Exported so the screen can ask the same question BEFORE the recruiter
 * starts filling the form, rather than being refused after it.
 */
export async function hasAdvanceDecision(
  admin: ReturnType<typeof agencyAdmin>,
  agencyId: string,
  roleId: string,
  candidateId: string
): Promise<boolean> {
  const { data: rounds, error: roundErr } = await admin
    .from("interview_rounds")
    .select("id, round_number, status")
    .eq("agency_id", agencyId)
    .eq("role_id", roleId)
    .eq("candidate_id", candidateId)
  if (roundErr) throw roundErr
  const roundIds = (rounds ?? []).map((r) => r.id as string)
  if (roundIds.length === 0) return false

  const { data: decisions, error: decisionErr } = await admin
    .from("round_decisions")
    .select("round_id, decision, created_at")
    .eq("agency_id", agencyId)
    .in("round_id", roundIds)
  if (decisionErr) throw decisionErr
  return (
    latestLoopDecision(
      (rounds ?? []).map((r) => ({ id: r.id as string, round_number: r.round_number as number, status: r.status as string })),
      (decisions ?? []).map((d) => ({ round_id: d.round_id as string, decision: d.decision as string, created_at: d.created_at as string }))
    ) === "advance"
  )
}

/** start_date + rebate_weeks, computed rather than stored so a corrected
 *  start date cannot leave a stale window behind. */
export function rebateWindow(
  startDate: string | null,
  rebateWeeks: number | null,
  now: Date = new Date()
): { until: string | null; open: boolean } {
  if (!startDate || rebateWeeks == null) return { until: null, open: false }
  const start = new Date(`${startDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return { until: null, open: false }
  const until = new Date(start.getTime() + rebateWeeks * 7 * 24 * 60 * 60 * 1000)
  return { until: until.toISOString().slice(0, 10), open: now.getTime() < until.getTime() }
}

function shape(row: Record<string, unknown>, candidate: { ref?: string; name?: string }): PlacementView {
  const startDate = (row.start_date as string | null) ?? null
  const rebateWeeks = row.rebate_weeks == null ? null : Number(row.rebate_weeks)
  const win = rebateWindow(startDate, rebateWeeks)
  return {
    id: row.id as string,
    candidateId: row.candidate_id as string,
    candidateRef: candidate.ref ?? "",
    candidateName: candidate.name ?? "",
    status: row.status as PlacementStatus,
    offeredAt: row.offered_at as string,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    declinedAt: (row.declined_at as string | null) ?? null,
    startDate,
    fellThroughAt: (row.fell_through_at as string | null) ?? null,
    fellThroughReason: (row.fell_through_reason as string) ?? "",
    feePercent: row.fee_percent == null ? null : Number(row.fee_percent),
    feeValue: row.fee_value == null ? null : Number(row.fee_value),
    currency: (row.currency as string) ?? "GBP",
    rebateWeeks,
    outsideProcess: Boolean(row.outside_process),
    outsideProcessReason: (row.outside_process_reason as string | null) ?? "",
    rebateUntil: win.until,
    inRebateWindow: win.open && row.status === "started",
    notes: (row.notes as string) ?? "",
  }
}

/**
 * Record or update the placement for one candidate on one role.
 *
 * Timestamps are stamped from the status rather than accepted from the
 * caller: 'accepted' means accepted now. The exception is start_date, which
 * is a real-world date the recruiter knows and often lies in the future.
 */
export async function setPlacement(
  ctx: AgencyContext,
  candidateId: string,
  input: PlacementInput
): Promise<PlacementView> {
  assertWriter(ctx)
  if (!PLACEMENT_STATUSES.includes(input.status)) {
    throw new AgencyAccessError("unknown placement status")
  }
  if (input.status === "fell_through" && !cap(input.fellThroughReason, MAX_REASON)) {
    // A fall-off is the money event. Recording one without saying why leaves
    // the agency unable to learn anything from the most expensive thing that
    // happens to it.
    throw new AgencyAccessError("say what happened — a fall-through without a reason teaches nobody anything")
  }

  const admin = agencyAdmin()

  const { data: candidate, error } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, ref, full_name")
    .eq("id", candidateId)
    .maybeSingle()
  if (error) throw error
  if (!candidate || candidate.agency_id !== ctx.agencyId) {
    throw new AgencyAccessError("candidate not found in your agency")
  }

  const { data: existing } = await admin
    .from("placements")
    .select("id, status, fee_value, start_date")
    .eq("role_id", candidate.role_id as string)
    .eq("candidate_id", candidateId)
    .maybeSingle()

  /**
   * Derived, never typed. The recruiter does not tick a box saying "this was
   * off-process" — the route works out whether the client ever advanced this
   * person and asks for a reason only when it did not.
   */
  const advanced = await hasAdvanceDecision(
    admin,
    ctx.agencyId,
    candidate.role_id as string,
    candidateId
  )
  const outsideReason = cap(input.outsideProcessReason, MAX_REASON)
  if (!advanced && !outsideReason) {
    throw new AgencyAccessError(
      "this candidate has no advance decision on this role — say how the hire happened, and it travels with the record"
    )
  }

  const now = new Date().toISOString()
  const stamped: Record<string, unknown> = {
    agency_id: ctx.agencyId,
    role_id: candidate.role_id as string,
    candidate_id: candidateId,
    status: input.status,
    start_date: input.startDate || null,
    fee_percent: input.feePercent ?? null,
    fee_value: input.feeValue ?? null,
    currency: cap(input.currency, 8) || "GBP",
    rebate_weeks: input.rebateWeeks ?? null,
    fell_through_reason: input.status === "fell_through" ? cap(input.fellThroughReason, MAX_REASON) : "",
    // placement_reason_iff_outside is enforced in both directions, so the
    // reason must be NULL — not "" — whenever the flag is false.
    outside_process: !advanced,
    outside_process_reason: advanced ? null : outsideReason,
    notes: cap(input.notes, MAX_NOTES),
    updated_at: now,
  }
  // Each status stamps its own moment, and only on arrival — re-saving an
  // accepted placement must not move the day it was accepted.
  if (input.status === "accepted" && existing?.status !== "accepted") stamped.accepted_at = now
  if (input.status === "declined" && existing?.status !== "declined") stamped.declined_at = now
  if (input.status === "started" && existing?.status !== "started") stamped.started_at = now
  if (input.status === "fell_through" && existing?.status !== "fell_through") stamped.fell_through_at = now
  if (!existing) {
    stamped.offered_at = now
    stamped.created_by = ctx.userId
  }

  const { data: saved, error: upsertError } = await admin
    .from("placements")
    .upsert(stamped, { onConflict: "role_id,candidate_id" })
    .select("*")
    .single()
  if (upsertError) throw upsertError

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: candidate.role_id as string,
    candidateId,
    actorId: ctx.userId,
    entityType: "candidate",
    entityRef: (candidate.ref as string) ?? "",
    action: existing
      ? "placement_updated"
      : !advanced
        ? "placement_recorded_outside_process"
        : "placement_recorded",
    fromValue: existing ? { status: existing.status, fee_value: existing.fee_value } : null,
    // Money and dates are the point of this record, so they are IN the audit
    // trail deliberately — unlike a compliance note, a fee is the agency's
    // own commercial fact, not the candidate's personal data.
    toValue: {
      status: input.status,
      fee_value: stamped.fee_value,
      start_date: stamped.start_date,
      rebate_weeks: stamped.rebate_weeks,
    },
  })

  return shape(saved, { ref: candidate.ref as string, name: candidate.full_name as string })
}

/** The placement for one candidate, or null when they have none. */
export async function getPlacementForCandidate(
  ctx: AgencyContext,
  candidateId: string
): Promise<PlacementView | null> {
  const admin = agencyAdmin()
  const { data: candidate } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, ref, full_name")
    .eq("id", candidateId)
    .maybeSingle()
  if (!candidate || candidate.agency_id !== ctx.agencyId) return null

  const { data } = await admin
    .from("placements")
    .select("*")
    .eq("role_id", candidate.role_id as string)
    .eq("candidate_id", candidateId)
    // A voided placement is out of every read and every number (22 Sep
    // 2026). The row survives for the audit; it is no longer a placement.
    .is("voided_at", null)
    .maybeSingle()
  if (!data) return null
  return shape(data, { ref: candidate.ref as string, name: candidate.full_name as string })
}

/** Every placement on a role — a role may fill more than one seat. */
export async function listPlacementsForRole(
  ctx: AgencyContext,
  roleId: string
): Promise<PlacementView[]> {
  const admin = agencyAdmin()
  const { data: role } = await admin
    .from("job_roles")
    .select("id, agency_id")
    .eq("id", roleId)
    .maybeSingle()
  if (!role || role.agency_id !== ctx.agencyId) return []

  const { data: rows } = await admin
    .from("placements")
    .select("*")
    .eq("role_id", roleId)
    .is("voided_at", null)
    .order("offered_at", { ascending: false })
  if (!rows?.length) return []

  const { data: candidates } = await admin
    .from("candidates")
    .select("id, ref, full_name")
    .in("id", rows.map((r) => r.candidate_id as string))
  const byId = new Map(
    (candidates ?? []).map((c) => [c.id as string, { ref: c.ref as string, name: c.full_name as string }])
  )

  return rows.map((r) => shape(r, byId.get(r.candidate_id as string) ?? {}))
}

/**
 * Void a placement — the correction that `declined` and `fell_through` are
 * not (22 Sep 2026).
 *
 * Those two are OUTCOMES, and outcomes are about a person: "they turned it
 * down", "they left inside the rebate window". Recording a placement against
 * the wrong candidate, or at the wrong fee, is neither — it is a mistake
 * about the record, and using an outcome to fix it writes a false fact about
 * somebody's career into an audited table.
 *
 * Soft, and with a reason in writing, because a placement is money: it
 * carries the fee, the rebate window and the invoice date, and a hard delete
 * would take the trail of what was claimed with it. A voided row leaves fill
 * rate, fee value and rebate exposure; it does not leave the audit.
 */
export async function voidPlacement(
  ctx: AgencyContext,
  placementId: string,
  reason: string
): Promise<void> {
  assertWriter(ctx)
  const admin = agencyAdmin()
  const trimmed = (reason ?? "").trim().slice(0, 500)
  if (!trimmed) throw new AgencyAccessError("say why this placement is being voided")

  const { data: row, error: readError } = await admin
    .from("placements")
    .select("id, agency_id, role_id, candidate_id, status, voided_at")
    .eq("id", placementId)
    .maybeSingle()
  if (readError) throw readError
  if (!row || row.agency_id !== ctx.agencyId) {
    throw new AgencyAccessError("that placement is not on this agency")
  }
  if (row.voided_at) return

  // The audit row is keyed to the CANDIDATE, exactly as setPlacement's is:
  // 'placement' is not a value of the audit_log entity_type constraint, and
  // the pair of them have to stay in step (audit-entity-types.test.ts).
  // Reading the ref here also keeps the trail human — 'CAN-04', not a uuid.
  const { data: candidate } = await admin
    .from("candidates")
    .select("ref")
    .eq("id", row.candidate_id as string)
    .maybeSingle()

  const { error } = await admin
    .from("placements")
    .update({ voided_at: new Date().toISOString(), voided_by: ctx.userId, void_reason: trimmed })
    .eq("id", placementId)
    .eq("agency_id", ctx.agencyId)
    .is("voided_at", null)
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: row.role_id as string,
    candidateId: row.candidate_id as string,
    actorId: ctx.userId,
    entityType: "candidate",
    entityRef: (candidate?.ref as string) ?? "",
    action: "placement_voided",
    fromValue: { status: row.status as string },
    reason: trimmed,
  })
}
