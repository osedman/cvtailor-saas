-- schema.sql had drifted from production's real, live schema (discovered
-- when staging, built from schema.sql, was missing columns production
-- actually has). This migration brings any environment built from the old
-- schema.sql up to date. Production already has these columns natively —
-- running this against production is a safe no-op (if not exists).

alter table public.tailor_history
  add column if not exists job_description text not null default '';

alter table public.profiles
  add column if not exists full_name text;
