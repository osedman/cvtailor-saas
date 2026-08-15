-- Tailr — migration 14: make the consent record true for BOTH switches.
--
-- The signed-off settings frame ("Consumer · Settings — matching opt-in")
-- promises: "Every time you change either switch we keep the date and the
-- exact wording you agreed to." Two things stopped that being true.
--
-- 1. matching_consent_events could not say WHICH switch. It was built for
--    quiet matching alone, so an enrichment change had nowhere to go.
--
-- 2. public.profiles.recruiter_visibility was directly writable. `authenticated`
--    holds UPDATE on every column of profiles and the RLS policy is
--    `auth.uid() = id`, so a client could flip the enrichment flag with no
--    record of when, or against what wording — the exact weakness that
--    justified giving matching its own opt-in in the first place. Leaving it
--    would have made the frame's promise a lie for one of the two switches it
--    was promising about.
--
-- Column-level REVOKE rather than a policy change: the rest of the profile
-- (name, country, cv_template, digest preference) stays user-writable exactly
-- as before. Only the two consent columns move behind the route that writes
-- the event in the same operation. Same pattern as role_recommendations, where
-- RLS says which rows and the column grant says which columns.
--
-- Nothing in the app writes recruiter_visibility today — it has never had a
-- UI — so this revokes a capability that was only ever reachable by hand.
--
-- Depends on: 20260815090000_quiet_matching.sql.
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. WHICH SWITCH
-- ============================================================
alter table public.matching_consent_events
  add column if not exists subject text not null default 'matching';

alter table public.matching_consent_events
  drop constraint if exists matching_consent_events_subject_check;
alter table public.matching_consent_events
  add constraint matching_consent_events_subject_check
  check (subject in ('matching', 'enrichment'));

comment on column public.matching_consent_events.subject is
  'Which opt-in this event is about. matching = "let roles find me" '
  '(public.match_preferences.matching_opt_in). enrichment = "show my evidence '
  'to a recruiter who already has my CV" (public.profiles.recruiter_visibility). '
  'They are separate purposes and revoke independently.';

-- The default exists so the ALTER can run against existing rows. New writes
-- must be explicit about which switch they describe, or a future enrichment
-- event silently files itself as a matching one.
alter table public.matching_consent_events
  alter column subject drop default;

create index if not exists matching_consent_events_user_subject_idx
  on public.matching_consent_events (user_id, subject, created_at desc);

-- ============================================================
-- 2. THE ENRICHMENT FLAG STOPS BEING DIRECTLY WRITABLE
-- ============================================================
revoke update (recruiter_visibility, recruiter_visibility_updated_at)
  on public.profiles from authenticated, anon;

-- anon could never satisfy the RLS policy anyway; revoked for symmetry so the
-- grant table stops implying a capability that does not exist.
