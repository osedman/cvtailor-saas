-- North Star career-path rework:
--  1. profiles.country — grounds course/resource suggestions in the user's
--     market (default GB) so UK users aren't steered to US-only providers.
--  2. career_roadmaps.target_skills — the chosen North Star's full demanded
--     skill set, each judged have/missing against the CV. This is the "60" the
--     user wants to SEE and click, and it powers readiness for an AI-chosen
--     target (vs one merely derived from tailor history).
--  3. career_roadmaps.findings — the cached career-coach CV analysis
--     (strengths-first + gaps) shown on the scan screen.
-- Idempotent.

alter table public.profiles
  add column if not exists country text not null default 'GB';
-- country: ISO-3166 alpha-2, grounds region-aware resource sourcing.

alter table public.career_roadmaps
  add column if not exists target_skills jsonb not null default '[]'::jsonb;
-- target_skills: [{ skill, have: boolean, importance: 'core'|'common'|'edge' }]

alter table public.career_roadmaps
  add column if not exists findings jsonb not null default '{}'::jsonb;
-- findings: { headline, strengths:[{label,detail}], gaps:[{label,detail}] }
