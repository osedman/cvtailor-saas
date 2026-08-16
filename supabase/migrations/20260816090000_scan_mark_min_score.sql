-- Tailr — migration 18: the threshold was one-way.
--
-- match_scan_marks records WHAT WAS ASSESSED — (profile_hash,
-- requirements_hash) — so an unchanged pair is never re-assessed. That is the
-- cost model, and it was right about evidence and requirements. It was wrong
-- about the threshold.
--
-- The scan writes a recommendation only for people who clear min_score at the
-- moment they are assessed, and deliberately stores NO SCORE for anyone who
-- does not (a score for someone who did not match is a judgement about a
-- person kept where they cannot see it — migration 16's header). So:
--
--   scan at 40  → person scores 31 → no recommendation, mark written
--   drop to 20  → profile and requirements are unchanged → SKIPPED
--   drop to 1   → still skipped. Forever.
--
-- A recruiter could raise the bar but never lower it. Found by lowering it on
-- staging and watching nothing happen — the mark said "already assessed" and
-- the scan believed it.
--
-- The fix keeps the privacy property rather than trading it away: the mark now
-- includes the threshold it was assessed against, so changing the threshold
-- invalidates it and the person is assessed again. That costs a model call
-- instead of storing the scores of people who did not match. The right way
-- round — cost is ours, the score would be theirs.
--
-- Backfill: existing marks take the CURRENT min_score of their published role,
-- which is exactly the threshold they were assessed against (nothing has
-- changed a threshold since these marks were written). Anything that cannot be
-- resolved is left NULL and will simply be re-assessed, which is the safe
-- direction.
--
-- Idempotent: safe to re-run.

alter table public.match_scan_marks
  add column if not exists min_score smallint;

update public.match_scan_marks m
   set min_score = p.min_score
  from public.published_roles p
 where p.id = m.published_role_id
   and m.min_score is null;

comment on column public.match_scan_marks.min_score is
  'The threshold this assessment was judged against. Part of the skip key: '
  'change the threshold and the mark no longer applies, so the person is '
  'assessed again rather than silently skipped. Nullable — a NULL mark is '
  'treated as stale and re-assessed, which is the safe direction.';
