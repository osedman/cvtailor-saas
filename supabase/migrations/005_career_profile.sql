-- Career Arc: a private, single-page highlight reel generated from a user's
-- CV (timeline, skills, growth signal, projects, inferred qualities). One
-- row per user, regenerated in place. `source` stays 'single_cv' for now but
-- lets us switch to an aggregated (multi-tailor) generator later without a
-- schema change.

create table if not exists public.career_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  source      text not null default 'single_cv',
  sections    jsonb not null default '{}'::jsonb
  -- sections: { headline, timeline: [{company,title,start,end,highlights:[string]}],
  --             skills: [{name,category}], growth: {fromTitle,toTitle,tenureYears},
  --             projects: [{title,summary}], qualities: [string] }
);

create unique index if not exists career_profiles_user_id
  on public.career_profiles (user_id);

alter table public.career_profiles enable row level security;

create policy "Users can read own career profile"
  on public.career_profiles for select using (auth.uid() = user_id);
create policy "Users can insert own career profile"
  on public.career_profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own career profile"
  on public.career_profiles for update using (auth.uid() = user_id);
create policy "Users can delete own career profile"
  on public.career_profiles for delete using (auth.uid() = user_id);
