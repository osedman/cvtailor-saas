-- First CV Builder: evidence-first CV creation for users without an existing CV.
-- Uploaded files are parsed in memory and are not stored. Only user-reviewed
-- evidence and the editable CV draft persist.

create table if not exists public.cv_evidence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_name text not null default 'Added by you',
  category text not null check (category in (
    'education', 'project', 'work', 'volunteering', 'responsibility',
    'award', 'certificate', 'skill', 'activity', 'other'
  )),
  title text not null,
  organisation text not null default '',
  date_text text not null default '',
  description text not null,
  skills jsonb not null default '[]'::jsonb,
  source_excerpt text not null default '',
  review_status text not null default 'suggested'
    check (review_status in ('suggested', 'confirmed', 'excluded'))
);

create index if not exists cv_evidence_items_user_created
  on public.cv_evidence_items (user_id, created_at desc);

alter table public.cv_evidence_items enable row level security;

create policy "Users can read own CV evidence"
  on public.cv_evidence_items for select using (auth.uid() = user_id);
create policy "Users can insert own CV evidence"
  on public.cv_evidence_items for insert with check (auth.uid() = user_id);
create policy "Users can update own CV evidence"
  on public.cv_evidence_items for update using (auth.uid() = user_id);
create policy "Users can delete own CV evidence"
  on public.cv_evidence_items for delete using (auth.uid() = user_id);

create table if not exists public.first_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  target_opportunity text not null default '',
  cv_text text not null default '',
  claim_sources jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'ready')),
  unique (user_id)
);

alter table public.first_cvs enable row level security;

create policy "Users can read own first CV"
  on public.first_cvs for select using (auth.uid() = user_id);
create policy "Users can insert own first CV"
  on public.first_cvs for insert with check (auth.uid() = user_id);
create policy "Users can update own first CV"
  on public.first_cvs for update using (auth.uid() = user_id);
create policy "Users can delete own first CV"
  on public.first_cvs for delete using (auth.uid() = user_id);
