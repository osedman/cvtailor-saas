-- Core means the North Star, and nothing else.
--
-- Decision (Ose, 28 Jul 2026): every skill Tailr researches for the chosen
-- North Star role is CORE. Every skill that arrives from a job description — a
-- tailor run's gaps, "add to my path" from the results screen — lives in a
-- separate UPSKILL section and stays there permanently. No promotion.
--
-- The old value 'quick' described SIZE (a small, auto-captured win). The
-- distinction that matters to a user is ORIGIN, so the value is renamed to say
-- what it actually means. Effort still decides what auto-captures versus what
-- needs an explicit accept — that rule is unchanged, it just no longer names
-- the horizon.
--
-- Idempotent: safe to re-run, and safe on an already-migrated environment.

-- 1. Widen the constraint first so both values are legal during the rewrite.
alter table public.career_roadmap_items
  drop constraint if exists career_roadmap_items_horizon_check;

alter table public.career_roadmap_items
  add constraint career_roadmap_items_horizon_check
  check (horizon in ('quick', 'upskill', 'core'));

-- 2. Rename existing rows.
update public.career_roadmap_items
   set horizon = 'upskill'
 where horizon = 'quick';

-- 3. REPAIR: anything that came from a tailor run is upskill by definition,
--    whatever horizon it was written with. The `add-skill-for-jd` path called
--    addItems() without a horizon, and the column defaults to 'core' — so
--    JD-derived skills have been silently landing on the North Star path and
--    inflating its readiness. This is the bug that prompted the change.
update public.career_roadmap_items
   set horizon = 'upskill'
 where horizon = 'core'
   and (source = 'tailor_run' or source_run_id is not null);

-- 4. Narrow the constraint to the final vocabulary.
alter table public.career_roadmap_items
  drop constraint if exists career_roadmap_items_horizon_check;

alter table public.career_roadmap_items
  add constraint career_roadmap_items_horizon_check
  check (horizon in ('upskill', 'core'));

-- 5. The default must be explicit rather than inherited: a future caller that
--    forgets the horizon should NOT silently land on the North Star path again.
--    'core' stays the default because North Star generation is the only writer
--    that legitimately omits it, but the code now always passes it explicitly.
alter table public.career_roadmap_items
  alter column horizon set default 'core';
