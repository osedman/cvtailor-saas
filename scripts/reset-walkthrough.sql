-- Reset staging to ONE walkable role, parked at the screening-call step.
--
-- Run in the SQL Editor of **tailr-staging** (pwonuqkpumgejqmotkwh). Never in
-- production: there is no agency code on `main`, so a production run would
-- either error on a missing schema or destroy something else entirely. Check
-- the project name in the URL before you press Run.
--
-- WHY A FILE AND NOT A PASTE. The last clear-out of this kind is the reason
-- ROL-2416 existed at all, and fixture state has now cost three sessions.
-- This is repeatable, reviewable, and ends with a check that proves the
-- result by effect rather than by "0 rows, seems fine".
--
-- WHAT SURVIVES, deliberately:
--   * agency.audit_log — the attribution trail. `role_id` is SET NULL on
--     role deletion BY DESIGN, so the rows stay and simply stop pointing at
--     roles that no longer exist. Deleting them would destroy the record of
--     the invite-accept and the August handovers.
--   * client_contacts (Meridian Health) and Ose's membership. Every RESTRICT
--     edge in this schema points at client_contacts, so keeping it is also
--     what makes the deletes below simple.
--
-- WHAT DOES NOT SURVIVE: seven roles and everything under them. job_roles
-- CASCADEs to candidates, and candidates CASCADE to evidence, scores,
-- reviews, compliance, identities, notices, references, rounds and
-- placements — so the single delete in step 1 does almost all of the work.
--
-- CV FILES ARE NOT IN HERE. Storage objects cannot be removed by SQL: a
-- delete against storage.objects drops the row and leaves the actual file.
-- Empty the `agency-cvs` bucket from the Supabase dashboard. 22 of its 24
-- files are ALREADY orphaned — no candidate row points at them — which means
-- no purge path can ever find them. They are real CVs. Clearing the bucket is
-- the point of this step, not housekeeping. The role kept below has no stored
-- files (its candidates carry cv_text only), so nothing needed is lost.

begin;

-- ── 1. Everything but the keeper ────────────────────────────────────────────
-- ROL-2409 is kept because it is REAL parsed data: 10 candidates, all parsed,
-- nine evidence rows each, all scored. Hand-written fixtures are how you get
-- rows that look like bugs; this keeps rows that already satisfy every
-- constraint in the schema, evidence_quote_iff_present included.
delete from agency.job_roles
where agency_id = '91b658d2-366d-4c9a-bcd3-79954be46bf0'
  and ref <> 'ROL-2409';

-- ── 2. Wind the keeper back to the screening-call step ──────────────────────
-- Everything downstream of "I have candidates and I am about to ring them".
-- Order does not matter here (all CASCADE), but each is explicit so it is
-- obvious what is being removed rather than implied by a cascade.
with keeper as (select id from agency.job_roles where ref = 'ROL-2409')
delete from agency.submissions where role_id in (select id from keeper);

with keeper as (select id from agency.job_roles where ref = 'ROL-2409')
delete from agency.handover_packs where role_id in (select id from keeper);

-- Rounds cascade to round_artifacts, round_decisions, and to the evidence
-- rows CREATED BY a round. The original CV evidence has a null round_id and
-- is untouched — which is the whole point of that column.
with keeper as (select id from agency.job_roles where ref = 'ROL-2409')
delete from agency.interview_rounds where role_id in (select id from keeper);

-- The calls themselves. Cascades review_overrides, so the recruiter's
-- overrides go with the reviews that carried them.
with keeper as (select id from agency.job_roles where ref = 'ROL-2409')
delete from agency.candidate_reviews where role_id in (select id from keeper);

with keeper as (select id from agency.job_roles where ref = 'ROL-2409')
delete from agency.recruiter_reviews where role_id in (select id from keeper);

with keeper as (select id from agency.job_roles where ref = 'ROL-2409')
delete from agency.role_decision_completions where role_id in (select id from keeper);

with keeper as (select id from agency.job_roles where ref = 'ROL-2409')
delete from agency.placements where role_id in (select id from keeper);

-- Briefs hold role_id as SET NULL, so they would linger as ghosts.
with keeper as (select id from agency.job_roles where ref = 'ROL-2409')
delete from agency.role_briefs where role_id in (select id from keeper);

-- Every offered window, across the agency. The hiring manager offers fresh
-- times during the walk; that is one of the legs under test, and seeded
-- windows are what made a contact-less role appear on the HM dashboard
-- through a side door last time.
delete from agency.availability_slots
where agency_id = '91b658d2-366d-4c9a-bcd3-79954be46bf0';

-- ── 3. The keeper, ready to be walked ───────────────────────────────────────
-- contact_id is set EXPLICITLY. Its absence on ROL-2416 is exactly why no
-- hiring manager could see that role: the whole /hiring surface is
-- contact-scoped, so a role without a contact is invisible to the client no
-- matter how complete it looks from the recruiter's desk.
update agency.job_roles
set status      = 'open',
    closed_at   = null,
    contact_id  = (select id from agency.client_contacts
                   where agency_id = '91b658d2-366d-4c9a-bcd3-79954be46bf0'
                     and company = 'Meridian Health'
                   limit 1)
where ref = 'ROL-2409';

commit;

-- ── 4. Verify by effect, not by "no errors" ─────────────────────────────────
-- Read this before you walk. Expected, exactly:
--   roles 1 · candidates 10 · requirements 9 · has_contact true
--   reviews 0 · rounds 0 · submissions 0 · packs 0 · slots 0
-- `reviews 0` is the bit that means "parked at call logging": ten people to
-- ring and not one of them rung.
select
  (select count(*) from agency.job_roles
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                  as roles,
  (select count(*) from agency.candidates c join agency.job_roles r on r.id=c.role_id
     where r.ref='ROL-2409')                                                  as candidates,
  (select count(*) from agency.candidates c join agency.job_roles r on r.id=c.role_id
     where r.ref='ROL-2409' and c.parse_status='parsed')                      as parsed,
  (select count(*) from agency.requirements q join agency.job_roles r on r.id=q.role_id
     where r.ref='ROL-2409')                                                  as requirements,
  (select count(*) from agency.candidate_evidence e
     join agency.candidates c on c.id=e.candidate_id
     join agency.job_roles r on r.id=c.role_id where r.ref='ROL-2409')        as evidence_rows,
  (select contact_id is not null from agency.job_roles where ref='ROL-2409')  as has_contact,
  (select count(*) from agency.candidate_reviews v join agency.job_roles r on r.id=v.role_id
     where r.ref='ROL-2409')                                                  as reviews,
  (select count(*) from agency.interview_rounds
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                  as rounds,
  (select count(*) from agency.submissions s join agency.job_roles r on r.id=s.role_id
     where r.agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                as submissions,
  (select count(*) from agency.handover_packs p join agency.job_roles r on r.id=p.role_id
     where r.agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                as packs,
  (select count(*) from agency.availability_slots
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                  as slots,
  (select count(*) from agency.audit_log
     where agency_id='91b658d2-366d-4c9a-bcd3-79954be46bf0')                  as audit_rows_kept;
