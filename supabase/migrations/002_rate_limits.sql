-- Rate limiting for the AI endpoints. Fixed-window counters keyed by
-- (user_id, key, time-bucket). Service-role only — the app calls the
-- consume_rate_limit() RPC via the admin client.

create table if not exists public.rate_limits (
  id           text primary key,           -- "{user_id}:{key}:{bucket}"
  user_id      uuid not null,
  key          text not null,
  window_start timestamptz not null default now(),
  count        int  not null default 0
);

create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

-- RLS enabled with NO policies: only the service role may read/write.
alter table public.rate_limits enable row level security;

-- Atomically increment the counter for the current window and report whether
-- the request is within the limit. Returns jsonb { allowed, count, limit,
-- remaining, reset_seconds }.
create or replace function public.consume_rate_limit(
  p_user_id        uuid,
  p_key            text,
  p_limit          int,
  p_window_seconds int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket bigint := floor(extract(epoch from now()) / p_window_seconds);
  v_id     text   := p_user_id::text || ':' || p_key || ':' || v_bucket::text;
  v_count  int;
begin
  insert into public.rate_limits (id, user_id, key, window_start, count)
  values (v_id, p_user_id, p_key, now(), 1)
  on conflict (id) do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return jsonb_build_object(
    'allowed',       v_count <= p_limit,
    'count',         v_count,
    'limit',         p_limit,
    'remaining',     greatest(p_limit - v_count, 0),
    'reset_seconds', p_window_seconds - (floor(extract(epoch from now()))::bigint % p_window_seconds)
  );
end;
$$;

-- Optional housekeeping: drop counters older than a day. Safe to run on a
-- schedule (pg_cron) or manually; old buckets are otherwise just dead rows.
-- delete from public.rate_limits where window_start < now() - interval '1 day';
