-- UAT round, items 14 and 20 — Figma frame 37, approved 2 Oct 2026.
--
-- 1. agency.screening_questions — questions the recruiter WRITES. Two scopes
--    in one table: candidate_id null means "every candidate on this role"
--    (on every call's list automatically, Ose 2 Oct); candidate_id set means
--    "added on this call". The key is what candidate_reviews.call_answers is
--    keyed by, so it fits that column's 10-character key cap: 'Q' + 8 hex.
--    Removing is a stamp, never a delete: an answer already given must still
--    be readable against its question.
--
-- 2. candidate_reviews.call_trail — the call record. Append-only events
--    written by the review route (question added, answered, removed), so the
--    recruiter can see what was actually asked. Recruiter-only: no client
--    surface reads it (Ose 2 Oct).
--
-- 3. interview_settings.location_room / arrival_notes — an in-person
--    interview's floor or room and its reception / check-in instructions.
--    location_detail stays the address.
--
-- Additive only. Staging first; production waits for Ose.

create table if not exists agency.screening_questions (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies on delete cascade,
  role_id       uuid not null references agency.job_roles on delete cascade,
  -- Null: every candidate on the role. Set: this one call. A purged
  -- candidate takes their call's questions with them.
  candidate_id  uuid references agency.candidates on delete cascade,
  key           text not null check (key ~ '^Q[0-9a-f]{8}$'),
  text          text not null check (length(btrim(text)) between 1 and 300),
  added_by      uuid references auth.users on delete set null,
  created_at    timestamptz not null default now(),
  removed_at    timestamptz,
  removed_by    uuid references auth.users on delete set null,
  unique (role_id, key)
);

comment on table agency.screening_questions is
  'Screening questions the recruiter writes: for every candidate on a role (candidate_id null) or for one call. Keys match candidate_reviews.call_answers.';

create index if not exists screening_questions_role_live_idx
  on agency.screening_questions (role_id) where removed_at is null;
create index if not exists screening_questions_candidate_idx
  on agency.screening_questions (candidate_id) where candidate_id is not null;
create index if not exists screening_questions_agency_idx
  on agency.screening_questions (agency_id);
create index if not exists screening_questions_added_by_idx
  on agency.screening_questions (added_by);
create index if not exists screening_questions_removed_by_idx
  on agency.screening_questions (removed_by);

alter table agency.screening_questions enable row level security;

drop policy if exists screening_questions_select on agency.screening_questions;
create policy screening_questions_select on agency.screening_questions
  for select using (agency_id in (select agency.member_agency_ids()));

-- Audit-coupled: the browser reads, the service role writes (in the route,
-- beside the audit row).
grant select on agency.screening_questions to authenticated;
grant select, insert, update, delete on agency.screening_questions to service_role;

alter table agency.candidate_reviews
  add column if not exists call_trail jsonb not null default '[]'::jsonb;
alter table agency.candidate_reviews
  drop constraint if exists candidate_reviews_call_trail_is_array;
alter table agency.candidate_reviews
  add constraint candidate_reviews_call_trail_is_array check (jsonb_typeof(call_trail) = 'array');

alter table agency.interview_settings
  add column if not exists location_room text not null default '',
  add column if not exists arrival_notes text not null default '';
alter table agency.interview_settings
  drop constraint if exists interview_settings_venue_lengths;
alter table agency.interview_settings
  add constraint interview_settings_venue_lengths
  check (length(location_room) <= 120 and length(arrival_notes) <= 600);
