-- Tailr for Agencies — client-actor auth: linkage + invites.
--
-- Decision record: docs/AGENCIES_SCHEMA.md §5.4 (13 Aug 2026).
--
-- Clients (hiring managers) become authenticatable without becoming members:
--
--   * One auth pool. auth.users is the person; consumer (public.profiles),
--     recruiter (agency.members) and hiring manager (linked client_contacts)
--     are orthogonal hats the same person may hold. Nothing here touches the
--     consumer plane.
--   * Linkage is a nullable pointer, invite-only. client_contacts.user_id is
--     bound when a recruiter-issued invite is accepted on a verified email.
--     There is NO email-matching self-claim: "an agency once typed your
--     email" must never become account access, and every grant must keep its
--     who-authorized-this attribution (the invite row + audit entry).
--   * set null, not restrict/cascade: deleting an auth user never blocks on
--     agency provenance, and unlinking a contact revokes access on the next
--     request without touching the contact row or its attribution trail.
--   * HMs get ZERO RLS policies in this schema. The portal precedent extends:
--     client actors are invisible to Postgres as far as recruiter tables are
--     concerned, and every HM read/write flows through service-role routes
--     shaped by disclosure rules. The policies below are for agency MEMBERS
--     reading their own agency's invite state — nothing grants the invited
--     user anything.
--
-- Idempotent: safe to re-run against staging and production.

-- ============================================================
-- LINKAGE COLUMN
-- ============================================================

alter table agency.client_contacts
  add column if not exists user_id uuid references auth.users on delete set null;

-- Hat detection is a service-role lookup by auth.uid(); this partial index is
-- that lookup. Deliberately NOT unique: one person may be several contacts
-- (even at one agency, under two addresses) — harmless, and each row remains
-- independently grantable and revocable.
create index if not exists client_contacts_user_idx
  on agency.client_contacts (user_id) where user_id is not null;

-- ============================================================
-- INVITES
--
-- Raw-once token discipline, same as submission_recipients: the raw invite
-- token is shown/emailed exactly once and only its sha256 lands here. Accept
-- flow (service role): match hash → check expires_at/revoked_at → bind
-- client_contacts.user_id = auth.uid() → stamp accepted_* → audit row, all in
-- one operation.
--
-- contact_id CASCADE (not restrict): an invite is a grant in flight, not an
-- attribution record — the audit_log row is the durable trace. Deleting a
-- contact tears down any un-accepted invitations with it.
-- ============================================================

create table if not exists agency.client_invites (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agency.agencies on delete cascade,
  contact_id   uuid not null references agency.client_contacts on delete cascade,
  token_hash   text not null unique,
  invited_by   uuid references auth.users on delete set null,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists client_invites_contact_idx
  on agency.client_invites (contact_id, created_at desc);

-- ============================================================
-- AUDIT ENTITY TYPES
--
-- Widened once here for the whole client-actor build (invites now, the
-- interview loop in the companion migration) so the check constraint is not
-- rewritten twice. Superset of the old list — existing writers are unaffected.
-- ============================================================

alter table agency.audit_log
  drop constraint if exists audit_log_entity_type_check;

do $$ begin
  alter table agency.audit_log
    add constraint audit_log_entity_type_check
      check (entity_type in ('role', 'requirement', 'constraint',
                             'candidate', 'override', 'decision',
                             'submission', 'notice', 'rights_request',
                             'client_invite', 'brief', 'availability',
                             'round', 'artifact', 'reference', 'handover'));
exception when duplicate_object then null; end $$;

-- ============================================================
-- ROW LEVEL SECURITY
--
-- Members see their agency's invite state (who has access, what is pending).
-- No write policies: create/accept/revoke are service-role operations with
-- audit rows in the same request. The invited user gets no policy at all —
-- their accept path never reads this table directly.
-- ============================================================

alter table agency.client_invites enable row level security;

do $$ begin
  create policy "client_invites_select" on agency.client_invites for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

grant select on agency.client_invites to authenticated;
grant all on agency.client_invites to service_role;
