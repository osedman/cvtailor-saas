-- Tailr for Agencies — column-level write grants on agencies and job_roles
-- (30 Oct 2026).
--
-- From the 30 Sep 2026 access audit, and the follow-up 20260822180000_role_ownership.sql
-- left open. Signed-in users held table-wide UPDATE on both tables, so the
-- REST API with the public key let them write past the app:
--   - an owner could change agency settings (retention, notice delay, notice
--     sender) without the audit row lib/agency/settings.ts writes;
--   - a recruiter could change job_roles.owner_id (commission attribution),
--     discarded_at, brief links or the closure fields without an audit row.
--
-- Every write the app makes to these columns outside the list below already
-- goes through the service role (settings, role owner, discard, brief link,
-- round requests), which this does not touch. Row security is unchanged, so
-- the lists say WHICH columns; the policies still say WHOSE rows.
--
-- Signed-in users keep exactly what the app writes with their own session:
--   agencies   — nothing.
--   job_roles  — INSERT: the fields createJobRole sends (lib/agency/db.ts);
--                UPDATE: the role editor's fields, status and the brief facts
--                (app/api/agency/roles/[roleId]/route.ts) and the JD parse
--                fills (…/parse/route.ts).
-- Triggers (updated_at, closure clock) set their own columns on NEW and need
-- no grant.
--
-- Idempotent: safe to re-run.

revoke insert, update, delete on agency.agencies from anon, authenticated;

revoke insert, update, delete on agency.job_roles from anon, authenticated;
grant insert (agency_id, ref, title, company, company_context, salary_band, location,
              seniority, jd_raw, recruiter_notes, created_by)
  on agency.job_roles to authenticated;
grant update (title, company, company_context, salary_band, location, seniority,
              jd_raw, recruiter_notes, status, planned_rounds, start_target, contact_id)
  on agency.job_roles to authenticated;
