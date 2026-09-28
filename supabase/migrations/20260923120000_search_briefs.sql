-- ============================================================
-- THE CLIENT BRIEF, AGAIN — this time as the terms of a search
-- 23 September 2026 · Figma frame 25, signed off
--
-- The first brief (agency.role_briefs, 13 Aug) was an inbox: the client
-- wrote a job description, the recruiter accepted it, a role was minted. It
-- was removed on 22 Sep because the client had no door to it. The table is
-- KEPT — roles minted from it still show its JD — and is not touched here.
--
-- This one is a different object. It says HOW the search runs — rounds,
-- decision turnaround, what the client is shown, feedback, money, ownership,
-- offer authority — and it is agreed by both sides before a role runs on it.
--
-- TWO TABLES, ONE RULE:
--
--   search_briefs           — the thread: agency, client contact, title,
--                             and which version is current.
--   search_brief_versions   — one row per version, each carrying the WHOLE
--                             config and its own two signatures. Approved
--                             means recruiter_approved_at AND
--                             client_approved_at are both set ON THE SAME
--                             ROW. Nothing else counts. Amending is a new
--                             row signed by its author only.
--
-- A role connects to an approved version and COPIES its config
-- (job_roles.brief_config), stamped with the version. Nothing on a role
-- reads a brief live: a brief re-opened to v3 must never change a running
-- role by itself. Divergence between the copy and the role's current
-- settings is computed on read, so no flag can go stale.
--
-- AUDIT-COUPLED. Approving is signing and amending clears the other side's
-- signature, so there are NO authenticated write grants: every write is a
-- service-role route with an audit row in the same operation. Recruiters
-- read through the same routes; hiring managers hold zero grants (§5.4).
-- ============================================================

create table if not exists agency.search_briefs (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references agency.agencies on delete cascade,
  -- The client-side person the brief is sent to and who signs for the client.
  contact_id       uuid not null references agency.client_contacts on delete restrict,
  title            text not null default '',
  current_version  int  not null default 1 check (current_version >= 1),
  created_by       uuid references auth.users on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Soft-deleted drafts only: a brief that has been SENT is a record of what
  -- was proposed to a client and stays. The route refuses otherwise.
  discarded_at     timestamptz,
  discarded_by     uuid references auth.users on delete set null
);

create index if not exists search_briefs_agency_idx
  on agency.search_briefs (agency_id, created_at desc) where discarded_at is null;
create index if not exists search_briefs_contact_idx
  on agency.search_briefs (contact_id, created_at desc) where discarded_at is null;

create table if not exists agency.search_brief_versions (
  id                      uuid primary key default gen_random_uuid(),
  brief_id                uuid not null references agency.search_briefs on delete cascade,
  agency_id               uuid not null references agency.agencies on delete cascade,
  version                 int  not null check (version >= 1),
  -- The whole config, normalised by lib/agency/brief-options.ts before it
  -- lands. Never partially updated: a new version is a new row.
  config                  jsonb not null,
  authored_by_side        text not null check (authored_by_side in ('recruiter', 'client')),
  authored_by             uuid references auth.users on delete set null,
  -- Which top-level keys differ from the previous version. Computed by the
  -- route, stored so the other side's screen can mark exactly those lines
  -- without re-diffing history.
  changed_keys            text[] not null default '{}',
  -- A version exists from the moment it is written; it is SENT when it
  -- leaves its author's side. A draft has sent_at null.
  sent_at                 timestamptz,
  recruiter_approved_at   timestamptz,
  recruiter_approved_by   uuid references auth.users on delete set null,
  client_approved_at      timestamptz,
  client_approved_by      uuid references auth.users on delete set null,
  created_at              timestamptz not null default now(),
  unique (brief_id, version)
);

-- Approving is signing THIS version; a signature cannot exist on an unsent
-- draft, because nobody but its author has read it.
alter table agency.search_brief_versions
  drop constraint if exists search_brief_versions_signed_means_sent;
alter table agency.search_brief_versions
  add constraint search_brief_versions_signed_means_sent check (
    sent_at is not null
    or (recruiter_approved_at is null and client_approved_at is null)
  );

create index if not exists search_brief_versions_brief_idx
  on agency.search_brief_versions (brief_id, version desc);

-- ------------------------------------------------------------
-- The role's copy
-- ------------------------------------------------------------
alter table agency.job_roles
  add column if not exists brief_id       uuid references agency.search_briefs on delete set null,
  add column if not exists brief_version  int,
  add column if not exists brief_config   jsonb,
  add column if not exists brief_connected_at timestamptz;

-- A role either carries a whole connection or none of it. Half a connection
-- — an id with no copied config — is the state the divergence check cannot
-- reason about, so it is refused here.
alter table agency.job_roles
  drop constraint if exists job_roles_brief_connection_whole;
alter table agency.job_roles
  add constraint job_roles_brief_connection_whole check (
    (brief_id is null and brief_version is null and brief_config is null and brief_connected_at is null)
    or
    (brief_id is not null and brief_version is not null and brief_config is not null and brief_connected_at is not null)
  );

create index if not exists job_roles_brief_idx
  on agency.job_roles (brief_id) where brief_id is not null;

-- ------------------------------------------------------------
-- RLS + GRANTS
--
-- No authenticated write grants: audit-coupled. Recruiters may SELECT their
-- own agency's briefs (the list screen reads through a route anyway, but the
-- policy is the honest statement of who may see what). Hiring managers hold
-- nothing; their read is a disclosure-shaped service-role route scoped to
-- their own contact ids.
--
-- The explicit service_role grant is not optional — `grant all on all tables
-- in schema agency` was a point-in-time grant (22 Aug 2026) and three tables
-- shipped that the role that writes them could not write. Verified by
-- attempting the write as the role, not by reading this file.
-- ------------------------------------------------------------
alter table agency.search_briefs enable row level security;
alter table agency.search_brief_versions enable row level security;

drop policy if exists search_briefs_select on agency.search_briefs;
create policy search_briefs_select on agency.search_briefs
  for select using (agency_id in (select agency.member_agency_ids()));

drop policy if exists search_brief_versions_select on agency.search_brief_versions;
create policy search_brief_versions_select on agency.search_brief_versions
  for select using (agency_id in (select agency.member_agency_ids()));

grant select on agency.search_briefs to authenticated;
grant select on agency.search_brief_versions to authenticated;
grant select, insert, update, delete on agency.search_briefs to service_role;
grant select, insert, update, delete on agency.search_brief_versions to service_role;

-- ------------------------------------------------------------
-- Audit entity type
--
-- 'brief' already exists in the audit_log check (it was added for the first
-- brief and kept when that flow went). Nothing to widen.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Notification preferences: the two AGENCY-bound brief kinds become
-- switchable. The three CLIENT-facing kinds (brief_sent, brief_changed,
-- brief_approved) are deliberately NOT here — a client-facing notification
-- is a message to somebody's client about their own brief, not a preference
-- a recruiter holds, and agency-notify.test.ts fails the build if one lands.
-- This is the NEWEST definition of the list; the test reads the newest.
-- ------------------------------------------------------------
alter table agency.notification_prefs
  drop constraint if exists notification_prefs_event_kind_check;
alter table agency.notification_prefs
  add constraint notification_prefs_event_kind_check
    check (event_kind in (
      'brief_filed',
      'invite_accepted',
      'debrief_recorded',
      'consent_answered',
      'reference_submitted',
      'booking_answered',
      'brief_amended_by_client',
      'brief_approved_by_client'
    ));
