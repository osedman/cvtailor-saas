-- Career-memory Phase 2/3: a generated roadmap (skills to close, each with
-- free resources + a project brief + suggested CV phrasing) and a checklist
-- to track progress against it. One roadmap per user, replaced when they
-- regenerate it.

create table if not exists public.career_roadmaps (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  target_role     text not null default '',
  hours_per_week  integer,
  items           jsonb not null default '[]'::jsonb
  -- items: [{ skill, whyItMatters, resources: [{title,url,source}],
  --           projectBrief, cvPhrasing, status: 'todo'|'in_progress'|'done' }]
);

create unique index if not exists career_roadmaps_user_id
  on public.career_roadmaps (user_id);

alter table public.career_roadmaps enable row level security;

create policy "Users can read own roadmap"
  on public.career_roadmaps for select using (auth.uid() = user_id);
create policy "Users can insert own roadmap"
  on public.career_roadmaps for insert with check (auth.uid() = user_id);
create policy "Users can update own roadmap"
  on public.career_roadmaps for update using (auth.uid() = user_id);
create policy "Users can delete own roadmap"
  on public.career_roadmaps for delete using (auth.uid() = user_id);
