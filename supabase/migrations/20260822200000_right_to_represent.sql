-- Tailr — migration 34: right to represent.
--
-- A candidate who APPLIED consented explicitly — the manifest they confirmed
-- is the record, written in the same transaction as their candidate row. An
-- UPLOADED candidate never agreed to anything: the agency notices them
-- (Art 14) and then represents them anyway. When two agencies claim one
-- placement, the one holding the candidate's dated agreement wins the
-- contingent fee — and the candidate holding the pen is also simply the
-- honest version of this relationship.
--
-- Columns on candidates, not a table: candidate rows are already per
-- (agency, role, person), so per-role-never-blanket is the schema's own
-- grain. 'withdrawn' is distinct from 'declined' on purpose — a revoked yes
-- and a plain no are different facts, and the audit trail must be able to
-- say which happened.
--
-- THE ANSWER GATES ONE ACT ONLY: submission to a client. It never filters,
-- ranks or hides anyone (guardrail test, same mechanism as compliance), and
-- declining is not withdrawal from consideration.
--
-- Backfill: matched candidates agreed AT APPLICATION — the apply manifest is
-- their agreement, so represent_answered_at is their ingested_at, and the
-- copy version names the manifest rather than pretending they saw the
-- doorway ask.

alter table agency.candidates
  add column if not exists represent_status text not null default 'unanswered'
    check (represent_status in ('unanswered', 'agreed', 'declined', 'withdrawn')),
  add column if not exists represent_answered_at timestamptz,
  add column if not exists represent_copy_version text;

comment on column agency.candidates.represent_status is
  'Right to represent, for THIS role only. unanswered is not yes: submission of an unanswered candidate needs a loud audited override; a declined or withdrawn candidate cannot be submitted at all. Never filters, ranks or hides anyone.';

update agency.candidates
   set represent_status = 'agreed',
       represent_answered_at = ingested_at,
       represent_copy_version = 'apply-manifest'
 where source = 'matched'
   and represent_status = 'unanswered';
