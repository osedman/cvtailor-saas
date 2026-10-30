-- Repair for 20260905120000_discoverable.sql, which failed part-way on
-- staging (6 Sep 2026).
--
-- What happened: part 1 dropped matching_consent_events_subject_check and
-- tried to re-add it with three values — but 20260816120000 had already
-- widened the set to include 'application', which apply_matched_recommendation
-- writes for every apply. Nine such rows existed, the ADD failed, and the
-- statements after it never ran. So at this moment the table has NO subject
-- constraint, and neither `invited` nor agency.matched_people exists.
--
-- This file restores the constraint with the full set and then runs parts
-- 2 and 3 exactly as the original has them (both idempotent). The original
-- file is corrected too, so a fresh environment runs it cleanly; on
-- staging, run only this one.

alter table public.matching_consent_events
  drop constraint if exists matching_consent_events_subject_check;
alter table public.matching_consent_events
  add constraint matching_consent_events_subject_check
  check (subject in ('matching', 'enrichment', 'application', 'discoverable'));

-- The columns part 1 added before the failure; harmless if present.
alter table public.match_preferences
  add column if not exists discoverable    boolean not null default false,
  add column if not exists discoverable_at timestamptz;

-- 2. invited
alter table public.role_recommendations
  add column if not exists invited_at timestamptz;
alter table public.role_recommendations
  drop constraint if exists role_recommendations_state_check;
alter table public.role_recommendations
  add constraint role_recommendations_state_check
  check (state in ('new', 'seen', 'dismissed', 'applied', 'invited'));

create or replace function public.guard_recommendation_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- applied and invited are set by application routes, never by the client.
  if new.state in ('applied', 'invited') and old.state is distinct from new.state then
    if auth.role() is distinct from 'service_role'
       and current_user not in ('service_role', 'postgres')
    then
      raise exception '% is set by the application route, not by the client', new.state;
    end if;
  end if;

  -- Applying is terminal. Dismissing afterwards would imply the bundle could
  -- be recalled, which it cannot — withdrawal is a separate, explicit path.
  if old.state = 'applied' and new.state <> 'applied' then
    raise exception 'an application cannot be un-applied';
  end if;

  if new.state = 'seen' and new.seen_at is null then
    new.seen_at := now();
  end if;
  if new.state = 'dismissed' and new.dismissed_at is null then
    new.dismissed_at := now();
  end if;
  if new.state = 'invited' and new.invited_at is null then
    new.invited_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 3. The list
create or replace function agency.matched_people(p_role_id uuid)
returns table (
  recommendation_id uuid,
  user_id           uuid,
  full_name         text,
  headline          text,
  score             numeric,
  evidence          jsonb,
  state             text,
  invited_at        timestamptz,
  applied_at        timestamptz
)
language sql
security definer
set search_path = public, agency
as $$
  select
    r.id,
    r.user_id,
    p.full_name,
    cp.sections ->> 'headline',
    r.score,
    r.evidence,
    r.state,
    r.invited_at,
    r.applied_at
  from public.role_recommendations r
  join public.published_roles pr on pr.id = r.published_role_id
  join public.match_preferences mp
    on mp.user_id = r.user_id
   and mp.discoverable = true
   and mp.matching_opt_in = true
  left join public.profiles p on p.id = r.user_id
  left join public.career_profiles cp on cp.user_id = r.user_id
  where pr.role_id = p_role_id
    and pr.status = 'live'
    and r.score >= pr.min_score
    and r.state <> 'dismissed'
  order by r.score desc, r.created_at asc
$$;

revoke all on function agency.matched_people(uuid) from public;
revoke all on function agency.matched_people(uuid) from anon, authenticated;
grant execute on function agency.matched_people(uuid) to service_role;
