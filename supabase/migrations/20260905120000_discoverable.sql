-- Discoverable: the third consumer switch, and the recruiter's matched list.
--
-- Until now the recruiter saw a rounded bucket and nobody (matched_bucket),
-- and the settings copy promised exactly that. Ose's call (4 Sep 2026): show
-- the recruiter the people who match a published role. It is lawful only
-- because of a THIRD switch, off by default, that is the consent for the
-- listing alone: `match_preferences.discoverable`. The CV and contact
-- details still arrive only when the person applies.
--
-- Three parts:
--   1. The switch, beside the matching switch it depends on. No authenticated
--      write path (match_preferences has none); setConsent() writes it with
--      its consent event, as the other two are written.
--   2. `invited` as a recommendation state, settable only by the service
--      role (the guard trigger, same rule as `applied`), so a recruiter's
--      invitation shows on the person's /found card.
--   3. agency.matched_people(role_id): the ONE read of the list, joining the
--      recommendation to the opt-in inside the database. Execute is granted
--      to service_role only, so the wall is structural, not a route filter.
--      A person with the switch off is never in the result.
--
-- Run in tailr-staging first. Idempotent.

-- 1. The switch
alter table public.match_preferences
  add column if not exists discoverable    boolean not null default false,
  add column if not exists discoverable_at timestamptz;

comment on column public.match_preferences.discoverable is
  'Consent for the LISTING: recruiters whose roles match may see name, headline, band and the matched evidence, and invite. Off by default. CV and contact details still only on application.';

alter table public.matching_consent_events
  drop constraint if exists matching_consent_events_subject_check;
alter table public.matching_consent_events
  add constraint matching_consent_events_subject_check
  check (subject in ('matching', 'enrichment', 'discoverable'));

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
