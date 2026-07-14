-- Upskill: a per-application plan to close THIS job's gaps, generated on demand
-- from a tailor run's flagged gaps and tracked on the run itself. Distinct from
-- the cross-application career_roadmaps (which aggregate recurring weak skills).
-- Idempotent.

alter table public.tailor_history
  add column if not exists upskill jsonb not null default '[]'::jsonb;
-- upskill: [{ skill, whyItMatters, resources:[{title,url,source}],
--            projectBrief, cvPhrasing, status: 'todo'|'in_progress'|'done' }]
