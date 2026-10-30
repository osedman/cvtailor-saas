-- Tailr — security + speed pass on the agency schema (30 Sep 2026).
-- Companion to 20260930120000_harden_public.sql; split so production can run
-- the public half before the agency schema is ported there.
--
-- SECURITY
--
-- 1. has_role() and member_agency_ids() are the helpers the agency row
--    policies call, so signed-in users keep EXECUTE (a policy calling a
--    function the caller cannot execute is an error, not a denial). anon has
--    no grant on any agency table, so it never evaluates those policies —
--    it loses the functions, and the RPC endpoints with them.
-- 2. on_role_status_change() is a trigger; firing it does not check EXECUTE,
--    so the endpoint closes and the trigger is unaffected.
-- 3. Pinned search_path on interview_settings_role_matches_agency().
--
-- SPEED
--
-- 4. 79 foreign keys with no index behind them. Every delete or update of a
--    parent row (a role, a candidate, a member) scanned the whole child
--    table to check it; so did the agency_id / role_id lookups on those
--    tables. The tables are small today, so this is cheap to build now.
--
-- Idempotent: safe to re-run.

-- ── 1–2. functions ────────────────────────────────────────────────────────
revoke execute on function agency.has_role(uuid, text[]) from public, anon;
grant execute on function agency.has_role(uuid, text[]) to authenticated, service_role;
revoke execute on function agency.member_agency_ids() from public, anon;
grant execute on function agency.member_agency_ids() to authenticated, service_role;
revoke execute on function agency.on_role_status_change() from public, anon, authenticated;

-- ── 3. pinned search_path ─────────────────────────────────────────────────
alter function agency.interview_settings_role_matches_agency() set search_path = '';

-- ── 4. indexes behind foreign keys ────────────────────────────────────────
create index if not exists audit_log_actor_id_fk_idx on agency.audit_log (actor_id);
create index if not exists availability_slots_agency_id_fk_idx on agency.availability_slots (agency_id);
create index if not exists availability_slots_role_id_fk_idx on agency.availability_slots (role_id);
create index if not exists candidate_compliance_agency_id_fk_idx on agency.candidate_compliance (agency_id);
create index if not exists candidate_compliance_rtw_checked_by_fk_idx on agency.candidate_compliance (rtw_checked_by);
create index if not exists candidate_evidence_agency_id_fk_idx on agency.candidate_evidence (agency_id);
create index if not exists candidate_evidence_round_id_fk_idx on agency.candidate_evidence (round_id);
create index if not exists candidate_notices_agency_id_fk_idx on agency.candidate_notices (agency_id);
create index if not exists candidate_notices_suppressed_by_fk_idx on agency.candidate_notices (suppressed_by);
create index if not exists candidate_references_agency_id_fk_idx on agency.candidate_references (agency_id);
create index if not exists candidate_references_created_by_fk_idx on agency.candidate_references (created_by);
create index if not exists candidate_reviews_agency_id_fk_idx on agency.candidate_reviews (agency_id);
create index if not exists candidate_reviews_recruiter_id_fk_idx on agency.candidate_reviews (recruiter_id);
create index if not exists candidates_duplicate_of_fk_idx on agency.candidates (duplicate_of);
create index if not exists candidates_ingested_by_fk_idx on agency.candidates (ingested_by);
create index if not exists client_actions_agency_id_fk_idx on agency.client_actions (agency_id);
create index if not exists client_contacts_archived_by_fk_idx on agency.client_contacts (archived_by);
create index if not exists client_contacts_created_by_fk_idx on agency.client_contacts (created_by);
create index if not exists client_final_choices_agency_id_fk_idx on agency.client_final_choices (agency_id);
create index if not exists client_final_choices_by_contact_id_fk_idx on agency.client_final_choices (by_contact_id);
create index if not exists client_final_choices_candidate_id_fk_idx on agency.client_final_choices (candidate_id);
create index if not exists client_final_choices_decided_by_fk_idx on agency.client_final_choices (decided_by);
create index if not exists client_invites_accepted_by_fk_idx on agency.client_invites (accepted_by);
create index if not exists client_invites_agency_id_fk_idx on agency.client_invites (agency_id);
create index if not exists client_invites_invited_by_fk_idx on agency.client_invites (invited_by);
create index if not exists handover_items_agency_id_fk_idx on agency.handover_items (agency_id);
create index if not exists handover_items_candidate_id_fk_idx on agency.handover_items (candidate_id);
create index if not exists handover_items_resolved_by_fk_idx on agency.handover_items (resolved_by);
create index if not exists handover_packs_agency_id_fk_idx on agency.handover_packs (agency_id);
create index if not exists handover_packs_candidate_id_fk_idx on agency.handover_packs (candidate_id);
create index if not exists handover_packs_delivered_to_contact_id_fk_idx on agency.handover_packs (delivered_to_contact_id);
create index if not exists handover_packs_generated_by_fk_idx on agency.handover_packs (generated_by);
create index if not exists handover_packs_voided_by_fk_idx on agency.handover_packs (voided_by);
create index if not exists ingestion_jobs_candidate_id_fk_idx on agency.ingestion_jobs (candidate_id);
create index if not exists interview_rounds_contact_id_fk_idx on agency.interview_rounds (contact_id);
create index if not exists interview_templates_created_by_fk_idx on agency.interview_templates (created_by);
create index if not exists job_roles_created_by_fk_idx on agency.job_roles (created_by);
create index if not exists job_roles_discarded_by_fk_idx on agency.job_roles (discarded_by);
create index if not exists job_roles_owner_id_fk_idx on agency.job_roles (owner_id);
create index if not exists members_invited_by_fk_idx on agency.members (invited_by);
create index if not exists notification_prefs_set_by_fk_idx on agency.notification_prefs (set_by);
create index if not exists notification_prefs_user_id_fk_idx on agency.notification_prefs (user_id);
create index if not exists placements_candidate_id_fk_idx on agency.placements (candidate_id);
create index if not exists placements_created_by_fk_idx on agency.placements (created_by);
create index if not exists placements_voided_by_fk_idx on agency.placements (voided_by);
create index if not exists recruiter_reviews_agency_id_fk_idx on agency.recruiter_reviews (agency_id);
create index if not exists recruiter_reviews_decided_by_fk_idx on agency.recruiter_reviews (decided_by);
create index if not exists requirements_agency_id_fk_idx on agency.requirements (agency_id);
create index if not exists review_overrides_agency_id_fk_idx on agency.review_overrides (agency_id);
create index if not exists review_overrides_recruiter_id_fk_idx on agency.review_overrides (recruiter_id);
create index if not exists rights_requests_candidate_id_fk_idx on agency.rights_requests (candidate_id);
create index if not exists rights_requests_requested_by_fk_idx on agency.rights_requests (requested_by);
create index if not exists role_briefs_decided_by_fk_idx on agency.role_briefs (decided_by);
create index if not exists role_briefs_role_id_fk_idx on agency.role_briefs (role_id);
create index if not exists role_constraints_agency_id_fk_idx on agency.role_constraints (agency_id);
create index if not exists role_decision_completions_agency_id_fk_idx on agency.role_decision_completions (agency_id);
create index if not exists role_decision_completions_by_contact_id_fk_idx on agency.role_decision_completions (by_contact_id);
create index if not exists role_matching_agency_id_fk_idx on agency.role_matching (agency_id);
create index if not exists role_matching_created_by_fk_idx on agency.role_matching (created_by);
create index if not exists round_artifacts_agency_id_fk_idx on agency.round_artifacts (agency_id);
create index if not exists round_decisions_agency_id_fk_idx on agency.round_decisions (agency_id);
create index if not exists round_decisions_contact_id_fk_idx on agency.round_decisions (contact_id);
create index if not exists round_decisions_decided_by_fk_idx on agency.round_decisions (decided_by);
create index if not exists round_requests_agency_id_fk_idx on agency.round_requests (agency_id);
create index if not exists round_requests_by_contact_id_fk_idx on agency.round_requests (by_contact_id);
create index if not exists round_requests_decided_by_fk_idx on agency.round_requests (decided_by);
create index if not exists round_requests_request_id_fk_idx on agency.round_requests (request_id);
create index if not exists score_breakdowns_agency_id_fk_idx on agency.score_breakdowns (agency_id);
create index if not exists search_brief_files_uploaded_by_fk_idx on agency.search_brief_files (uploaded_by);
create index if not exists search_brief_versions_agency_id_fk_idx on agency.search_brief_versions (agency_id);
create index if not exists search_brief_versions_authored_by_fk_idx on agency.search_brief_versions (authored_by);
create index if not exists search_brief_versions_client_approved_by_fk_idx on agency.search_brief_versions (client_approved_by);
create index if not exists search_brief_versions_recruiter_approved_by_fk_idx on agency.search_brief_versions (recruiter_approved_by);
create index if not exists search_briefs_created_by_fk_idx on agency.search_briefs (created_by);
create index if not exists search_briefs_discarded_by_fk_idx on agency.search_briefs (discarded_by);
create index if not exists submission_recipients_agency_id_fk_idx on agency.submission_recipients (agency_id);
create index if not exists submission_recipients_contact_id_fk_idx on agency.submission_recipients (contact_id);
create index if not exists submissions_agency_id_fk_idx on agency.submissions (agency_id);
create index if not exists submissions_generated_by_fk_idx on agency.submissions (generated_by);
