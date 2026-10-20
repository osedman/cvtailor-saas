-- 019_career_evidence.sql · evidence bank for Career Arc rebuild
create table if not exists career_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references career_profiles(id) on delete cascade,
  category text not null check (category in ('quant','scope','leadership','systems','craft')),
  claim text not null,
  source_role text not null default '',
  source_company text not null default '',
  source_span text not null default '',
  cv_line int,
  pinned boolean not null default false,
  hidden boolean not null default false,
  rephrased_text text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table career_evidence enable row level security;

do $$ begin
  create policy "career_evidence_select" on career_evidence
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "career_evidence_insert" on career_evidence
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "career_evidence_update" on career_evidence
    for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "career_evidence_delete" on career_evidence
    for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists career_evidence_user_idx on career_evidence(user_id, sort_order);
