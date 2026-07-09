-- Living path: the user's stated intention (what they're trying to accomplish),
-- and a memory of skills they've explicitly removed so they're never re-added.
-- Idempotent; run on tailr-staging.

alter table public.career_roadmaps
  add column if not exists intention text not null default '';

alter table public.career_roadmaps
  add column if not exists removed_skills jsonb not null default '[]'::jsonb;
  -- removed_skills: [ "skill name", ... ] lowercased on write
