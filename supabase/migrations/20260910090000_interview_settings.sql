-- Interview rules: the settings a round is scheduled BY, not the appointments.
--
-- The interview phase is one batch scheduling workflow, not ten separate
-- ones (Ose, 10 Sep 2026). So the client is asked for rules once —
-- duration, buffer, minimum notice, how many interviews a day, where it
-- happens, the date range — and Tailr proposes, validates capacity and
-- seats candidates against those rules. Before this the numbers existed
-- only as arguments to proposeWindows() in the browser: nothing was stored,
-- so nothing could be enforced, re-used, or shown to the recruiter.
--
-- One row per role. Written by the hiring manager through their own routes
-- and by the recruiter through theirs; audit-coupled like the rest of the
-- agency schema, so no authenticated write grants and an explicit
-- service-role grant (a `grant all on all tables` was point-in-time —
-- 20260822090000 — so every table since must grant its own).
--
-- Templates are the same shape, saved per agency and applied to a new role.
-- The shape is validated in lib/agency/interview-settings.ts, which is the
-- one validator for both.
--
-- Run in tailr-staging first. Idempotent.

create table if not exists agency.interview_settings (
  role_id           uuid primary key references agency.job_roles on delete cascade,
  agency_id         uuid not null references agency.agencies on delete cascade,
  -- What the interview IS. Free text because an agency's vocabulary is its
  -- own; the product never branches on it.
  interview_type    text not null default 'Hiring manager interview',
  duration_minutes  smallint not null default 45
                      check (duration_minutes between 5 and 480),
  location_kind     text not null default 'video'
                      check (location_kind in ('video', 'phone', 'in_person')),
  -- "Google Meet", "Teams", a room name. Never a joining link: those are
  -- minted per round, not stored on the role.
  location_detail   text not null default '',
  window_from       date,
  window_to         date,
  -- How much warning a candidate is owed. A slot inside this is not offered.
  min_notice_hours  smallint not null default 24
                      check (min_notice_hours between 0 and 336),
  buffer_minutes    smallint not null default 15
                      check (buffer_minutes between 0 and 240),
  max_per_day       smallint not null default 4
                      check (max_per_day between 1 and 20),
  reschedule_policy text not null default 'until_notice'
                      check (reschedule_policy in ('none', 'until_notice', 'anytime')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint interview_settings_window_ordered
    check (window_from is null or window_to is null or window_to >= window_from)
);

comment on table agency.interview_settings is
  'How a role''s interviews are scheduled: duration, buffer, notice, daily cap, location, date range. Rules, never appointments.';

alter table agency.interview_settings enable row level security;

drop policy if exists interview_settings_select on agency.interview_settings;
create policy interview_settings_select on agency.interview_settings
  for select using (agency_id in (select agency.member_agency_ids()));

grant select on agency.interview_settings to authenticated;
grant select, insert, update, delete on agency.interview_settings to service_role;

-- Reusable across roles. The settings blob is validated by the same code
-- that validates the columns above, so a template cannot carry a shape the
-- role table would reject.
create table if not exists agency.interview_templates (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agency.agencies on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  settings    jsonb not null,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  unique (agency_id, name)
);

alter table agency.interview_templates enable row level security;

drop policy if exists interview_templates_select on agency.interview_templates;
create policy interview_templates_select on agency.interview_templates
  for select using (agency_id in (select agency.member_agency_ids()));

grant select on agency.interview_templates to authenticated;
grant select, insert, update, delete on agency.interview_templates to service_role;

-- The audit log learns 'interview'.
--
-- REBUILT FROM THE DEPLOYED LIST, NOT FROM MIGRATION 1. Migration 10 once
-- rebuilt this constraint starting from the original list and silently
-- dropped 'member', so adding a recruiter threw at the audit step for two
-- days. Every value below is the previous set (20260822110000) plus one.
-- lib/__tests__/audit-entity-types.test.ts holds the TS union and this list
-- together mechanically.
alter table agency.audit_log drop constraint if exists audit_log_entity_type_check;
alter table agency.audit_log add constraint audit_log_entity_type_check
  check (entity_type in (
    'role', 'requirement', 'constraint', 'candidate', 'override', 'decision',
    'submission', 'notice', 'rights_request', 'member',
    'client_invite', 'brief', 'availability', 'round', 'artifact',
    'reference', 'handover',
    'matching',
    'notification',
    -- New: how a role's interviews are scheduled. The entity_ref is the role
    -- ref; the payload is the rules, which are about the process and never
    -- about a person.
    'interview'
  ));
