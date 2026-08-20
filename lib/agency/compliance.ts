/**
 * Right-to-work and logistics — the recruiter's compliance capture.
 *
 * Its own table, not columns on candidates: candidates carries a table-level
 * authenticated UPDATE grant, and an assertion like "I verified this
 * person's right to work" must not be writable without its audit row. So
 * agency.candidate_compliance has no authenticated write grants at all, and
 * this module is the only writer — service role, ownership asserted, audit
 * row in the same operation. The standard audit-coupling shape.
 *
 * Two lines this module holds:
 *
 * - STATUSES ARE FACTS, NOT CONCLUSIONS. 'verified' and 'needs_sponsorship'
 *   record what was checked. There is deliberately no 'not_eligible':
 *   that is a decision about a person, decisions belong to people, and
 *   nothing in this product auto-rejects. rtw_status must never filter a
 *   candidate list — a guardrail test scans for exactly that.
 *
 * - NO DOCUMENTS. The note records HOW the check was done ("share code
 *   checked 20 Aug"), never the documents themselves. Identity documents
 *   are a separate compliance surface with its own retention rules, and
 *   holding passport scans casually is how agencies fail audits.
 */

import { agencyAdmin, writeAudit, assertWriter, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

export const RTW_STATUSES = ["unverified", "verified", "needs_sponsorship"] as const
export type RtwStatus = (typeof RTW_STATUSES)[number]

const MAX_NOTE = 1000
const MAX_NOTICE = 200

export interface ComplianceInput {
  rtwStatus: RtwStatus
  /** How the check was performed. Required when the status says one was. */
  rtwNote?: string
  noticePeriod?: string
}

export interface ComplianceView {
  rtwStatus: RtwStatus
  rtwNote: string
  rtwCheckedAt: string | null
  noticePeriod: string
}

const cap = (v: string | null | undefined, n: number) => (v ?? "").trim().slice(0, n)

export async function setCandidateCompliance(
  ctx: AgencyContext,
  candidateId: string,
  input: ComplianceInput
): Promise<ComplianceView> {
  assertWriter(ctx)
  if (!RTW_STATUSES.includes(input.rtwStatus)) {
    throw new AgencyAccessError("unknown right-to-work status")
  }

  const admin = agencyAdmin()

  // Ownership asserted before the service-role write, as everywhere.
  const { data: candidate, error } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, ref")
    .eq("id", candidateId)
    .maybeSingle()
  if (error) throw error
  if (!candidate || candidate.agency_id !== ctx.agencyId) {
    throw new AgencyAccessError("candidate not found in your agency")
  }

  // A status that claims a check happened must say how it was done — the
  // note is the substance of the assertion, not decoration on it.
  const note = cap(input.rtwNote, MAX_NOTE)
  if (input.rtwStatus !== "unverified" && !note) {
    throw new AgencyAccessError(
      "say how the check was done — the note is what makes this an assertion rather than a checkbox"
    )
  }

  const { data: existing } = await admin
    .from("candidate_compliance")
    .select("rtw_status, notice_period")
    .eq("candidate_id", candidateId)
    .maybeSingle()

  const checked = input.rtwStatus !== "unverified"
  const row = {
    candidate_id: candidateId,
    agency_id: ctx.agencyId,
    rtw_status: input.rtwStatus,
    rtw_note: note,
    rtw_checked_at: checked ? new Date().toISOString() : null,
    rtw_checked_by: checked ? ctx.userId : null,
    notice_period: cap(input.noticePeriod, MAX_NOTICE),
    updated_at: new Date().toISOString(),
  }

  const { error: upsertError } = await admin
    .from("candidate_compliance")
    .upsert(row, { onConflict: "candidate_id" })
  if (upsertError) throw upsertError

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: candidate.role_id as string,
    candidateId,
    actorId: ctx.userId,
    entityType: "candidate",
    entityRef: (candidate.ref as string) ?? "",
    action: "compliance_recorded",
    fromValue: existing
      ? { rtw_status: existing.rtw_status, notice_period: existing.notice_period }
      : null,
    // Status and shape only — the note can name a share code, which is the
    // candidate's, and the audit log is not where it lives.
    toValue: {
      rtw_status: input.rtwStatus,
      has_note: note.length > 0,
      notice_period: row.notice_period,
    },
  })

  return {
    rtwStatus: input.rtwStatus,
    rtwNote: note,
    rtwCheckedAt: row.rtw_checked_at,
    noticePeriod: row.notice_period,
  }
}

export async function getCandidateCompliance(
  ctx: AgencyContext,
  candidateId: string
): Promise<ComplianceView | null> {
  const admin = agencyAdmin()
  const { data: candidate } = await admin
    .from("candidates")
    .select("id, agency_id")
    .eq("id", candidateId)
    .maybeSingle()
  if (!candidate || candidate.agency_id !== ctx.agencyId) return null

  const { data } = await admin
    .from("candidate_compliance")
    .select("rtw_status, rtw_note, rtw_checked_at, notice_period")
    .eq("candidate_id", candidateId)
    .maybeSingle()

  if (!data) {
    return { rtwStatus: "unverified", rtwNote: "", rtwCheckedAt: null, noticePeriod: "" }
  }
  return {
    rtwStatus: data.rtw_status as RtwStatus,
    rtwNote: (data.rtw_note as string) ?? "",
    rtwCheckedAt: (data.rtw_checked_at as string | null) ?? null,
    noticePeriod: (data.notice_period as string) ?? "",
  }
}
