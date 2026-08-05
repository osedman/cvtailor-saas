-- Tailr for Agencies — migration 6 of 6: consumer opt-in + enrichment bridge.
--
-- The ONLY door between the agency schema and consumer data. Everything about
-- it is shaped by three rules:
--
--   1. Off by default, revocable. recruiter_visibility on public.profiles,
--      toggled by the user through the existing "update own profile" RLS
--      policy. Revocation works on next fetch because agency code never
--      caches match results — no agency.consumer_links table exists, because
--      a stored "this person is a Tailr user" row is itself the disclosure.
--   2. Matched-but-not-opted-in is BYTE-IDENTICAL to unmatched: both return
--      null from the same code path. No flag, no different error, no timing
--      channel a recruiter could read as a signal.
--   3. The candidate's private data stays private. The snapshot exposes the
--      Career Arc (career_profiles.sections), the evidence bank
--      (career_evidence, respecting hidden=false and preferring the user's
--      own rephrasing), and coarse activity stats. It NEVER reads:
--      career_roadmaps, career_roadmap_items (the candidate's private view
--      of their own weaknesses), first_cvs, cv_evidence_items,
--      subscriptions, usage_logs. An app-side unit test should assert the
--      function body references none of those tables.
--
-- Caller contract (agency ingestion/scoring, service role only): call at
-- enrichment time and again before submission generation. A null return for
-- a candidate that previously had origin='tailr_profile' evidence means the
-- user revoked — delete those evidence rows and rescore. Evidence rows
-- derived from the snapshot are marked origin='tailr_profile' (migration 2)
-- and surface as the TAILR PROFILE indicator with visible effect in the
-- confidence/completeness sub-score.
--
-- Depends on: 20260805160000_agency_retention.sql (sequence only — this
-- migration touches public.*, and is the only one of the six that does).
-- Idempotent: safe to re-run against staging and production.

-- ============================================================
-- OPT-IN COLUMNS
-- ============================================================

alter table public.profiles
  add column if not exists recruiter_visibility boolean not null default false,
  add column if not exists recruiter_visibility_updated_at timestamptz;

-- Email resolution for the matcher.
create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

-- ============================================================
-- THE SNAPSHOT FUNCTION
--
-- SECURITY DEFINER + service-role-execute-ONLY. Never grant to
-- authenticated: any logged-in user could otherwise probe arbitrary emails
-- for Tailr membership, which is exactly the disclosure rule 2 forbids.
-- ============================================================

create or replace function public.recruiter_profile_snapshot(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile  record;
  v_arc      jsonb;
  v_evidence jsonb;
  v_stats    jsonb;
begin
  if p_email is null or btrim(p_email) = '' then
    return null;
  end if;

  select p.id, p.full_name, p.recruiter_visibility, p.recruiter_visibility_updated_at
    into v_profile
    from public.profiles p
   where lower(p.email) = lower(btrim(p_email))
   limit 1;

  -- Rule 2: unmatched and matched-without-opt-in exit identically.
  if not found or not v_profile.recruiter_visibility then
    return null;
  end if;

  -- Career Arc highlight reel (timeline, skills, growth, projects,
  -- qualities). Explicitly NOT the roadmap.
  select cp.sections
    into v_arc
    from public.career_profiles cp
   where cp.user_id = v_profile.id
   limit 1;

  -- Evidence bank: user-visible items only, user's own rephrasing preferred.
  select coalesce(jsonb_agg(jsonb_build_object(
           'category',       ce.category,
           'claim',          coalesce(nullif(ce.rephrased_text, ''), ce.claim),
           'source_role',    ce.source_role,
           'source_company', ce.source_company,
           'source_span',    ce.source_span,
           'pinned',         ce.pinned
         ) order by ce.pinned desc, ce.sort_order), '[]'::jsonb)
    into v_evidence
    from public.career_evidence ce
   where ce.user_id = v_profile.id
     and ce.hidden = false;

  -- Coarse activity signal for confidence/completeness — counts and dates
  -- only, never tailor content.
  select jsonb_build_object(
           'tailor_count_180d', count(*),
           'last_tailor_at',    max(th.created_at))
    into v_stats
    from public.tailor_history th
   where th.user_id = v_profile.id
     and th.created_at >= now() - interval '180 days';

  return jsonb_build_object(
    'opted_in',       true,
    'opted_in_at',    v_profile.recruiter_visibility_updated_at,
    'full_name',      v_profile.full_name,
    'career_profile', coalesce(v_arc, '{}'::jsonb),
    'evidence',       v_evidence,
    'activity',       v_stats
  );
end;
$$;

revoke execute on function public.recruiter_profile_snapshot(text)
  from public, anon, authenticated;
grant execute on function public.recruiter_profile_snapshot(text) to service_role;
