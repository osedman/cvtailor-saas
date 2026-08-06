-- Plan review (design handoff Screen C): after locking a North Star the user
-- sees a short LEARN/BUILD plan for the top missing skills before the living
-- path opens. This records that they've been through it, so the review is a
-- one-time gate rather than something that reappears on every visit.
--
-- Null = never reviewed (show the plan). Set on either "Start first skill" or
-- "Save plan for later"; cleared when a new North Star is locked so the review
-- runs again for the new target.
alter table public.career_roadmaps
  add column if not exists plan_started_at timestamptz;

-- Backfill EXISTING paths as already-reviewed. Without this, everyone with a
-- live path gets sent back to a "review your plan" gate for a path they have
-- been working for weeks — the review is for newly locked targets only.
update public.career_roadmaps
   set plan_started_at = coalesce(updated_at, created_at, now())
 where plan_started_at is null
   and target_role is not null
   and target_role <> '';
