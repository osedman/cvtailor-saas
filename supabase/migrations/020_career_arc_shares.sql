-- Career Arc share links (rebuild stage 3).
-- One share per user, regenerable. The token IS the capability: the public
-- page looks a share up by token via the service role. No anon RLS policy
-- exists on purpose — anonymous readers never query this table directly.

create table if not exists career_arc_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token text not null unique,
  -- Per-claim redaction: { "<career_evidence.id>": "full" | "band" | "hide" }.
  -- Cards missing from the map default to "full". Cards hidden on the private
  -- arc never appear regardless of this map.
  claim_redactions jsonb not null default '{}'::jsonb,
  first_name_only boolean not null default true,
  hide_employers boolean not null default false,
  hide_dates boolean not null default false,
  include_break boolean not null default false,
  expires_at timestamptz,
  revoked boolean not null default false,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists career_arc_shares_token_idx on career_arc_shares (token);

alter table career_arc_shares enable row level security;

create policy "arc shares are self readable"
  on career_arc_shares for select using (auth.uid() = user_id);
create policy "arc shares are self insertable"
  on career_arc_shares for insert with check (auth.uid() = user_id);
create policy "arc shares are self updatable"
  on career_arc_shares for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "arc shares are self deletable"
  on career_arc_shares for delete using (auth.uid() = user_id);

-- Atomic view-count bump for the public page (service role only; anon/authed
-- callers have no grant). Security definer so it works without a select grant.
create or replace function increment_arc_share_views(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update career_arc_shares
     set view_count = view_count + 1
   where token = p_token
     and revoked = false
     and (expires_at is null or expires_at > now());
$$;

revoke all on function increment_arc_share_views(text) from public, anon, authenticated;
