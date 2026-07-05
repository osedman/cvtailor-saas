-- Identical-rerun cache for /api/tailor: the extraction pass is
-- non-deterministic, so re-running the exact same CV + job description
-- produced a different match score every time (and burned API cost).
-- input_hash lets the route return the stored result for exact re-runs.

alter table public.tailor_history
  add column if not exists input_hash text;

create index if not exists tailor_history_user_input_hash
  on public.tailor_history (user_id, input_hash);
