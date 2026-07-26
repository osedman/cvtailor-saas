-- Live job-market snapshots for the career path.
-- Keyed on (role, region) — NOT per user — so everyone aiming at the same role
-- shares one weekly-refreshed row. This is what keeps API usage to a few
-- hundred calls a month regardless of user count.
create table if not exists public.market_snapshots (
  role_key text primary key,          -- normaliseRoleKey(): "GB:product operations lead"
  role text not null,
  region text not null default 'GB',
  total_roles integer not null default 0,
  band jsonb,                         -- { p25, median, p75, sampleSize } or null when unknown
  top_companies jsonb not null default '[]'::jsonb,
  jobs jsonb not null default '[]'::jsonb,   -- sampled postings (for unlock counts + later listings)
  fetched_at timestamptz not null default now()
);

-- Shared reference data: readable by any signed-in user, written only by the
-- service role (the API route refreshes it).
alter table public.market_snapshots enable row level security;

create policy "Signed-in users can read market snapshots"
  on public.market_snapshots for select
  to authenticated
  using (true);
