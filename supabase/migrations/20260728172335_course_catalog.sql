-- Tailr's durable course repository.
--
-- Roadmap generation used to ask the model to find URLs live on every request.
-- These tables make reviewed provider records the source of truth instead:
-- users can read active courses, while only trusted server-side sync code can
-- write catalog, candidate, or sync-run rows.
--
-- Idempotent so the same SQL can be applied manually to staging and production.

create table if not exists public.course_catalog (
  id                   uuid primary key default gen_random_uuid(),
  provider             text not null,
  external_id          text not null,
  title                text not null,
  description          text not null default '',
  canonical_url        text not null,
  skill_tags           text[] not null default '{}'::text[],
  level                text not null default 'all'
                         check (level in ('beginner', 'intermediate', 'advanced', 'all')),
  duration_minutes     integer check (duration_minutes is null or duration_minutes > 0),
  language             text not null default 'en',
  regions              text[] not null default '{}'::text[],
  access_type          text not null default 'free'
                         check (access_type in ('free', 'audit', 'paid')),
  quality_score        numeric(3,2) not null default 0.50
                         check (quality_score >= 0 and quality_score <= 1),
  status               text not null default 'active'
                         check (status in ('active', 'review', 'stale')),
  search_text          text not null default '',
  provider_payload     jsonb not null default '{}'::jsonb,
  last_verified_at     timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider, external_id),
  unique (canonical_url)
);

create index if not exists course_catalog_skill_tags_idx
  on public.course_catalog using gin (skill_tags);
create index if not exists course_catalog_regions_idx
  on public.course_catalog using gin (regions);
create index if not exists course_catalog_search_idx
  on public.course_catalog using gin (to_tsvector('english', search_text));
create index if not exists course_catalog_active_quality_idx
  on public.course_catalog (quality_score desc, duration_minutes)
  where status = 'active';

alter table public.course_catalog enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'course_catalog'
      and policyname = 'Signed-in users can read active course catalog'
  ) then
    create policy "Signed-in users can read active course catalog"
      on public.course_catalog for select
      to authenticated
      using (status = 'active');
  end if;
end $$;

create table if not exists public.course_candidates (
  id                   uuid primary key default gen_random_uuid(),
  provider             text not null,
  external_id          text,
  title                text not null,
  canonical_url        text not null unique,
  discovered_via       text not null,
  payload              jsonb not null default '{}'::jsonb,
  status               text not null default 'pending'
                         check (status in ('pending', 'approved', 'rejected')),
  rejection_reason     text,
  discovered_at        timestamptz not null default now(),
  reviewed_at          timestamptz,
  updated_at           timestamptz not null default now()
);

create index if not exists course_candidates_status_idx
  on public.course_candidates (status, discovered_at desc);

-- No policies: candidate review is service-role-only.
alter table public.course_candidates enable row level security;

create table if not exists public.course_sync_runs (
  id                   uuid primary key default gen_random_uuid(),
  source               text not null,
  status               text not null default 'running'
                         check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  discovered_count     integer not null default 0,
  upserted_count       integer not null default 0,
  candidate_count      integer not null default 0,
  stale_count          integer not null default 0,
  error                text
);

create index if not exists course_sync_runs_source_started_idx
  on public.course_sync_runs (source, started_at desc);

-- No policies: sync observability is service-role-only.
alter table public.course_sync_runs enable row level security;
