/**
 * Right-to-work and logistics — the recruiter's compliance capture.
 *
 * Its own table, not columns on candidates: candidates carries a table-level
 * authenticated UPDATE grant, and an assertion like "we have seen this
 * person's right to work" must not be writable without its audit row. So
 * agency.candidate_compliance has no authenticated write grants at all, and
 * this module is the only writer — service role, ownership asserted, audit
 * row in the same operation. The standard audit-coupling shape.
 *
 * TWO AXES, NOT ONE (migration 27). This shipped with a single column whose
 * values were ('unverified','verified','needs_sponsorship'), which made two
 * independent facts mutually exclusive: someone on time-limited permission
 * who needs sponsorship to continue AND whose current permission was checked
 * could not be recorded truthfully. They are separate questions now and are
 * asked separately.
 *
 * THE AGENCY IS NOT THE EMPLOYER. For permanent placement the statutory
 * excuse and the civil penalty for illegal working belong to the client.
 * Nothing recorded here gives the client that excuse, and the employer must
 * still run its own check before employment starts. That is why the evidence
 * axis says 'seen' and never 'verified' — the old word invited a recruiter to
 * tell a client the check was done, which would have been false and
 * expensive. Every surface rendering this must carry the sentence.
 *
 * The lines this module holds:
 *
 * - STATUSES ARE FACTS, NOT CONCLUSIONS. There is deliberately no
 *   'not_eligible' on either axis, and 'unsure' is a legitimate sponsorship
 *   answer that stays legitimate — the alternative is a recruiter guessing at
 *   immigration law on somebody's behalf. Nothing here may filter, rank, hide
 *   or order a candidate; a guardrail test scans for exactly that.
 *
 * - NO DOCUMENTS. The note records HOW ("share code checked 20 Aug"), never
 *   the documents themselves. Identity documents are a separate compliance
 *   surface with their own retention rules, and holding passport scans
 *   casually is how agencies fail audits.
 *
 * - THE AUDIT ROW CARRIES SHAPE, NOT SUBSTANCE. It records that a note
 *   exists, never its text; that an expiry exists, never the date. A share
 *   code and an expiry date are both the candidate's own information, and
 *   the audit log is not where either lives.
 */

import { agencyAdmin, writeAudit, assertWriter, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"
// One definition of the vocabulary, shared with the client component. It
// lives in a server-import-free module because a browser bundle must not
// reach agencyAdmin through this file — see compliance-vocab.ts.
import {
  RTW_EVIDENCE,
  RTW_SPONSORSHIP,
  type RtwEvidence,
  type RtwSponsorship,
} from "./compliance-vocab"

export { RTW_EVIDENCE, RTW_SPONSORSHIP }
export type { RtwEvidence, RtwSponsorship }

const MAX_NOTE = 1000
const MAX_NOTICE = 200

export interface ComplianceInput {
  rtwEvidence: RtwEvidence
  /** How the check was performed. Required when the status says one happened. */
  rtwNote?: string
  /** When that permission runs out. `null` means none recorded — which is not
   * the same as "does not expire", and the UI must not say that it is. */
  rtwExpiresOn?: string | null
  rtwSponsorship?: RtwSponsorship
  noticePeriod?: string
}

export interface ComplianceView {
  rtwEvidence: RtwEvidence
  rtwNote: string
  rtwCheckedAt: string | null
  rtwExpiresOn: string | null
  rtwSponsorship: RtwSponsorship
  noticePeriod: string
  /**
   * The day the employer's own check is needed by, derived from a placement's
   * start_date — never stored, so a corrected start date cannot strand a
   * stale deadline. The same reasoning as the placement rebate window.
   *
   * `null` when there is no placement or no start date yet. It is context,
   * not a gate: nothing about it blocks, filters or ranks anybody.
   */
  requiredBy: string | null
}

const cap = (v: string | null | undefined, n: number) => (v ?? "").trim().slice(0, n)

/** `YYYY-MM-DD` or nothing. Rejects rather than coerces: a half-parsed date
 * on somebody's immigration record is worse than an empty field. */
function cleanDate(v: string | null | undefined): string | null {
  const s = (v ?? "").trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new AgencyAccessError("an expiry date must be a calendar date (YYYY-MM-DD)")
  }
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new AgencyAccessError("that is not a real date")
  }
  return s
}

export async function setCandidateCompliance(
  ctx: AgencyContext,
  candidateId: string,
  input: ComplianceInput
): Promise<ComplianceView> {
  assertWriter(ctx)
  if (!RTW_EVIDENCE.includes(input.rtwEvidence)) {
    throw new AgencyAccessError("unknown right-to-work evidence state")
  }
  const sponsorship: RtwSponsorship = input.rtwSponsorship ?? "not_asked"
  if (!RTW_SPONSORSHIP.includes(sponsorship)) {
    throw new AgencyAccessError("unknown sponsorship answer")
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

  // A state that claims evidence was seen must say how it was seen — the note
  // is the substance of the assertion, not decoration on it.
  const note = cap(input.rtwNote, MAX_NOTE)
  const seen = input.rtwEvidence === "seen"
  if (seen && !note) {
    throw new AgencyAccessError(
      "say how the check was done — the note is what makes this an assertion rather than a checkbox"
    )
  }

  // An expiry is a fact about evidence. Claiming one without the other is
  // incoherent, and the database refuses it too (migration 27).
  const expiresOn = cleanDate(input.rtwExpiresOn)
  if (expiresOn && !seen) {
    throw new AgencyAccessError(
      "an expiry date belongs to evidence somebody looked at — record the evidence first"
    )
  }

  const { data: existing } = await admin
    .from("candidate_compliance")
    .select("rtw_evidence, rtw_sponsorship, notice_period")
    .eq("candidate_id", candidateId)
    .maybeSingle()

  const row = {
    candidate_id: candidateId,
    agency_id: ctx.agencyId,
    rtw_evidence: input.rtwEvidence,
    rtw_note: note,
    rtw_checked_at: seen ? new Date().toISOString() : null,
    rtw_checked_by: seen ? ctx.userId : null,
    rtw_expires_on: expiresOn,
    rtw_sponsorship: sponsorship,
    notice_period: cap(input.noticePeriod, MAX_NOTICE),
    // No trigger maintains this, so the writer must.
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
      ? {
          rtw_evidence: existing.rtw_evidence,
          rtw_sponsorship: existing.rtw_sponsorship,
          notice_period: existing.notice_period,
        }
      : null,
    // Shape only. The note can name a share code and the expiry IS somebody's
    // immigration position — both are the candidate's, and neither belongs in
    // a log the whole agency can read. Booleans record that they happened.
    toValue: {
      rtw_evidence: input.rtwEvidence,
      has_note: note.length > 0,
      has_expiry: expiresOn !== null,
      rtw_sponsorship: sponsorship,
      notice_period: row.notice_period,
    },
  })

  return {
    rtwEvidence: input.rtwEvidence,
    rtwNote: note,
    rtwCheckedAt: row.rtw_checked_at,
    rtwExpiresOn: expiresOn,
    rtwSponsorship: sponsorship,
    noticePeriod: row.notice_period,
    requiredBy: await deriveRequiredBy(admin, candidateId, ctx.agencyId),
  }
}

/**
 * When the employer's own check is needed by.
 *
 * The brief that prompted this work wanted a configurable "trigger stage"
 * defaulting to conditional offer. We already have that event: a placement
 * row IS the offer, and it carries the start date. So the deadline is derived
 * from data the product already holds rather than from a new setting nobody
 * would ever change.
 *
 * Read-only and advisory. It never gates a save and never ranks anybody.
 */
async function deriveRequiredBy(
  admin: ReturnType<typeof agencyAdmin>,
  candidateId: string,
  agencyId: string
): Promise<string | null> {
  const { data } = await admin
    .from("placements")
    .select("start_date, status")
    .eq("candidate_id", candidateId)
    .eq("agency_id", agencyId)
    .order("offered_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  // A placement that fell through or was declined sets no deadline — there is
  // no employment for a check to precede.
  if (data.status === "declined" || data.status === "fell_through") return null
  return (data.start_date as string | null) ?? null
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
    .select("rtw_evidence, rtw_note, rtw_checked_at, rtw_expires_on, rtw_sponsorship, notice_period")
    .eq("candidate_id", candidateId)
    .maybeSingle()

  const requiredBy = await deriveRequiredBy(admin, candidateId, ctx.agencyId)

  if (!data) {
    return {
      rtwEvidence: "not_checked",
      rtwNote: "",
      rtwCheckedAt: null,
      rtwExpiresOn: null,
      rtwSponsorship: "not_asked",
      noticePeriod: "",
      requiredBy,
    }
  }
  return {
    rtwEvidence: data.rtw_evidence as RtwEvidence,
    rtwNote: (data.rtw_note as string) ?? "",
    rtwCheckedAt: (data.rtw_checked_at as string | null) ?? null,
    rtwExpiresOn: (data.rtw_expires_on as string | null) ?? null,
    rtwSponsorship: (data.rtw_sponsorship as RtwSponsorship) ?? "not_asked",
    noticePeriod: (data.notice_period as string) ?? "",
    requiredBy,
  }
}
