-- Tailr — migration 29: notification preferences, agency default + personal
-- override.
--
-- ONE table, not two. A row with user_id NULL is the agency's default for that
-- event; a row with a user_id is that person's own choice. Resolution is
-- "your row if you have one, else the agency's, else on" — expressed once, in
-- lib/agency/notify.ts, so the rule cannot drift between callers.
--
-- Two tables would have duplicated the event_kind check and the audit shape
-- for no gain. The cost of the single table is that NULL carries meaning, so
-- the two partial unique indexes below make that meaning an enforced
-- invariant rather than a convention: exactly one default per (agency, event),
-- and exactly one override per (agency, person, event).
--
-- Defaults are deliberately absent rather than seeded. An absent row means ON,
-- which is what an unheard event demands — seeding 6 rows per agency would
-- mean a new event kind silently defaults to whatever the seeder last wrote.
--
-- GRANTS: service_role only, and deliberately no authenticated writes. This is
-- audit-coupled like candidate_compliance (migration 24) and placements
-- (migration 25) — the route writes the row and its audit entry in the same
-- operation. Note the explicit grant: migration 1's
-- `grant all on all tables in schema agency` is a ONE-SHOT over the tables
-- that existed then, not a standing rule, which is how role_matching shipped
-- unreachable. lib/__tests__/agency-schema-grants.test.ts enforces this.

create table if not exists agency.notification_prefs (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agency.agencies on delete cascade,
  -- NULL means "this is the agency default for everyone who has not chosen".
  user_id     uuid references auth.users on delete cascade,
  event_kind  text not null
                check (event_kind in (
                  'brief_filed',
                  'invite_accepted',
                  'debrief_recorded',
                  'consent_answered',
                  'reference_submitted'
                )),
  enabled     boolean not null,
  -- Who made this choice. Set null on account deletion, like every other
  -- provenance pointer in this schema; the who-did-what history is in
  -- audit_log, not here.
  set_by      uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- brief_answered is deliberately NOT in that list. It is a message to a client
-- about their own brief, not a notification to a recruiter, so it is not a
-- preference anybody holds. The check constraint is what stops a future caller
-- quietly making it one.

-- Exactly one agency default per event...
create unique index if not exists notification_prefs_default_idx
  on agency.notification_prefs (agency_id, event_kind)
  where user_id is null;

-- ...and exactly one personal override per person per event.
create unique index if not exists notification_prefs_member_idx
  on agency.notification_prefs (agency_id, user_id, event_kind)
  where user_id is not null;

-- The read path is "every pref for this agency and event", which both indexes
-- above already serve, plus a per-person lookup when the settings screen
-- renders one member's page.
create index if not exists notification_prefs_agency_idx
  on agency.notification_prefs (agency_id, event_kind);

alter table agency.notification_prefs enable row level security;

-- Service role only. No policies: service_role bypasses RLS, and RLS with no
-- policy denies everyone else, which is the intent. An authenticated client
-- never touches this table directly.
grant select, insert, update, delete on agency.notification_prefs to service_role;
