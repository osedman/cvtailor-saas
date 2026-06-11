-- Profiles table (linked to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  tailors_used integer not null default 0,
  plan text not null default 'free',  -- 'free' | 'pro'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper RPC to safely increment usage counter
create or replace function public.increment_tailors_used(user_id uuid)
returns void
language sql
security definer
as $$
  update public.profiles
  set tailors_used = tailors_used + 1,
      updated_at = now()
  where id = user_id;
$$;

-- Row level security
alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tailor history — one row per successful tailoring session
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tailor_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  created_at   timestamptz not null default now(),
  job_title    text not null default '',   -- extracted by Claude from the JD
  company_name text not null default '',   -- extracted by Claude from the JD
  job_url      text not null default '',   -- original URL if scraped, else ''
  job_snippet  text not null default '',   -- first 200 chars of JD
  match_score  integer not null default 0,
  result       jsonb not null              -- full TailorResult object
);

-- Indexes
create index if not exists tailor_history_user_created
  on public.tailor_history (user_id, created_at desc);

-- RLS
alter table public.tailor_history enable row level security;

create policy "Users can read own history"
  on public.tailor_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own history"
  on public.tailor_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own history"
  on public.tailor_history for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Job tracker — Kanban board (Saved → Applied → Interview → Offer)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.job_tracker (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  status          text not null default 'saved',   -- saved|applied|interview|offer
  position        integer not null default 0,
  job_title       text not null default '',
  company_name    text not null default '',
  job_url         text not null default '',
  job_description text not null default '',
  tailored_cv     text not null default '',
  history_id      uuid references public.tailor_history(id) on delete set null,
  match_score     integer,
  notes           jsonb not null default '[]'::jsonb  -- [{text, created_at}]
);

create index if not exists job_tracker_user_status
  on public.job_tracker (user_id, status, position);

alter table public.job_tracker enable row level security;

create policy "Users can read own jobs"
  on public.job_tracker for select using (auth.uid() = user_id);
create policy "Users can insert own jobs"
  on public.job_tracker for insert with check (auth.uid() = user_id);
create policy "Users can update own jobs"
  on public.job_tracker for update using (auth.uid() = user_id);
create policy "Users can delete own jobs"
  on public.job_tracker for delete using (auth.uid() = user_id);
