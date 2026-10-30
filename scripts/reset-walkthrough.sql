-- Clear staging back to an empty desk, for a walk of the WHOLE flow from step 01.
--
-- Run in the SQL Editor of **tailr-staging** (pwonuqkpumgejqmotkwh). Never in
-- production: there is no agency code on `main`, so a production run would
-- either error on a missing schema or destroy something else entirely. Check
-- the project name in the URL before you press Run.
--
-- Supersedes the 18 Sep version of this file, which kept ROL-2409 parked at
-- the screening step. Ose is walking the entire flow now — intake, parse and
-- adding candidates included — so the roles all go and he creates the first
-- one himself. Step 01 is part of the test, not part of the setup.
--
-- WHAT SURVIVES, and why each one matters:
--   * agency.agencies + members — the desk, and Ose's access to it.
--   * agency.client_contacts — Meridian Health, and its link to Ose's user.
--     **Deleting this would remove his hiring-manager access entirely**, and
--     the /hiring surface is contact-scoped, so he could not walk the client
--     side at all. It is the one row that must not go.
--   * agency.audit_log — the attribution trail, as chosen. `role_id` is SET
--     NULL on role deletion BY DESIGN, so the rows stay and stop pointing at
--     roles that are gone.
--   * agency.notice_suppressions — the list that stops a re-uploaded person
--     being re-notified after an objection or erasure. It is a protection,
--     not fixture clutter, and clearing it would arm the exact failure it
--     exists to prevent.
--
-- WHAT GOES: every role and everything under it. job_roles CASCADEs to
-- candidates, and candidates CASCADE to evidence, scores, reviews, rounds,
-- artifacts, decisions, compliance, identities, notices, references,
-- placements, packs and submissions — so step 1 does nearly all of the work.
-- Steps 2–4 catch the rows that hold a role or candidate as SET NULL and
-- would otherwise linger as ghosts pointing at nothing.
--
-- CV FILES ARE NOT IN HERE. SQL cannot remove a storage object, only its row.
-- Empty the `agency-cvs` bucket from the Supabase dashboard. 22 of its 24
-- files are ALREADY orphaned — no candidate row points at them — which means
-- no purge path can ever reach them, and they are real CVs.

begin;

-- ── 1. Every role, and everything that hangs off one ────────────────────────
delete from agency.job_roles
where agency_id = '91b658d2-366d-4c9a-bcd3-79954be46bf0';

-- ── 2. The client's diary ───────────────────────────────────────────────────
-- Role-pinned windows went with their roles; ones offered against no role did
-- not. The hiring manager offers fresh times during the walk — and seeded
-- windows are what let a contact-less role reach the HM dashboard through a
-- side door on 18 Sep, so none should be left lying about.
delete from agency.availability_slots
where agency_id = '91b658d2-366d-4c9a-bcd3-79954be46bf0';

-- ── 3. Briefs ───────────────────────────────────────────────────────────────
-- role_id is SET NULL, so a brief outlives the role it minted and reappears in
-- the recruiter's inbox as a ghost.
delete from agency.role_briefs
where agency_id = '91b658d2-366d-4c9a-bcd3-79954be46bf0';

-- ── 4. Rights requests ──────────────────────────────────────────────────────
-- candidate_id is SET NULL for the same reason: the request survives the
-- person, which is right in production and noise on an empty desk.
delete from agency.rights_requests
where agency_id = '91b658d2-366d-4c9a-bcd3-79954be46bf0';

commit;

-- ── 5. Verify by effect, not by "no errors" ─────────────────────────────────
-- Expected, exactly:
--   roles 0 · candidates 0 · rounds 0 · slots 0 · briefs 0 · submissions 0
--   contacts 1 · contact_linked_to_user true   <- the row that must survive
--   audit_rows_kept > 0 · suppressions_kept >= 0
--
-- If contact_linked_to_user is false, STOP: the hiring-manager side cannot be
-- walked, and nothing below step 07 will be visible to the client.
select
  (select count(*) from agency.job_roles
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                 as roles,
  (select count(*) from agency.candidates c
     join agency.job_roles r on r.id=c.role_id
     where r.agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')               as candidates,
  (select count(*) from agency.interview_rounds
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                 as rounds,
  (select count(*) from agency.availability_slots
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                 as slots,
  (select count(*) from agency.role_briefs
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                 as briefs,
  (select count(*) from agency.client_contacts
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                 as contacts,
  (select bool_or(user_id is not null) from agency.client_contacts
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                 as contact_linked_to_user,
  (select count(*) from agency.audit_log
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                 as audit_rows_kept,
  (select count(*) from agency.notice_suppressions
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                 as suppressions_kept;

-- ── 6. NOT DONE HERE: the interview notice period ───────────────────────────
-- `agency.interview_settings.role_id` is NOT NULL, so there is no agency-wide
-- settings row and no default to change in data. The 24-hour minimum notice
-- is a CODE default (lib/agency/interview-rules.ts, DEFAULT_SETTINGS), and a
-- per-role row is the only thing that overrides it.
--
-- So it is set during the walk, on the hiring manager's own Set up interviews
-- screen: "Notice a candidate gets" -> "No minimum". That screen is itself
-- under test, so setting it there is a feature of the walk rather than a
-- detour around it.
--
-- Worth deciding separately: the field reads as an agency default and is not
-- one. A desk that books same-day has to set it on every role.
