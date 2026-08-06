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
