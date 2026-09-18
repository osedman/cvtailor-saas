-- Interview rules gain an AGENCY DEFAULT layer.
--
-- WHY. `interview_settings.role_id` was the primary key and NOT NULL, so the
-- only place interview rules could live was a single role. The 24-hour
-- minimum notice — the one that decides whether a candidate can book a time
-- today — was a CODE constant with no way to change it except per role, one
-- role at a time, forever. A desk that books same-day had to remember on
-- every single role, and forgetting produced a doorway that silently offered
-- nothing (which is exactly what happened on 15 and 18 September 2026).
--
-- The field read as an agency default and was not one. This makes it one.
--
-- THE SHAPE IS BORROWED, NOT INVENTED. `agency.notification_preferences`
-- already solves this: a NULL in the scoping column IS the agency default,
-- a non-null row is the override, and `resolvePreference()` is the single
-- rule that reads them. This mirrors it exactly — role_id NULL is the
-- agency's default, role_id set is that role's override — so there is one
-- pattern in this schema for "a default somebody can override" rather than
-- two that drift.
--
-- CONSEQUENCE FOR THE PRIMARY KEY. A primary key column cannot be null, so
-- the PK on role_id goes and is replaced by two PARTIAL unique indexes:
-- one role keeps at most one override, and one agency keeps at most one
-- default. Both are needed; without the second, an agency could accumulate
-- several conflicting defaults and the resolver would pick arbitrarily.
--
-- NOTE FOR THE APP: a partial unique index cannot be named as a PostgREST
-- `onConflict` target, so `setInterviewSettings` no longer upserts — it
-- selects, then updates or inserts. Changed in the same commit.
--
-- Idempotent: safe to re-run against staging and production.

-- ── The primary key becomes two partial unique indexes ──────────────────────
--
-- ONE STATEMENT, ON PURPOSE. This was two ALTERs — drop the constraint, then
-- drop NOT NULL — and it failed on tailr-staging on 19 Sep 2026 with
-- `42P16: column "role_id" is in a primary key`: the second ran while the
-- first had not taken, and because the editor runs a script in one
-- transaction the whole migration rolled back, leaving nothing applied.
--
-- A DO block removes the question. The drop and the nullability change are
-- now one statement executed in order, and the constraint is found BY LOOKUP
-- rather than by assuming it is called `interview_settings_pkey` — a table
-- whose key was ever rebuilt by hand would carry a different name and the
-- `if exists` would have quietly matched nothing, which is the failure mode
-- that wastes an afternoon.
do $mig$
declare
  pk_name text;
begin
  select conname into pk_name
  from pg_constraint
  where conrelid = 'agency.interview_settings'::regclass
    and contype = 'p';

  if pk_name is not null then
    execute format('alter table agency.interview_settings drop constraint %I', pk_name);
  end if;

  -- Only after the key is gone can the column stop being mandatory. Guarded
  -- so a re-run against an already-migrated database does nothing.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'agency'
      and table_name = 'interview_settings'
      and column_name = 'role_id'
      and is_nullable = 'NO'
  ) then
    alter table agency.interview_settings alter column role_id drop not null;
  end if;
end
$mig$;

-- At most one override per role.
create unique index if not exists interview_settings_role_uniq
  on agency.interview_settings (role_id)
  where role_id is not null;

-- At most one default per agency. This is the row role_id IS NULL means.
create unique index if not exists interview_settings_agency_default_uniq
  on agency.interview_settings (agency_id)
  where role_id is null;

-- ── The default row must belong to the agency it defaults for ───────────────
-- A row with no role still carries agency_id, which is already NOT NULL and
-- already foreign-keyed with ON DELETE CASCADE, so an agency's default dies
-- with the agency. Nothing further is needed there.
--
-- What IS needed: the role, when present, must belong to the same agency as
-- the row claims. Nothing enforced that before, because role_id was the key
-- and the agency was carried along for the ride. With two layers it matters,
-- because resolution filters on agency_id and would otherwise be able to read
-- another tenant's override.
create or replace function agency.interview_settings_role_matches_agency()
returns trigger
language plpgsql
as $$
begin
  if new.role_id is not null then
    if not exists (
      select 1 from agency.job_roles r
      where r.id = new.role_id and r.agency_id = new.agency_id
    ) then
      raise exception 'interview_settings.role_id % does not belong to agency %',
        new.role_id, new.agency_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists interview_settings_tenancy on agency.interview_settings;
create trigger interview_settings_tenancy
  before insert or update on agency.interview_settings
  for each row execute function agency.interview_settings_role_matches_agency();

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Interview rules are audit-coupled: writes happen in API routes via the
-- service role in the same operation as the audit row, so there are no
-- authenticated write policies and service_role needs its grants stated
-- EXPLICITLY. Three shipped tables have now been found unwritable by the role
-- that writes them because a `grant ... to authenticated` looked complete —
-- so this is spelled out rather than assumed.
grant select, insert, update, delete on agency.interview_settings to service_role;
