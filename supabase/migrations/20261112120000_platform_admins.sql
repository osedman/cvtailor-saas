-- Tailr — platform admins + the admin audit log (12 Nov 2026).
--
-- Phase 0 of the admin area. Until now "who is an admin" was two hardcoded
-- email lists in lib/admin.ts: adding someone meant a code change and a
-- deploy, in a public repo. And nothing recorded what an admin did —
-- agency.audit_log needs an agency_id, so a platform-level action had nowhere
-- to go.
--
-- 1. public.platform_admins — one row per person with admin access, keyed by
--    auth user, with a role:
--      viewer  — read the dashboards
--      support — fix access, reset limits, manage agency members
--      admin   — also create agencies, change configuration, manage this list
--    The owner address in lib/admin.ts stays as a break-glass admin that no
--    row here can remove, so an empty or missing table cannot lock the owner
--    out.
--
-- 2. public.admin_audit_log — append-only. Every admin write records who,
--    what, before, after and a mandatory reason. It holds ids and settings,
--    never CV text or candidate content. actor_id has NO foreign key on
--    purpose (same reasoning as agency.audit_log.candidate_id): deleting an
--    account must not delete the record of what it did.
--
-- 3. public.admin_set_platform_admin() — the only way the app changes the
--    list. It writes the change and its audit row in ONE transaction, so
--    there is never an admin change without a log entry.
--
-- Access: RLS on with no policies and every browser role revoked — only the
-- service role (server routes behind lib/admin-access.ts) can touch either
-- table. The service role itself cannot UPDATE, DELETE or TRUNCATE the log.
--
-- Idempotent. Run on tailr-staging, then production, BEFORE deploying the
-- code. (The code tolerates the table being absent — it falls back to the
-- lists in lib/admin.ts — but the Admins screen will not work until it is.)

create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users on delete cascade,
  role        text not null check (role in ('viewer', 'support', 'admin')),
  added_by    uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
grant select, insert, update, delete on public.platform_admins to service_role;

create table if not exists public.admin_audit_log (
  id           bigserial primary key,
  actor_id     uuid not null,
  area         text not null check (area in ('admins', 'users', 'agencies', 'config')),
  action       text not null,
  target_type  text not null default '',
  target_id    text not null default '',
  from_value   jsonb,
  to_value     jsonb,
  reason       text not null check (length(btrim(reason)) >= 3),
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_area_idx
  on public.admin_audit_log (area, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
-- Append-only, even for the server: read and insert, nothing else.
revoke all on public.admin_audit_log from service_role;
grant select, insert on public.admin_audit_log to service_role;
grant usage, select on sequence public.admin_audit_log_id_seq to service_role;

-- Add, change or remove (p_role null) one admin, with its audit row.
create or replace function public.admin_set_platform_admin(
  p_actor  uuid,
  p_target uuid,
  p_role   text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    text;
  v_action text;
begin
  if p_actor is null or p_target is null then
    raise exception 'missing_ids';
  end if;
  if p_actor = p_target then
    raise exception 'cannot_change_self';
  end if;
  if p_role is not null and p_role not in ('viewer', 'support', 'admin') then
    raise exception 'invalid_role';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'reason_required';
  end if;

  select role into v_old
    from public.platform_admins
   where user_id = p_target
     for update;

  if p_role is null then
    if v_old is null then
      raise exception 'not_an_admin';
    end if;
    delete from public.platform_admins where user_id = p_target;
    v_action := 'removed';
  elsif v_old is null then
    insert into public.platform_admins (user_id, role, added_by)
    values (p_target, p_role, p_actor);
    v_action := 'added';
  elsif v_old = p_role then
    raise exception 'no_change';
  else
    update public.platform_admins
       set role = p_role, updated_at = now()
     where user_id = p_target;
    v_action := 'role_changed';
  end if;

  insert into public.admin_audit_log
    (actor_id, area, action, target_type, target_id, from_value, to_value, reason)
  values (
    p_actor, 'admins', v_action, 'user', p_target::text,
    case when v_old is null then null else jsonb_build_object('role', v_old) end,
    case when p_role is null then null else jsonb_build_object('role', p_role) end,
    btrim(p_reason)
  );

  return jsonb_build_object('action', v_action, 'from', v_old, 'to', p_role);
end;
$$;

revoke execute on function public.admin_set_platform_admin(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_platform_admin(uuid, uuid, text, text)
  to service_role;
