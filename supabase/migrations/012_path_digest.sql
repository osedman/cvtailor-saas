-- Weekly path digest opt-out (default: digest on). One-click unsubscribe sets
-- this true; no other notification state exists — one email a week, max.
alter table public.profiles
  add column if not exists path_digest_opt_out boolean not null default false;
