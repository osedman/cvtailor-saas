-- Tailr for Agencies — migration 4 of 6: client contacts, submissions, portal.
--
-- The client (hiring manager / account manager at the agency's customer) is a
-- THIRD ACTOR: not an agency.members row, never sees internal state (recruiter
-- notes, rejected candidates, overrides). They receive submissions and act on
-- them through per-recipient tokenised portal links.
--
--   client_contacts        the agency's address book of client-side people
--   submissions            immutable snapshot of what was sent (per §2.7)
--   submission_recipients  one row per named recipient — individually
--                          tokenised, individually revocable (decision §5.1)
--   client_actions         Approve / Book interview / Ask a question —
--                          SIGNALS to the recruiter, never state changes on
--                          the shortlist. 'decline' does not remove anyone.
--
-- Write model: submissions, recipients and actions are audit-relevant →
-- service-role write only (audit-coupling rule, migration 3). client_contacts
-- is the agency's own address book → RLS-scoped authenticated writes.
--
-- Depends on: 20260805140000_agency_scoring.sql.
-- Idempotent: safe to re-run against staging and production.

-- ============================================================
-- CLIENT CONTACTS
-- ============================================================

create table if not exists agency.client_contacts (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agency.agencies on delete cascade,
  company     text not null,
  email       text not null,
  full_name   text not null default '',
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agency_id, email)
);

-- ============================================================
-- SUBMISSIONS
--
-- snapshot holds the fully-rendered content at generation time, so later
-- overrides never silently rewrite what a client already received. The
-- generating API route MUST recompute scores and verify inputs_hash before
-- writing this row — a stale score_breakdowns row is a refusal, not a warning.
-- ============================================================

create table if not exists agency.submissions (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  role_id        uuid not null references agency.job_roles on delete cascade,
  format         text not null check (format in ('document', 'email', 'portal')),
  snapshot       jsonb not null,
  engine_version text not null,
  generated_by   uuid references auth.users on delete set null,
  generated_at   timestamptz not null default now()
);

create index if not exists submissions_role_idx
  on agency.submissions (role_id, generated_at desc);

-- ============================================================
-- SUBMISSION RECIPIENTS
--
-- One row per named recipient. Raw tokens are shown once and never stored —
-- only sha256 hashes. Every portal action is therefore attributable to a
-- person, and one recipient can be revoked without killing the others' links.
-- contact_id is RESTRICT: a contact with live submissions cannot be deleted
-- out from under the attribution trail (erasure of a contact = service-role
-- anonymisation of the contact row, not deletion).
-- ============================================================

create table if not exists agency.submission_recipients (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references agency.agencies on delete cascade,
  submission_id   uuid not null references agency.submissions on delete cascade,
  contact_id      uuid not null references agency.client_contacts on delete restrict,
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists submission_recipients_submission_idx
  on agency.submission_recipients (submission_id);

-- ============================================================
-- CLIENT ACTIONS
--
-- Signals from the client to the recruiter. No machine path turns these into
-- shortlist state: 'decline' flags for the recruiter's attention and never
-- hides or removes a candidate (no-auto-rejection, client edition).
--
-- candidate_id is nullable + SET NULL with a denormalised candidate_ref, so
-- the business record "client approved CAN-02" survives the candidate's
-- purge/erasure — same reasoning as audit_log.candidate_id having no FK.
-- ============================================================

create table if not exists agency.client_actions (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies on delete cascade,
  recipient_id  uuid not null references agency.submission_recipients on delete cascade,
  candidate_id  uuid references agency.candidates on delete set null,
  candidate_ref text not null default '',            -- 'CAN-02', survives purge
  action        text not null
                  check (action in ('interview', 'approve', 'decline', 'question')),
  message       text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists client_actions_recipient_idx
  on agency.client_actions (recipient_id, created_at desc);
create index if not exists client_actions_candidate_idx
  on agency.client_actions (candidate_id, created_at desc);

-- ============================================================
-- UPDATED_AT
-- ============================================================

do $$ begin
  create trigger set_client_contacts_updated_at before update on agency.client_contacts
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- ROW LEVEL SECURITY
--
-- Portal viewers (clients) are anonymous to Postgres: the portal route
-- validates the raw token server-side, looks up the recipient by hash via the
-- service role, and serves ONLY the submission snapshot. No client-side
-- Postgres access exists, so no policies are needed for them.
-- ============================================================

alter table agency.client_contacts       enable row level security;
alter table agency.submissions           enable row level security;
alter table agency.submission_recipients enable row level security;
alter table agency.client_actions        enable row level security;

do $$ begin
  create policy "client_contacts_select" on agency.client_contacts for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "client_contacts_insert" on agency.client_contacts for insert
    with check (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "client_contacts_update" on agency.client_contacts for update
    using (agency.has_role(agency_id, 'owner', 'recruiter'))
    with check (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "client_contacts_delete" on agency.client_contacts for delete
    using (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "submissions_select" on agency.submissions for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "submission_recipients_select" on agency.submission_recipients for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "client_actions_select" on agency.client_actions for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

-- ============================================================
-- GRANTS
-- ============================================================

grant select, insert, update, delete on agency.client_contacts to authenticated;
grant select on agency.submissions           to authenticated;
grant select on agency.submission_recipients to authenticated;
grant select on agency.client_actions        to authenticated;

grant all on agency.client_contacts, agency.submissions,
             agency.submission_recipients, agency.client_actions to service_role;
