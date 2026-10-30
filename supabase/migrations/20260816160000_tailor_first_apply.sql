-- ============================================================
-- Migration 20 · Tailor-first apply
-- ============================================================
-- A recommendation may carry a link to the tailor_history row the person
-- produced FOR THIS ROLE, so applying can send their tailored CV instead of
-- the evidence-bank render. Two columns, both service-role-written:
--
--   tailor_history_id     — the person's own tailored CV for this role.
--                           on delete set null: deleting your history must
--                           never break (or reveal anything about) a
--                           recommendation.
--   tailored_against_hash — requirements_hash of the snapshot the tailor run
--                           was briefed with. Apply honours the link ONLY
--                           while this equals the snapshot's current hash;
--                           a republish with changed requirements silently
--                           retires the tailored CV rather than sending a
--                           document tailored to requirements that no longer
--                           exist. Same stale ethos as the apply gate itself.
--
-- DELIBERATELY NOT in the authenticated UPDATE column grant (which stays
-- state/seen_at/dismissed_at): the link is set by the tailor route on the
-- service role, after it has verified the history row belongs to the caller.
-- A client-writable link column would let a session link a history id it
-- cannot prove is its own — RLS checks the recommendation's owner, not the
-- target row's.
--
-- The SELECT grant on role_recommendations is table-level, so the consumer
-- page can read both columns without any new grant.

alter table public.role_recommendations
  add column if not exists tailor_history_id uuid
    references public.tailor_history(id) on delete set null,
  add column if not exists tailored_against_hash text;

comment on column public.role_recommendations.tailor_history_id is
  'The person''s own tailored CV for this role (tailor_history). Service-role-written by the tailor route; sent at apply instead of the evidence-bank render while tailored_against_hash still matches the snapshot.';
comment on column public.role_recommendations.tailored_against_hash is
  'requirements_hash of the published snapshot the tailor run was briefed with. Apply ignores the tailored CV when this differs from the snapshot''s current hash.';
