-- Tailr for Agencies — migration 5 of 6: retention, purge, notices, rights.
--
-- The migration that makes holding third-party PII defensible. Four parts:
--
--   retention   role close stamps retention_expires_at on every candidate
--               (agencies.retention_days, default 180); reopen clears it.
--   purge       agency.purge_candidate() / agency.purge_expired() — the single
--               erasure implementation shared by retention expiry and erasure
--               requests. Deletes the candidate row (cascades take evidence,
--               reviews, scores, identities, notices) after writing an
--               audit_log 'erased' row carrying {name, ref, overall} — the
--               only place those survive.
--   notices     Art 14 candidate notice state (§5.2b): scheduled at ingestion
--               for now() + notice_delay_days (default 7, HARD-CAPPED at 28 —
--               the auto-fire is not switch-off-able, and the cap keeps every
--               configuration inside the Art 14 one-month outer bound).
--               Suppression list keyed on identity_hash so a re-upload after
--               an objection/erasure does not re-notify or re-process.
--   rights      rights_requests generalises erasure to
--               access/rectification/erasure/objection. candidate_id is
--               nullable SET NULL with a denormalised candidate_ref — the
--               record of an erasure request must survive the erasure it
--               causes.
--
-- CRON WIRING (app code, not SQL): storage objects cannot be safely deleted
-- from SQL (direct DML on storage.objects orphans the blob), so the purge is
-- driven by an app cron route that (1) calls agency.purge_expired(), (2)
-- deletes the returned cv storage paths via the Storage API, (3) sends due
-- notices (status='scheduled', scheduled_for <= now()) via Resend and marks
-- them sent. Until that route ships, NO REAL CANDIDATE DATA may be ingested —
-- staging fixtures only.
--
-- Depends on: 20260805150000_agency_submissions.sql.
-- Idempotent: safe to re-run against staging and production.

-- ============================================================
-- AGENCY NOTICE SETTINGS
-- ============================================================

alter table agency.agencies
  add column if not exists notice_delay_days integer not null default 7,
  add column if not exists notice_from_name  text not null default '',
  add column if not exists notice_reply_to   text not null default '';

do $$ begin
  alter table agency.agencies
    add constraint notice_delay_within_art14
      check (notice_delay_days between 0 and 28);
exception when duplicate_object then null; end $$;

-- ============================================================
-- RIGHTS REQUESTS
-- ============================================================

create table if not exists agency.rights_requests (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies on delete cascade,
  candidate_id  uuid references agency.candidates on delete set null,
  candidate_ref text not null default '',            -- survives the purge
  kind          text not null
                  check (kind in ('access', 'rectification', 'erasure', 'objection')),
  channel       text not null default 'recruiter'
                  check (channel in ('recruiter', 'candidate', 'regulator')),
  status        text not null default 'pending'
                  check (status in ('pending', 'completed', 'rejected')),
  requested_by  uuid references auth.users on delete set null,
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz,
  note          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists rights_requests_agency_idx
  on agency.rights_requests (agency_id, status, requested_at desc);

-- ============================================================
-- CANDIDATE NOTICES
--
-- One row per candidate, created at ingestion with
-- scheduled_for = ingested_at + agencies.notice_delay_days. In the window the
-- recruiter may send early, add a personal line, or record
-- 'already_informed' (suppresses the send, writes the audit row, puts the
-- assertion on the agency). If nothing happens, the cron fires it. There is
-- no state that turns the auto-fire off.
-- ============================================================

create table if not exists agency.candidate_notices (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references agency.agencies on delete cascade,
  candidate_id      uuid not null references agency.candidates on delete cascade unique,
  channel           text not null default 'email' check (channel in ('email')),
  status            text not null default 'scheduled'
                      check (status in ('scheduled', 'sent', 'suppressed', 'bounced', 'failed')),
  scheduled_for     timestamptz not null,
  sent_at           timestamptz,
  personal_note     text not null default '',
  suppressed_reason text
                      check (suppressed_reason in ('already_informed', 'no_contact_details', 'suppression_list')),
  suppressed_by     uuid references auth.users on delete set null,
  template_version  text not null default 'v1',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint suppressed_iff_reason
    check ((status = 'suppressed') = (suppressed_reason is not null))
);

create index if not exists candidate_notices_due_idx
  on agency.candidate_notices (scheduled_for)
  where status = 'scheduled';

-- ============================================================
-- NOTICE SUPPRESSIONS
--
-- Keyed on the same identity_hash as candidate_identities, so suppression
-- survives the purge of the candidate rows themselves. Service-role only —
-- contains identity hashes, same lockdown as candidate_identities.
-- ============================================================

create table if not exists agency.notice_suppressions (
  agency_id     uuid not null references agency.agencies on delete cascade,
  identity_hash text not null,
  reason        text not null,
  created_at    timestamptz not null default now(),
  primary key (agency_id, identity_hash)
);

-- ============================================================
-- RETENTION: role-close trigger
-- ============================================================

create or replace function agency.on_role_status_change()
returns trigger
language plpgsql
security definer
set search_path = agency, public
as $$
declare
  v_days integer;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    if new.closed_at is null then
      new.closed_at := now();
    end if;
    select retention_days into v_days from agency.agencies where id = new.agency_id;
    update agency.candidates c
       set retention_expires_at = new.closed_at + make_interval(days => v_days)
     where c.role_id = new.id;
  elsif old.status = 'closed' and new.status <> 'closed' then
    new.closed_at := null;
    update agency.candidates c
       set retention_expires_at = null
     where c.role_id = new.id;
  end if;
  return new;
end;
$$;

do $$ begin
  create trigger job_roles_status_retention
    before update of status on agency.job_roles
    for each row execute procedure agency.on_role_status_change();
exception when duplicate_object then null; end $$;

-- ============================================================
-- PURGE
-- ============================================================

-- The single erasure implementation. Returns the cv_storage_path (null if
-- none) so the calling cron/route can delete the file via the Storage API.
create or replace function agency.purge_candidate(p_candidate uuid, p_reason text)
returns text
language plpgsql
volatile
security definer
set search_path = agency, public
as $$
declare
  v record;
begin
  select c.*, (select overall from agency.score_breakdowns sb where sb.candidate_id = c.id) as overall
    into v
    from agency.candidates c
   where c.id = p_candidate;

  if not found then
    return null;
  end if;

  -- The only place name/ref/score survive. The log holds the record that this
  -- person was considered and how it concluded — never CV content.
  insert into agency.audit_log
    (agency_id, role_id, candidate_id, entity_type, entity_ref, action, from_value, reason)
  values
    (v.agency_id, v.role_id, p_candidate, 'candidate', v.ref, 'erased',
     jsonb_build_object('name', v.full_name, 'ref', v.ref, 'overall', v.overall),
     p_reason);

  -- Erasure/objection also suppresses future notices + re-processing for this
  -- identity at this agency. Retention expiry does not: a fresh upload for a
  -- new role is legitimate new processing.
  if p_reason in ('erasure_request', 'objection') then
    insert into agency.notice_suppressions (agency_id, identity_hash, reason)
    select ci.agency_id, ci.identity_hash, p_reason
      from agency.candidate_identities ci
     where ci.candidate_id = p_candidate
    on conflict (agency_id, identity_hash) do nothing;
  end if;

  -- Cascades: identities, evidence, reviews (+ overrides), recruiter_reviews,
  -- score_breakdowns, ingestion_jobs, candidate_notices. client_actions and
  -- rights_requests keep their rows with candidate_id nulled and the
  -- denormalised ref intact.
  delete from agency.candidates where id = p_candidate;

  return v.cv_storage_path;
end;
$$;

create or replace function agency.purge_expired()
returns table (candidate_id uuid, ref text, storage_path text)
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
    storage_path := agency.purge_candidate(r.id, 'retention_expired');
    return next;
  end loop;
end;
$$;

revoke execute on function agency.purge_candidate(uuid, text) from public, authenticated;
revoke execute on function agency.purge_expired() from public, authenticated;
grant execute on function agency.purge_candidate(uuid, text) to service_role;
grant execute on function agency.purge_expired() to service_role;

-- ============================================================
-- UPDATED_AT
-- ============================================================

do $$ begin
  create trigger set_rights_requests_updated_at before update on agency.rights_requests
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_candidate_notices_updated_at before update on agency.candidate_notices
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- ROW LEVEL SECURITY
--
-- rights_requests + candidate_notices: members read (the UI shows notice
-- window state and the rights queue); writes service-role only per the
-- audit-coupling rule ('notice' and 'rights_request' are audit entities).
-- notice_suppressions: no policies, no authenticated grant — identity hashes.
-- ============================================================

alter table agency.rights_requests     enable row level security;
alter table agency.candidate_notices   enable row level security;
alter table agency.notice_suppressions enable row level security;

do $$ begin
  create policy "rights_requests_select" on agency.rights_requests for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "candidate_notices_select" on agency.candidate_notices for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

-- ============================================================
-- GRANTS
-- ============================================================

grant select on agency.rights_requests   to authenticated;
grant select on agency.candidate_notices to authenticated;
-- notice_suppressions: no authenticated grant at all.
grant all on agency.rights_requests, agency.candidate_notices,
             agency.notice_suppressions to service_role;
