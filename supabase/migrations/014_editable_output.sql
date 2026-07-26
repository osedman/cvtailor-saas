-- Editable output: the user can rewrite the tailored CV and the cover letter
-- by hand after a run. The edited CV is written straight back into the
-- `result` jsonb (result.tailoredCV), so every existing reader — history list,
-- Word/txt download, tracker sync — picks up the edit with no change. The
-- untouched AI version is preserved on first edit under
-- result.tailoredCVOriginal so "Revert to AI version" stays possible.
--
-- The cover letter had no home at all (it was generated client-side and thrown
-- away on reload), so it gets its own column. Idempotent.

alter table public.tailor_history
  add column if not exists cover_letter text,
  add column if not exists edited_at    timestamptz;

comment on column public.tailor_history.cover_letter is
  'Generated cover letter, plus any user edits to it. Null until generated.';
comment on column public.tailor_history.edited_at is
  'Last time the user hand-edited the CV or cover letter on this run.';
