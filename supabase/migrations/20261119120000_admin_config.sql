-- Tailr — admin configuration: off switches, staging email allowlist, and a
-- record of scheduled runs (19 Nov 2026). Phase 3 of the admin area.
--
-- 1. public.admin_settings — a small key/value table read by the server.
--    The keys are fixed (the CHECK below); nothing arbitrary can be stored.
--      kill.*                  an off switch. Presence of the row with
--                              {"off": true} turns the feature off; deleting
--                              the row returns it to how the environment is
--                              configured. A switch can never turn ON
--                              something the environment has off.
--      email.staging_allowlist {"addresses": [...]} — exact addresses that
--                              non-production may email, IN ADDITION to the
--                              environment's own list. Ignored in production.
--
-- 2. public.admin_set_setting() — the only writer. Changes the row and writes
--    the admin_audit_log entry in one transaction.
--
-- 3. public.cron_runs — one row per scheduled run, with counts only, so the
--    admin area can answer "did last night's job run".
--
-- RLS on, no policies, browser roles revoked. The service role can READ
-- settings but not write them directly; it writes only through the function.
--
-- Requires 20261112120000_platform_admins.sql. Idempotent. Run on
-- tailr-staging, then production, BEFORE deploying the code. The code
-- tolerates the tables being absent: every switch then follows the
-- environment, as it does today.

create table if not exists public.admin_settings (
  key         text primary key
                check (key in ('kill.market_insights', 'kill.course_sources',
                               'kill.course_youtube', 'kill.course_microsoft_learn',
                               'email.staging_allowlist')),
  value       jsonb not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

alter table public.admin_settings enable row level security;
revoke all on public.admin_settings from anon, authenticated, service_role;
grant select on public.admin_settings to service_role;

create or replace function public.admin_set_setting(
  p_actor  uuid,
  p_key    text,
  p_value  jsonb,     -- null = remove the setting (back to the default)
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_old    jsonb;
begin
  if p_actor is null or p_key is null then raise exception 'missing_ids'; end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;

  select value into v_old from public.admin_settings where key = p_key for update;

  if p_value is null then
    if v_old is null then raise exception 'no_change'; end if;
    delete from public.admin_settings where key = p_key;
  elsif v_old is not null and v_old = p_value then
    raise exception 'no_change';
  else
    -- An unknown key fails the table's CHECK here, which is the point.
    insert into public.admin_settings (key, value, updated_by)
    values (p_key, p_value, p_actor)
    on conflict (key) do update
      set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  end if;

  insert into public.admin_audit_log
    (actor_id, area, action, target_type, target_id, from_value, to_value, reason)
  values (p_actor, 'config', 'setting_changed', 'setting', p_key, v_old, p_value, v_reason);

  return jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value);
end;
$$;

revoke execute on function public.admin_set_setting(uuid, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_setting(uuid, text, jsonb, text)
  to service_role;

create table if not exists public.cron_runs (
  id           bigserial primary key,
  job          text not null,
  started_at   timestamptz not null,
  finished_at  timestamptz not null default now(),
  ok           boolean not null,
  -- Counts and short status words only. Never names, addresses or content.
  summary      jsonb not null default '{}'::jsonb
);

create index if not exists cron_runs_finished_idx on public.cron_runs (finished_at desc);

alter table public.cron_runs enable row level security;
revoke all on public.cron_runs from anon, authenticated, service_role;
grant select, insert on public.cron_runs to service_role;
grant usage, select on sequence public.cron_runs_id_seq to service_role;
