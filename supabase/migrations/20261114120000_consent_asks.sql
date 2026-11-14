-- Consent asks: recording and right-to-represent (14 Nov 2026, frame 47 + §E).
--
-- 1. interview_rounds.capture_requested_at / capture_reminded_at
--    The panel read 'pending' as "not asked" because asking left no trace on
--    the round. Asking now stamps capture_requested_at; the nightly sweep
--    stamps capture_reminded_at when it sends the one day-before reminder.
--
-- 2. agency.consent_links
--    A round held ONE consent token hash, so "ask again" minted a new token and
--    silently killed the link in the first email. Every link minted for a round
--    now lives here and keeps working; consent_token_hash on the round is still
--    read for links minted before this migration. Service role only — the
--    candidate's link is a capability, never readable by a recruiter session.
--
-- 3. candidates.represent_asked_at / represent_reminded_at
--    "May we put you forward?" becomes its own email at shortlist. asked_at is
--    also how the submission gate knows the candidate has been told (the ask
--    carries the Art 14 notice when it is first contact).
--
-- 4. agencies.ask_at_shortlist
--    Send the ask automatically when a candidate is shortlisted. On by default
--    (Ose, 14 Nov 2026). Written through the service role like every other
--    agency setting (20261030120200_agency_column_grants.sql).
--
-- Idempotent: safe to re-run.

alter table agency.interview_rounds
  add column if not exists capture_requested_at timestamptz,
  add column if not exists capture_reminded_at  timestamptz;

create table if not exists agency.consent_links (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agency.agencies(id) on delete cascade,
  round_id    uuid not null references agency.interview_rounds(id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now()
);
create index if not exists consent_links_round_idx on agency.consent_links (round_id);
alter table agency.consent_links enable row level security;
revoke all on agency.consent_links from public, anon, authenticated;
grant all on agency.consent_links to service_role;

alter table agency.candidates
  add column if not exists represent_asked_at    timestamptz,
  add column if not exists represent_reminded_at timestamptz;

alter table agency.agencies
  add column if not exists ask_at_shortlist boolean not null default true;
