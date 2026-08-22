-- ============================================================
-- Migration 27 · Right to work is two questions, not one
-- ============================================================
-- agency.candidate_compliance shipped with one column carrying two unrelated
-- facts:
--
--     rtw_status in ('unverified', 'verified', 'needs_sponsorship')
--
-- Those are not three points on a scale. "We have seen evidence of this
-- person's right to work" and "this person told us they would need
-- sponsorship" are independent, and the single column made them mutually
-- exclusive. A candidate on time-limited permission who needs sponsorship to
-- continue AND whose current permission was checked this morning cannot be
-- recorded truthfully: whichever value you pick, the record asserts something
-- false about them. That is a bad property in any column and a worse one in a
-- column about somebody's immigration position.
--
-- So the axes separate:
--
--     rtw_evidence     what the agency has seen           not_checked | seen
--     rtw_expires_on   when that permission runs out      date, null = none recorded
--     rtw_sponsorship  what the CANDIDATE said            not_asked | not_required
--                                                       | required | unsure
--
-- THE RENAME IS THE POINT, NOT COSMETICS. 'verified' had to go. For permanent
-- placement the agency is NOT the employer: the statutory excuse and the
-- civil penalty for illegal working belong to the client. Nothing an agency
-- records here gives the client that excuse, and the employer must still run
-- its own check before employment starts. A column called rtw_status reading
-- 'verified' invites a recruiter to tell a client the check is done, which
-- would be false and expensive. 'seen' claims exactly what happened: somebody
-- looked at something, and rtw_note says what.
--
-- rtw_evidence IS A STATE, NOT A DOCUMENT REFERENCE. It holds one of two
-- enumerated values and never free text — the constraint below is the proof,
-- and rtw_note remains the only place the method is described. This product
-- stores no identity documents at all; that is a separate compliance surface
-- with its own retention rules.
--
-- rtw_expires_on EXISTS BECAUSE THE NOTE COULD NOT BE ASKED. Time-limited
-- permission is the single most consequential thing an agency can know and
-- forget, and until now it lived — if at all — inside rtw_note as prose
-- ("expires Jan 2028"). Nothing could sort by it, warn on it or count it. A
-- date can be asked questions. It is deliberately a `date` and not a
-- timestamptz: permission expires on a day, in a jurisdiction, not at an
-- instant in the reader's timezone.
--
-- WHAT DOES NOT CHANGE. Statuses are FACTS, never conclusions: there is still
-- no 'not_eligible', because that is a decision about a person and decisions
-- belong to people. Nothing here may filter, rank, hide or order a candidate
-- — a guardrail test scans every agency source for exactly that, and now
-- scans both new columns. And the table keeps zero authenticated write
-- grants; migration 26 gave the service role the write it was missing.
--
-- NO DATA MIGRATION CLAUSE, ON PURPOSE. agency.candidate_compliance held 0
-- rows and agency.audit_log held 0 'compliance_recorded' rows when this was
-- written (both verified by count against tailr-staging, not assumed). There
-- is nothing to translate. If you are reading this while planning a backfill:
-- there was never any data, and a backfill here would invent history. Note
-- also that a backfill would have passed VACUOUSLY on staging for the same
-- reason — an empty table proves nothing about a translation.
--
-- Historical audit rows keep whatever they already say. They are append-only
-- history; rewriting them to match a new vocabulary would be forging the
-- record, which is the opposite of what an audit log is for.
--
-- Idempotent and safe to re-run: the rename is guarded on the catalog because
-- `alter table ... rename column` has no IF EXISTS.

-- --------------------------------------------------------------------------
-- 1 · rtw_status -> rtw_evidence
-- --------------------------------------------------------------------------
-- Checked before writing this, rather than hoped: pg_depend on the column
-- returns only its own default and its own check constraint — no view, no
-- materialized view, no function, no trigger, and no index other than the
-- primary key on candidate_id. The rename cannot break anything in the
-- database. It breaks TypeScript, which is the point of doing it now.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'agency'
      and table_name = 'candidate_compliance'
      and column_name = 'rtw_status'
  ) then
    alter table agency.candidate_compliance rename column rtw_status to rtw_evidence;
  end if;
end $$;

-- The constraint's DEFINITION follows a rename automatically; its NAME does
-- not. Left alone we would have candidate_compliance_rtw_status_check
-- policing a column called rtw_evidence, which is how a schema stops being
-- self-describing.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'candidate_compliance_rtw_status_check'
      and conrelid = 'agency.candidate_compliance'::regclass
  ) then
    alter table agency.candidate_compliance
      rename constraint candidate_compliance_rtw_status_check
      to candidate_compliance_rtw_evidence_check;
  end if;
end $$;

-- New vocabulary. Drop first so this is re-runnable, then re-add.
alter table agency.candidate_compliance
  drop constraint if exists candidate_compliance_rtw_evidence_check;

alter table agency.candidate_compliance
  alter column rtw_evidence set default 'not_checked';

alter table agency.candidate_compliance
  add constraint candidate_compliance_rtw_evidence_check
  check (rtw_evidence in ('not_checked', 'seen'));

-- --------------------------------------------------------------------------
-- 2 · The two new columns
-- --------------------------------------------------------------------------

alter table agency.candidate_compliance
  add column if not exists rtw_expires_on date,
  -- What the candidate SAID, recorded by whoever they said it to. Not a
  -- conclusion the agency drew, and not an assessment of anyone's status —
  -- 'unsure' is a legitimate answer and stays a legitimate answer, because
  -- the alternative is a recruiter guessing at immigration law on a
  -- candidate's behalf.
  add column if not exists rtw_sponsorship text not null default 'not_asked';

alter table agency.candidate_compliance
  drop constraint if exists candidate_compliance_rtw_sponsorship_check;

alter table agency.candidate_compliance
  add constraint candidate_compliance_rtw_sponsorship_check
  check (rtw_sponsorship in ('not_asked', 'not_required', 'required', 'unsure'));

-- An expiry date is a fact about evidence somebody looked at. Recording one
-- while claiming nothing was checked is incoherent, so the database refuses
-- it rather than leaving the application to remember.
alter table agency.candidate_compliance
  drop constraint if exists candidate_compliance_expiry_needs_evidence;

alter table agency.candidate_compliance
  add constraint candidate_compliance_expiry_needs_evidence
  check (rtw_expires_on is null or rtw_evidence = 'seen');

-- --------------------------------------------------------------------------
-- 3 · Grants unchanged, and stated so the next reader does not have to check
-- --------------------------------------------------------------------------
-- authenticated: SELECT only, no write of any kind. Adding columns does not
-- change a table-level grant, and there is deliberately no column-level
-- grant anywhere in this schema. The service role's write came in migration
-- 26. Nothing to do here — but see it written down, because the absence of a
-- grant statement in a migration is what caused migration 26 to be needed.
