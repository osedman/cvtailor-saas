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
export interface AgencyContext {
  agencyId: string
  userId: string
  role: MemberRole
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
  entityRef: string
  action: string
  fromValue?: unknown
  toValue?: unknown
  reason?: string
}
