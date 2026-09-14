-- The tailored CV retires when EITHER side moves, not just the role's.
--
-- THE BUG. role_recommendations.tailor_history_id points at a tailor RUN.
-- Applying sends that run's document, guarded only by
--
--   rec.tailored_against_hash = snapshot.requirements_hash
--
-- which fingerprints THE ROLE. Republish with changed requirements and the
-- tailored CV retires correctly. Change the PERSON and nothing happens: a
-- user who updates their evidence bank and then applies to a role they
-- tailored last week sends the old document, while /found still shows the
-- role as tailored because it applies the same one-sided check.
--
-- THE FIX. Store a fingerprint of the person's side at link time too, and
-- require both to match. One axis was guarded; there were always two.
--
-- WHAT THIS CANNOT COVER, deliberately. The CV a user pastes into the
-- tailor screen is never stored server-side — it lives in their browser and
-- arrives per run — so "they pasted a different CV and did not re-tailor"
-- is not knowable here and no column can make it so. That axis is handled
-- by disclosure instead: /found already names the day the tailored CV was
-- saved ("12 Sep, edits included") so the person can see what will be sent.
--
-- NULL means "made before this column existed" and is treated as NOT
-- provable, so those links fall back to the evidence bank until the person
-- tailors again. That is the conservative direction on a document that goes
-- to an employer, and re-tailoring identical inputs is a free cache hit on
-- /api/tailor's input_hash.
--
-- No grant work: the client UPDATE grant on this table is column-scoped to
-- (state, seen_at, dismissed_at), so a new column is unwritable by
-- authenticated the moment it exists. Only the service role writes it.
--
-- Idempotent: safe to re-run.

alter table public.role_recommendations
  add column if not exists tailored_source_hash text;

comment on column public.role_recommendations.tailored_source_hash is
  'sha256 of the evidence-bank render the tailored CV was made from. With '
  'tailored_against_hash (the role side) this makes the tailored link retire '
  'when either side moves. NULL = predates the column, treated as unprovable.';
