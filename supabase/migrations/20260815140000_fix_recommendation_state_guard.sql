-- Tailr for Agencies — migration 13: the state guard was unreachable.
--
-- Migration 12 shipped public.guard_recommendation_state() as SECURITY
-- DEFINER. It should never have been: the function reads and writes only NEW
-- and OLD, and touches no table, so it needs no elevated privileges at all.
--
-- SECURITY DEFINER rewrites current_user to the function's OWNER. Proven on
-- staging, same session, same JWT:
--
--   inside SECURITY DEFINER : current_user=postgres      auth.role=authenticated
--   inside a normal function: current_user=authenticated auth.role=authenticated
--
-- So the guard
--
--   if auth.role() is distinct from 'service_role'
--      and current_user not in ('service_role', 'postgres')
--
-- always evaluated its second half to FALSE, and the exception never fired.
-- An ordinary signed-in client could set their own recommendation to
-- 'applied'. Verified by doing it: the column grant correctly refused an
-- attempt to rewrite `score` in the same transaction, which proves the session
-- really was `authenticated` and the state write really did get through.
--
-- What it cost: nothing crosses the wall — only POST /api/found/[id]/apply
-- sends anything to an agency, and no such route exists yet. The damage is
-- that 'applied' is TERMINAL by design ("an application cannot be un-applied"),
-- so a client could permanently strand their own recommendation in a state
-- that says a bundle was sent when none was.
--
-- The lesson is the one this repo keeps relearning: the second clause was
-- added for robustness, after noticing auth.role() is null on a direct
-- connection. It was the addition that opened the hole. auth.role() alone had
-- been correct.
--
-- Depends on: 20260815090000_quiet_matching.sql.
-- Idempotent: safe to re-run.

create or replace function public.guard_recommendation_state()
returns trigger
language plpgsql
-- Invoker rights, deliberately. current_user is then the role actually doing
-- the write — 'authenticated' for a client, 'service_role' for a PostgREST
-- service call, 'postgres' for a direct admin session.
set search_path = public
as $$
begin
  if new.state = 'applied' and old.state is distinct from 'applied' then
    -- Two ways to be the service role, because auth.role() reads a JWT claim
    -- and is NULL on a direct database connection, while current_user is set
    -- on every path. A superuser could disable this trigger anyway, so
    -- refusing them would only be theatre.
    if auth.role() is distinct from 'service_role'
       and current_user not in ('service_role', 'postgres')
    then
      raise exception 'applied is set by the application route, not by the client';
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
  new.updated_at := now();
  return new;
end;
$$;

-- The trigger itself is unchanged and still bound to this function name.
