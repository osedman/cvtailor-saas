-- Normalise career-path skills out of career_roadmaps.items (a jsonb array on a
-- single row per user) into their own table.
--
-- Why: everything the Quick Wins work needs — horizon filtering, run provenance,
-- dedupe on skill, surfaced counts, expiry — is a per-item query. Against a jsonb
-- array they are all read-modify-write over the whole array, which two concurrent
-- tailor runs can clobber. Done now while the data is 8 rows / 23 items.
--
-- career_roadmaps KEEPS its per-user fields (target_role, intention, hours_per_week,
-- findings, milestones, target_skills). Its `items` column is deliberately left in
-- place and untouched by this migration, so a bad deploy can be rolled back without
-- data loss. It stops being read once the store module ships; drop it in a later
-- migration once this has proven itself.
-- Idempotent.

create table if not exists public.career_roadmap_items (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users on delete cascade,
  roadmap_id             uuid references public.career_roadmaps(id) on delete cascade,

  -- The item itself (mirrors CareerRoadmapItem in lib/anthropic.ts)
  skill                  text not null,
  why_it_matters         text not null default '',
  resources              jsonb not null default '[]'::jsonb,
  project_brief          text not null default '',
  cv_phrasing            text not null default '',
  status                 text not null default 'todo'
                           check (status in ('todo', 'in_progress', 'done')),
  touched_at             timestamptz,
  evidence               jsonb,

  -- Horizon + provenance
  horizon                text not null default 'core'
                           check (horizon in ('quick', 'core')),
  source                 text not null default 'north_star'
                           check (source in ('north_star', 'tailor_run')),
  source_run_id          uuid references public.tailor_history(id) on delete set null,
  role_family_at_capture text,
  effort_estimate_hours  integer,
  surfaced_count         integer not null default 1,
  archived_at            timestamptz,

  -- Preserves the order the jsonb array had, so the path renders unchanged
  position               integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Dedupe-on-skill, enforced by the database rather than by app code. This is the
-- main thing the jsonb array could not give us: a second run surfacing the same
-- skill now conflicts instead of silently creating a duplicate.
create unique index if not exists career_roadmap_items_user_skill
  on public.career_roadmap_items (user_id, lower(skill));

create index if not exists career_roadmap_items_user_horizon
  on public.career_roadmap_items (user_id, horizon) where archived_at is null;

create index if not exists career_roadmap_items_source_run
  on public.career_roadmap_items (source_run_id);

alter table public.career_roadmap_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'career_roadmap_items'
                   and policyname = 'Users can read own roadmap items') then
    create policy "Users can read own roadmap items"
      on public.career_roadmap_items for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'career_roadmap_items'
                   and policyname = 'Users can insert own roadmap items') then
    create policy "Users can insert own roadmap items"
      on public.career_roadmap_items for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'career_roadmap_items'
                   and policyname = 'Users can update own roadmap items') then
    create policy "Users can update own roadmap items"
      on public.career_roadmap_items for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'career_roadmap_items'
                   and policyname = 'Users can delete own roadmap items') then
    create policy "Users can delete own roadmap items"
      on public.career_roadmap_items for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every existing item becomes horizon 'core' / source 'north_star'. Verified in
-- Phase 0: no existing item carries a horizon or source field, so there is nothing
-- to collide with. Note that most prod roadmaps predate the North Star flow (only
-- 2 of 8 have a target_role) — 'core' is still correct for all of them: they are
-- the user's deliberately generated path, not run-surfaced suggestions.
--
-- ON CONFLICT DO NOTHING makes this safe to re-run: a second execution inserts
-- nothing rather than duplicating or overwriting live state.
insert into public.career_roadmap_items (
  user_id, roadmap_id, skill, why_it_matters, resources, project_brief,
  cv_phrasing, status, touched_at, evidence, position, horizon, source
)
select
  r.user_id,
  r.id,
  trim(e.item->>'skill'),
  coalesce(e.item->>'whyItMatters', ''),
  case when jsonb_typeof(e.item->'resources') = 'array'
       then e.item->'resources' else '[]'::jsonb end,
  coalesce(e.item->>'projectBrief', ''),
  coalesce(e.item->>'cvPhrasing', ''),
  case when e.item->>'status' in ('todo', 'in_progress', 'done')
       then e.item->>'status' else 'todo' end,
  -- Only cast values that actually look like a timestamp; a malformed one must
  -- not abort the whole backfill.
  case when e.item->>'touchedAt' ~ '^\d{4}-\d{2}-\d{2}'
       then (e.item->>'touchedAt')::timestamptz else null end,
  case when jsonb_typeof(e.item->'evidence') = 'object'
       then e.item->'evidence' else null end,
  e.ord::int,
  'core',
  'north_star'
from public.career_roadmaps r
cross join lateral jsonb_array_elements(r.items) with ordinality as e(item, ord)
where jsonb_typeof(r.items) = 'array'
  and coalesce(trim(e.item->>'skill'), '') <> ''
on conflict (user_id, lower(skill)) do nothing;
