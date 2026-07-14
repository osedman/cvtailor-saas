-- Living Career Path: evolve the generate-once roadmap into a living path.
-- The path now has a "you are here" (current_title) and a history of reached
-- rungs (milestones) so it can render as one continuous line — the past
-- (milestones) flowing into the road ahead (items toward target_role).
-- NB: named current_title because current_role is a reserved word in Postgres.
-- Idempotent; run on tailr-staging.

alter table public.career_roadmaps
  add column if not exists current_title text not null default '';

alter table public.career_roadmaps
  add column if not exists milestones jsonb not null default '[]'::jsonb;
  -- milestones: [{ role, reachedAt }]  — reached rungs, oldest first.
