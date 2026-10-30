-- Tailr for Agencies — the interview loop: briefs, availability, rounds,
-- artifacts, decisions, references, handover.
--
-- Decision record: docs/AGENCIES_SCHEMA.md §5.5 (13 Aug 2026). Companion to
-- 20260813120000_agency_client_auth (client linkage + invites + the widened
-- audit entity types this file's writers use).
--
-- Pattern for every table here, per §5.4/§5.5:
--   * agency schema, RLS enabled.
--   * Agency MEMBERS read via member_agency_ids(). No authenticated write
--     policies anywhere — writes are service-role routes that insert the
--     audit_log row in the same operation (the AUDIT LOGGED pill).
--   * Hiring managers get ZERO policies. Their reads are service-role routes
--     shaped by disclosure rules; live recruiter tables are never theirs.
--   * contact_id is RESTRICT wherever it attributes an action (who decided,
--     who received) and CASCADE only where the row is meaningless without the
--     contact (their own availability offer).
--   * candidate-linked rows CASCADE from agency.candidates: a round, its
--     artifact, its transcript evidence and its references are candidate PII
--     and purge must take them in one delete. Business records survive as
--     denormalised candidate_ref + audit rows, same as client_actions.
--
-- DPIA-in-DDL notes:
--   * Capture consent is per-round, from the candidate, with its own raw-once
--     token trail — never an HM assertion (interview_rounds.capture_consent_*).
--   * A declined consent still yields an artifact (kind = 'debrief'), so
--     "no artifact, no progression" never pressures anyone into recording.
--   * Recordings live in Storage and die at transcript verification; the
--     columns verified_at / recording_deleted_at make the sweep auditable.
--   * Referees are data subjects: candidate_references.notice_sent_at is the
--     fair-processing notice as a column, not a hope.
--
-- MANUAL STEP after applying: none for PostgREST (agency schema is already
-- exposed). The cron route gains two duties when the loop code ships:
-- recording sweep (verified, not yet deleted → delete blob, stamp) and
-- availability-slot expiry.
--
-- CODE-CHANGE NOTE (zero-breakage purge design): §5.5 said "extend
-- purge_candidate() to return recording paths". Changing that function's
-- return shape would break the DEPLOYED cron/rights code in the window
-- between migration-apply and deploy (migrations run first, by rule). So:
-- purge_candidate is UNTOUCHED; a read-only collector
-- candidate_recording_paths() is added for direct-erasure callers, and
-- purge_expired() is recreated with an ADDED recording_paths column — old
-- JS ignores the extra key, new JS reads it. Same single erasure path.
--
-- Idempotent: safe to re-run against staging and production.

-- ============================================================
-- ROLE BRIEFS (the HM's post — a pre-role object)
--
-- Decided §5.5: a brief is NOT a job_role. The recruiter converts it —
-- accepting mints the ROL ref then (service-role next_role_ref) and stamps
-- role_id; declining is allowed and audited (no-auto-rejection protects
-- candidates, not briefs). role_id is set null so deleting a role never
-- rewrites the history of what the client asked for.
-- ============================================================

create table if not exists agency.role_briefs (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  contact_id     uuid not null references agency.client_contacts on delete restrict,
  role_title     text not null,
  team           text not null default '',
  mission        text not null default '',
  must_haves     text not null default '',
  nice_to_haves  text not null default '',
  comp           text not null default '',
  location       text not null default '',
  status         text not null default 'submitted'
                   check (status in ('submitted', 'accepted', 'declined')),
  role_id        uuid references agency.job_roles on delete set null,
  decided_by     uuid references auth.users on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists role_briefs_agency_status_idx
  on agency.role_briefs (agency_id, status, created_at desc);
create index if not exists role_briefs_contact_idx
  on agency.role_briefs (contact_id, created_at desc);

-- ============================================================
-- AVAILABILITY SLOTS
--
-- "Booked" is deliberately NOT a status column — a slot is booked iff an
-- interview round references it, enforced by the partial unique index on
-- interview_rounds.slot_id below. No state to drift.
-- ============================================================

create table if not exists agency.availability_slots (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agency.agencies on delete cascade,
  contact_id  uuid not null references agency.client_contacts on delete cascade,
  role_id     uuid references agency.job_roles on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint availability_slot_bounds check (ends_at > starts_at)
);

create index if not exists availability_slots_contact_idx
  on agency.availability_slots (contact_id, starts_at)
  where revoked_at is null;

-- ============================================================
-- INTERVIEW ROUNDS
--
-- A round is candidate PII (its artifact carries their spoken words), so
-- candidate_id CASCADES — purge takes the round, the artifact and the
-- transcript evidence in one delete. contact_id is RESTRICT: the HM who ran
-- an interview stays attributable for as long as the round exists.
--
-- Consent columns: capture consent is requested from the CANDIDATE when the
-- round is booked, recorded against a raw-once token (consent_token_hash),
-- never asserted by the HM. 'declined'/'withdrawn' routes the round to a
-- debrief artifact — the round still counts, marked by its source.
-- ============================================================

create table if not exists agency.interview_rounds (
  id                      uuid primary key default gen_random_uuid(),
  agency_id               uuid not null references agency.agencies on delete cascade,
  role_id                 uuid not null references agency.job_roles on delete cascade,
  candidate_id            uuid not null references agency.candidates on delete cascade,
  contact_id              uuid not null references agency.client_contacts on delete restrict,
  round_number            integer not null check (round_number between 1 and 12),
  slot_id                 uuid references agency.availability_slots on delete set null,
  scheduled_at            timestamptz,
  duration_minutes        integer not null default 45
                            check (duration_minutes between 5 and 240),
  meeting_url             text not null default '',
  status                  text not null default 'scheduled'
                            check (status in ('scheduled', 'completed', 'cancelled')),
  capture_consent_status  text not null default 'pending'
                            check (capture_consent_status in
                                   ('pending', 'granted', 'declined', 'withdrawn')),
  capture_consent_at      timestamptz,
  consent_token_hash      text unique,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (role_id, candidate_id, round_number)
);

create index if not exists interview_rounds_role_idx
  on agency.interview_rounds (role_id, scheduled_at);
create index if not exists interview_rounds_candidate_idx
  on agency.interview_rounds (candidate_id, round_number);

-- One round per slot: this partial unique index IS the booking mechanism.
create unique index if not exists interview_rounds_slot_booking_idx
  on agency.interview_rounds (slot_id) where slot_id is not null;

-- ============================================================
-- ROUND ARTIFACTS
--
-- Exactly one per round once the round happened. kind = 'transcript' is the
-- rich default; kind = 'debrief' is the structured HM form when capture was
-- declined — a KIND, not a missing row, so "no artifact, no progression"
-- stays enforceable without pressuring consent.
--
-- Decided §5.5: transcript content lives in Postgres jsonb (~50KB per 45min;
-- purge = row cascade, atomic and audit-coupled). The RECORDING lives in
-- Storage and is deleted once the transcript is verified — the cron sweep is
-- "verified_at is not null and recording_deleted_at is null and
-- recording_path is not null" → delete blob → stamp recording_deleted_at.
-- ============================================================

create table if not exists agency.round_artifacts (
  id                    uuid primary key default gen_random_uuid(),
  agency_id             uuid not null references agency.agencies on delete cascade,
  round_id              uuid not null unique references agency.interview_rounds on delete cascade,
  kind                  text not null check (kind in ('transcript', 'debrief')),
  content               jsonb not null default '{}'::jsonb,
  recording_path        text,
  verified_at           timestamptz,
  recording_deleted_at  timestamptz,
  engine_version        text not null default '',
  created_at            timestamptz not null default now(),
  -- a debrief never has a recording to forget
  constraint artifact_recording_iff_transcript
    check (kind = 'transcript' or recording_path is null)
);

create index if not exists round_artifacts_sweep_idx
  on agency.round_artifacts (verified_at)
  where recording_path is not null and recording_deleted_at is null;

-- ============================================================
-- TRANSCRIPT EVIDENCE — reuse, not rebuild (§5.5)
--
-- candidate_evidence stays one row per candidate × requirement: the CURRENT
-- state, which is what scoring reads. round_id marks which round last proved
-- a row; the per-layer history the stratigraphy view renders comes from
-- audit_log from/to values plus the artifact content — not from extra
-- evidence rows. evidence_quote_iff_present polices transcript-derived
-- claims exactly as it polices CV claims: unbacked → missing, no quote → no
-- strength.
-- ============================================================

-- CASCADE, not set null: evidence sourced from a round cannot outlive it
-- (set null would trip evidence_round_iff_interview below). In practice a
-- completed round is never app-deleted — audit ethos — so this fires only
-- under candidate purge, where the candidate cascade takes the row anyway.
alter table agency.candidate_evidence
  add column if not exists round_id uuid references agency.interview_rounds on delete cascade;

alter table agency.candidate_evidence
  drop constraint if exists candidate_evidence_origin_check;

do $$ begin
  alter table agency.candidate_evidence
    add constraint candidate_evidence_origin_check
      check (origin in ('cv', 'tailr_profile', 'interview'));
exception when duplicate_object then null; end $$;

-- interview evidence must say which round it came from; other origins must not
do $$ begin
  alter table agency.candidate_evidence
    add constraint evidence_round_iff_interview
      check ((origin = 'interview') = (round_id is not null));
exception when duplicate_object then null; end $$;

-- ============================================================
-- ROUND DECISIONS (the teeth — append-only)
--
-- Decided §5.5: reversal INSERTS a new row; the latest row per round wins and
-- the table is its own history, like review_overrides. There is no update
-- path by construction (no update policy exists, service routes only insert).
--
-- No value in this table ever touches candidate visibility: decline is a
-- state for the ROUND, never a removal of the person. candidate_ref survives
-- purge; round_id cascades away with the candidate while the audit row keeps
-- the business record.
-- ============================================================

create table if not exists agency.round_decisions (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  round_id       uuid not null references agency.interview_rounds on delete cascade,
  contact_id     uuid not null references agency.client_contacts on delete restrict,
  decided_by     uuid references auth.users on delete set null,
  decision       text not null check (decision in ('advance', 'hold', 'decline')),
  note           text not null default '',
  candidate_ref  text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists round_decisions_round_idx
  on agency.round_decisions (round_id, created_at desc);

-- ============================================================
-- CANDIDATE REFERENCES
--
-- Recruiter-side collection. Referees are third-party data subjects: the
-- fair-processing notice is a stamped column, the request goes out on a
-- raw-once token, and their words land attributed and verbatim in content —
-- never paraphrased. Everything here cascades with the candidate's purge.
-- ============================================================

create table if not exists agency.candidate_references (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references agency.agencies on delete cascade,
  candidate_id        uuid not null references agency.candidates on delete cascade,
  candidate_ref       text not null default '',
  referee_name        text not null,
  referee_email       text not null,
  relationship        text not null default '',
  request_token_hash  text unique,
  notice_sent_at      timestamptz,
  status              text not null default 'drafted'
                        check (status in ('drafted', 'requested', 'received',
                                          'chasing', 'declined')),
  content             jsonb not null default '{}'::jsonb,
  received_at         timestamptz,
  created_by          uuid references auth.users on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists candidate_references_candidate_idx
  on agency.candidate_references (candidate_id, created_at desc);

-- ============================================================
-- HANDOVER PACKS
--
-- Submission discipline, end-of-loop edition: the snapshot is frozen at
-- generation (the generating route recomputes scores and REFUSES on a stale
-- inputs_hash, exactly like submissions), and what was handed to the client
-- never silently changes afterwards. Decided §5.5: delivery is in-app to the
-- deciding contact only — no recipient tokens in v1 (buildable later without
-- rework). candidate_id is set null + candidate_ref denormalised: the pack
-- outlives the candidate's purge as a business record whose PII lives only
-- inside the snapshot the client already lawfully holds — and purge of the
-- CANDIDATE deliberately does not claw back what was already delivered.
-- ============================================================

create table if not exists agency.handover_packs (
  id                        uuid primary key default gen_random_uuid(),
  agency_id                 uuid not null references agency.agencies on delete cascade,
  role_id                   uuid not null references agency.job_roles on delete cascade,
  candidate_id              uuid references agency.candidates on delete set null,
  candidate_ref             text not null default '',
  snapshot                  jsonb not null,
  engine_version            text not null,
  generated_by              uuid references auth.users on delete set null,
  delivered_to_contact_id   uuid references agency.client_contacts on delete restrict,
  generated_at              timestamptz not null default now(),
  delivered_at              timestamptz
);

create index if not exists handover_packs_role_idx
  on agency.handover_packs (role_id, generated_at desc);

-- ============================================================
-- PURGE: recordings join the erasure path (zero-breakage design)
--
-- purge_candidate(uuid, text) is deliberately UNTOUCHED — see the header.
-- Direct-erasure callers (rights route) call the collector BEFORE purging;
-- purge_expired collects per candidate inside its loop, before the delete.
-- ============================================================

create or replace function agency.candidate_recording_paths(p_candidate uuid)
returns text[]
language sql
stable
security definer
set search_path = agency, public
as $$
  select coalesce(array_agg(ra.recording_path), '{}')
    from agency.round_artifacts ra
    join agency.interview_rounds ir on ir.id = ra.round_id
   where ir.candidate_id = p_candidate
     and ra.recording_path is not null
     and ra.recording_deleted_at is null;
$$;

revoke execute on function agency.candidate_recording_paths(uuid) from public, authenticated;
grant execute on function agency.candidate_recording_paths(uuid) to service_role;

-- Recreated with an ADDED column (drop required: OUT columns cannot change
-- under create or replace). Old deployed cron code reads the first three
-- fields and ignores the new key — no window breakage between apply and
-- deploy. New code deletes recording blobs alongside the CV blob.
drop function if exists agency.purge_expired();

create function agency.purge_expired()
returns table (candidate_id uuid, ref text, storage_path text, recording_paths text[])
language plpgsql
volatile
security definer
set search_path = agency, public
as $$
declare
  r record;
begin
  for r in
    select c.id, c.ref
      from agency.candidates c
     where c.retention_expires_at is not null
       and c.retention_expires_at <= now()
  loop
    candidate_id := r.id;
    ref := r.ref;
    -- collect BEFORE purge_candidate cascades the rows away
    recording_paths := agency.candidate_recording_paths(r.id);
    storage_path := agency.purge_candidate(r.id, 'retention_expired');
    return next;
  end loop;
end;
$$;

revoke execute on function agency.purge_expired() from public, authenticated;
grant execute on function agency.purge_expired() to service_role;

-- ============================================================
-- UPDATED_AT
-- ============================================================

do $$ begin
  create trigger set_role_briefs_updated_at before update on agency.role_briefs
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_interview_rounds_updated_at before update on agency.interview_rounds
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_candidate_references_updated_at before update on agency.candidate_references
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- ROW LEVEL SECURITY
--
-- Members read their agency's loop. No authenticated write policies on any
-- table here (every write is audit-coupled, service-role only). HMs: zero
-- policies, by decision — their access is the API, not the database.
-- ============================================================

alter table agency.role_briefs          enable row level security;
alter table agency.availability_slots   enable row level security;
alter table agency.interview_rounds     enable row level security;
alter table agency.round_artifacts      enable row level security;
alter table agency.round_decisions      enable row level security;
alter table agency.candidate_references enable row level security;
alter table agency.handover_packs       enable row level security;

do $$ begin
  create policy "role_briefs_select" on agency.role_briefs for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "availability_slots_select" on agency.availability_slots for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "interview_rounds_select" on agency.interview_rounds for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "round_artifacts_select" on agency.round_artifacts for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "round_decisions_select" on agency.round_decisions for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "candidate_references_select" on agency.candidate_references for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "handover_packs_select" on agency.handover_packs for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

grant select on agency.role_briefs,
                agency.availability_slots,
                agency.interview_rounds,
                agency.round_artifacts,
                agency.round_decisions,
                agency.candidate_references,
                agency.handover_packs
  to authenticated;

grant all on agency.role_briefs,
             agency.availability_slots,
             agency.interview_rounds,
             agency.round_artifacts,
             agency.round_decisions,
             agency.candidate_references,
             agency.handover_packs
  to service_role;
