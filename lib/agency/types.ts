/**
 * Shared vocabulary for Tailr for Agencies (the `agency` Postgres schema).
 * Mirrors supabase/migrations/20260805{12..17}0000_*.sql — if a type here
 * drifts from those files, the migration is the truth.
 */

export type MemberRole = "owner" | "recruiter" | "viewer"
export type RoleStatus = "draft" | "open" | "submitted" | "closed"
export type Weight = "must" | "important" | "nice"
export type Strength = "strong" | "transferable" | "partial" | "missing"
export type ParseStatus = "pending" | "parsing" | "parsed" | "failed" | "partial"
export type Decision = "shortlist" | "hold" | "reject" | null
export type SubmissionFormat = "document" | "email" | "portal"

/** Resolved once per request from the session; never from client input. */
export interface AgencyMembership {
  agencyId: string
  agencyName: string
  role: MemberRole
}

export interface AgencyContext {
  agencyId: string
  userId: string
  role: MemberRole
  /** Display name of the agency this request is scoped to. Optional because
   * tests and older callers construct contexts by hand. */
  agencyName?: string
  /** Every active membership the caller holds, so the chrome can name the
   * current agency and offer the others. Never a permission — every query is
   * still scoped by agencyId. */
  memberships?: AgencyMembership[]
}

export interface JobRole {
  id: string
  agency_id: string
  ref: string
  title: string
  company: string
  company_context: string
  salary_band: string
  location: string
  seniority: string
  jd_raw: string
  recruiter_notes: string
  status: RoleStatus
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface Requirement {
  id: string
  role_id: string
  ref: string
  text: string
  weight: Weight
  category: string
  origin: "parsed" | "recruiter"
  sort_order: number
}

export interface RoleConstraint {
  id: string
  role_id: string
  ref: string
  text: string
  kind: "location" | "work-mode" | "comp" | "other"
  sort_order: number
}

export interface Candidate {
  id: string
  agency_id: string
  role_id: string
  ref: string
  full_name: string
  email: string | null
  current_title: string
  years: number | null
  location: string
  salary_text: string
  source: "upload" | "paste" | "ats" | "referral" | "tailr_profile"
  source_detail: string
  ingested_at: string
  retention_expires_at: string | null
  redacted: boolean
  cv_storage_path: string | null
  parse_status: ParseStatus
  parse_error: string | null
  duplicate_of: string | null
}

export interface CandidateEvidence {
  id: string
  candidate_id: string
  requirement_id: string
  strength: Strength
  quote: string | null
  source_cite: string
  origin: "cv" | "tailr_profile"
}

export interface ScoreBreakdown {
  candidate_id: string
  overall: number
  requirement_coverage: number
  evidence_strength: number
  seniority_calibration: number
  context_fit: number
  confidence_completeness: number
  must_have_hit: number
  must_have_total: number
  confidence_level: 1 | 2 | 3 | 4
  effective: Record<string, Strength>
  original_overall: number | null
  inputs_hash: string
  engine_version: string
  computed_at: string
}

export interface AuditEntry {
  agencyId: string
  roleId?: string | null
  candidateId?: string | null
  actorId?: string | null
  entityType:
    | "role"
    | "requirement"
    | "constraint"
    | "candidate"
    | "override"
    | "decision"
    | "submission"
    | "notice"
    | "rights_request"
    | "member"
    // Client-actor + interview loop (widened by the audit_log check constraint
    // in 20260813120000_agency_client_auth.sql — keep the two in step).
    | "client_invite"
    | "brief"
    | "availability"
    | "round"
    | "artifact"
    | "reference"
    | "handover"
  entityRef: string
  action: string
  fromValue?: unknown
  toValue?: unknown
  reason?: string
}

// ============================================================
// Hiring manager — the client actor (docs/AGENCIES_SCHEMA.md §5.4, §5.5)
//
// A hiring manager is NOT a member. They are an auth.users row that a
// recruiter-issued invite bound to one or more agency.client_contacts rows.
// They hold ZERO RLS grants: every type below describes the shape of a
// service-role read that has already been filtered by disclosure rules in
// lib/agency/client-auth.ts. If you add a field here, ask first whether a
// client is entitled to see it.
// ============================================================

/** One agency ↔ hiring-manager link. A person may hold several, one per
 * agency (and, legitimately, more than one at the same agency under two
 * addresses). Each is independently granted and independently revocable. */
export interface HiringLink {
  contactId: string
  agencyId: string
  agencyName: string
  company: string
  fullName: string
}

/** Resolved once per request from the session by requireHiringContext().
 * contact ids are NEVER accepted from the client — same rule as AgencyContext. */
export interface HiringContext {
  userId: string
  email: string
  links: HiringLink[]
}

export type HiringFailure = "unauthenticated" | "not_linked"

export type BriefStatus = "submitted" | "accepted" | "declined"
export type RoundStatus = "scheduled" | "completed" | "cancelled"
export type RoundDecision = "advance" | "hold" | "decline"

/** Invite/link state of one client contact, as the recruiter's access UI
 * needs it. `expired` is a live-but-stale invite; `none` means never invited
 * (or the last invite was revoked). */
export type ClientAccessState = "linked" | "invited" | "expired" | "none"

export interface ClientAccessRow {
  contactId: string
  company: string
  email: string
  fullName: string
  state: ClientAccessState
  /** The invite the state refers to — null when linked or never invited. */
  inviteId: string | null
  expiresAt: string | null
}

/** A brief as its own author sees it. List shape: the body fields
 * (mission/must_haves/nice_to_haves) belong to a detail read, not a
 * dashboard payload. */
export interface HiringBrief {
  id: string
  agency_id: string
  contact_id: string
  role_title: string
  team: string
  location: string
  comp: string
  status: BriefStatus
  /** Set once a recruiter accepted the brief and minted the job role. */
  role_id: string | null
  created_at: string
  decided_at: string | null
}

/** An availability offer the HM made. `booked` is derived, never stored — a
 * slot is booked iff an interview round references it (§5.5). */
export interface HiringSlot {
  id: string
  agency_id: string
  contact_id: string
  role_id: string | null
  starts_at: string
  ends_at: string
  booked: boolean
}

/**
 * An interview round as a CLIENT may see it.
 *
 * DISCLOSURE: candidate identity is `candidate_ref` ('CAN-01') and nothing
 * else. There is deliberately no full_name, no CV content, no evidence, no
 * recruiter note and no capture-consent state on this type — consent is
 * between the candidate and the recruiter. Do not add them.
 */
export interface HiringRound {
  id: string
  agency_id: string
  contact_id: string
  role_id: string
  role_title: string
  candidate_ref: string
  round_number: number
  scheduled_at: string | null
  duration_minutes: number
  meeting_url: string
  status: RoundStatus
  /** Latest append-only decision made by this client for this round. */
  latest_decision: RoundDecision | null
  latest_decision_at: string | null
}

export interface HiringDashboardCounts {
  briefs: number
  briefsSubmitted: number
  briefsAccepted: number
  slots: number
  rounds: number
  roundsScheduled: number
}

export interface HiringDashboard {
  links: HiringLink[]
  briefs: HiringBrief[]
  slots: HiringSlot[]
  rounds: HiringRound[]
  counts: HiringDashboardCounts
}
