-- Tailr — admin operations on agencies (14 Nov 2026).
--
-- Phase 1 of the admin area. "Agency creation stays manual" (the header of
-- app/api/agency/team/route.ts) has meant hand-written SQL for every new
-- agency, and an agency whose only owner is locked out had nobody who could
-- help. These three functions are the named operations the admin area needs.
--
-- Each one makes its change AND writes both audit rows in a single
-- transaction:
--   - public.admin_audit_log   who at Tailr did it, with their reason
--   - agency.audit_log         so the agency's own audit page shows that
--                              Tailr support changed something. actor_id is
--                              left NULL there on purpose: the page labels any
--                              non-null actor "A teammate", and a Tailr admin
--                              is not one. The reason carries "Tailr support:".
--
-- Nothing here touches roles, candidates or their data. In particular nothing
-- closes a role (closing starts the retention purge) and nothing deletes a
-- member — access is removed by suspension, which keeps their audit history,
-- the same rule the owner-facing team screen follows.
--
-- Server-only: EXECUTE is revoked from every browser role; only the service
-- role (routes behind lib/admin-access.ts) can call them.
--
-- Requires 20261112120000_platform_admins.sql. Idempotent. Run on
-- tailr-staging, then production, BEFORE deploying the code that calls them.

-- ── 1. Create an agency with its first owner ──────────────────────────────
create or replace function public.admin_create_agency(
  p_actor  uuid,
  p_name   text,
  p_slug   text,
  p_owner  uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text := btrim(coalesce(p_name, ''));
  v_slug   text := lower(btrim(coalesce(p_slug, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id     uuid;
begin
  if p_actor is null or p_owner is null then raise exception 'missing_ids'; end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'invalid_name'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) < 3 or length(v_slug) > 60 then
    raise exception 'invalid_slug';
  end if;
  if exists (select 1 from agency.agencies where slug = v_slug) then
    raise exception 'slug_taken';
  end if;

  insert into agency.agencies (name, slug) values (v_name, v_slug) returning id into v_id;

  insert into agency.members (agency_id, user_id, role, status, invited_by)
  values (v_id, p_owner, 'owner', 'active', p_actor);

  insert into agency.audit_log (agency_id, actor_id, entity_type, entity_ref, action, to_value, reason)
  values (v_id, null, 'member', p_owner::text, 'invited',
          jsonb_build_object('role', 'owner', 'status', 'active'),
          'Tailr support: agency set up');

  insert into public.admin_audit_log (actor_id, area, action, target_type, target_id, to_value, reason)
  values (p_actor, 'agencies', 'agency_created', 'agency', v_id::text,
          jsonb_build_object('name', v_name, 'slug', v_slug, 'owner_id', p_owner),
          v_reason);

  return v_id;
end;
$$;

-- ── 2. Add a member, change their role, suspend or reactivate them ────────
-- p_role / p_status null = leave as it is. A new member needs a role.
create or replace function public.admin_set_agency_member(
  p_actor  uuid,
  p_agency uuid,
  p_user   uuid,
  p_role   text,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason     text := btrim(coalesce(p_reason, ''));
  v_old_role   text;
  v_old_status text;
  v_new_role   text;
  v_new_status text;
  v_action     text;
  v_from       jsonb;
  v_to         jsonb;
begin
  if p_actor is null or p_agency is null or p_user is null then raise exception 'missing_ids'; end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;
  if p_role is not null and p_role not in ('owner', 'recruiter', 'viewer') then
    raise exception 'invalid_role';
  end if;
  if p_status is not null and p_status not in ('active', 'suspended') then
    raise exception 'invalid_status';
  end if;

  -- Serialise changes to one agency's team, so two concurrent demotions
  -- cannot each see the other as the remaining owner.
  perform 1 from agency.agencies where id = p_agency for update;
  if not found then raise exception 'agency_not_found'; end if;

  select role, status into v_old_role, v_old_status
    from agency.members
   where agency_id = p_agency and user_id = p_user
     for update;

  if v_old_role is null then
    if p_role is null then raise exception 'role_required'; end if;
    v_new_role := p_role;
    v_new_status := coalesce(p_status, 'active');
    insert into agency.members (agency_id, user_id, role, status, invited_by)
    values (p_agency, p_user, v_new_role, v_new_status, p_actor);
    v_action := 'invited';
    v_from := null;
  else
    v_new_role := coalesce(p_role, v_old_role);
    -- An 'invited' row that support touches becomes active unless told otherwise.
    v_new_status := coalesce(p_status, case when v_old_status = 'invited' then 'active' else v_old_status end);
    if v_new_role = v_old_role and v_new_status = v_old_status then
      raise exception 'no_change';
    end if;
    update agency.members
       set role = v_new_role, status = v_new_status, updated_at = now()
     where agency_id = p_agency and user_id = p_user;
    v_action := case when v_new_status = 'suspended' and v_old_status <> 'suspended'
                     then 'suspended' else 'changed' end;
    v_from := jsonb_build_object('role', v_old_role, 'status', v_old_status);
  end if;

  -- An agency must always keep someone who can run it.
  if not exists (
    select 1 from agency.members
     where agency_id = p_agency and role = 'owner' and status = 'active'
  ) then
    raise exception 'last_owner';
  end if;

  v_to := jsonb_build_object('role', v_new_role, 'status', v_new_status);

  insert into agency.audit_log (agency_id, actor_id, entity_type, entity_ref, action, from_value, to_value, reason)
  values (p_agency, null, 'member', p_user::text, v_action, v_from, v_to,
          'Tailr support: ' || v_reason);

  insert into public.admin_audit_log (actor_id, area, action, target_type, target_id, from_value, to_value, reason)
  values (p_actor, 'agencies', 'member_' || v_action, 'agency', p_agency::text,
          case when v_from is null then jsonb_build_object('user_id', p_user)
               else v_from || jsonb_build_object('user_id', p_user) end,
          v_to || jsonb_build_object('user_id', p_user),
          v_reason);

  return jsonb_build_object('action', v_action, 'role', v_new_role, 'status', v_new_status);
end;
$$;

-- ── 3. Agency name, retention window, notice delay ────────────────────────
-- Nulls leave a value as it is. Bounds match lib/agency/settings-limits.ts
-- and the table's own checks; the notice cap (28 days) is not adjustable.
create or replace function public.admin_update_agency_settings(
  p_actor     uuid,
  p_agency    uuid,
  p_name      text,
  p_retention integer,
  p_notice    integer,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
  v_before agency.agencies%rowtype;
  v_from   jsonb;
  v_to     jsonb;
begin
  if p_actor is null or p_agency is null then raise exception 'missing_ids'; end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;
  if v_name is not null and (length(v_name) < 2 or length(v_name) > 120) then
    raise exception 'invalid_name';
  end if;
  if p_retention is not null and (p_retention < 1 or p_retention > 3650) then
    raise exception 'invalid_retention';
  end if;
  if p_notice is not null and (p_notice < 0 or p_notice > 28) then
    raise exception 'invalid_notice';
  end if;

  select * into v_before from agency.agencies where id = p_agency for update;
  if not found then raise exception 'agency_not_found'; end if;

  v_from := jsonb_build_object('name', v_before.name, 'retention_days', v_before.retention_days,
                               'notice_delay_days', v_before.notice_delay_days);
  v_to := jsonb_build_object('name', coalesce(v_name, v_before.name),
                             'retention_days', coalesce(p_retention, v_before.retention_days),
                             'notice_delay_days', coalesce(p_notice, v_before.notice_delay_days));
  if v_from = v_to then raise exception 'no_change'; end if;

  update agency.agencies
     set name = v_to->>'name',
         retention_days = (v_to->>'retention_days')::integer,
         notice_delay_days = (v_to->>'notice_delay_days')::integer,
         updated_at = now()
   where id = p_agency;

  -- Same shape the owner-facing settings screen writes (lib/agency/settings.ts).
  insert into agency.audit_log (agency_id, actor_id, entity_type, entity_ref, action, from_value, to_value, reason)
  values (p_agency, null, 'role', 'settings', 'settings_changed', v_from, v_to,
          'Tailr support: ' || v_reason);

  insert into public.admin_audit_log (actor_id, area, action, target_type, target_id, from_value, to_value, reason)
  values (p_actor, 'agencies', 'settings_changed', 'agency', p_agency::text, v_from, v_to, v_reason);

  return v_to;
end;
$$;

revoke execute on function public.admin_create_agency(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_agency(uuid, text, text, uuid, text)
  to service_role;

revoke execute on function public.admin_set_agency_member(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_agency_member(uuid, uuid, uuid, text, text, text)
  to service_role;

revoke execute on function public.admin_update_agency_settings(uuid, uuid, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_agency_settings(uuid, uuid, text, integer, integer, text)
  to service_role;
