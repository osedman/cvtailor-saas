-- Tailr — security + speed pass on the public schema (30 Sep 2026).
--
-- From the Supabase advisors on tailr-staging, each finding checked against
-- the live schema and the app code before changing anything.
--
-- SECURITY
--
-- 1. profiles: a signed-in user could PATCH their own `plan` and
--    `tailors_used` (and `email`) straight through the REST API with the
--    public key. Raised in 20260815180000_lock_enrichment_columns.sql and never
--    fixed. The only user-scoped write the app makes is cv_template
--    (app/api/preferences/route.ts); plan, usage, email and the consent
--    columns move only through the service role, which this does not touch.
--
-- 2. increment_tailors_used(user_id): SECURITY DEFINER, callable by anyone
--    with any id — so anyone could run up anyone else's usage counter. It now
--    only ever counts the caller's own row, and anon cannot call it. The
--    tailor route still calls it with the user's session, unchanged.
--
-- 3. consume_rate_limit(p_user_id, …): SECURITY DEFINER, callable by anon —
--    so anyone could burn another user's rate-limit budget and lock them out
--    of tailoring and sign-in codes. The app only calls it with the service
--    role (lib/rate-limit.ts), so browsers lose it entirely.
--
-- 4. Trigger functions (handle_new_user, guard_recommendation_state) were
--    exposed as RPC endpoints. Firing a trigger does not check EXECUTE, so
--    revoking it changes nothing for the triggers and closes the endpoint.
--
-- 5. Pinned search_path on the two functions that had none.
--
-- SPEED
--
-- 6. 38 row-security policies called auth.uid() once PER ROW. Wrapped in
--    (select auth.uid()) Postgres evaluates it once per query. Same rule, same
--    rows, only the plan changes. ALTER POLICY keeps each policy in place —
--    there is no moment without it.
--
-- 7. Six foreign keys with no index behind them.
--
-- Idempotent: safe to re-run. Run on staging, then production, before or
-- after the code — no code depends on it.

-- ── 1. profiles: a user may edit their name, country and CV template ─────
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, country, cv_template, updated_at) on public.profiles to authenticated;

-- ── 2. increment_tailors_used: your own counter only ──────────────────────
create or replace function public.increment_tailors_used(user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set tailors_used = tailors_used + 1,
         updated_at = now()
   where id = user_id
     and id = (select auth.uid());
$$;
revoke execute on function public.increment_tailors_used(uuid) from public, anon;
grant execute on function public.increment_tailors_used(uuid) to authenticated, service_role;

-- ── 3. consume_rate_limit: server only ────────────────────────────────────
revoke execute on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;

-- ── 4. trigger functions are not endpoints ────────────────────────────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.guard_recommendation_state() from public, anon, authenticated;

-- ── 5. pinned search_path ─────────────────────────────────────────────────
alter function public.set_updated_at() set search_path = '';
alter function public.matching_evidence_is_well_formed(jsonb) set search_path = '';

-- ── 6. auth.uid() once per query, not once per row ────────────────────────
alter policy "arc shares are self deletable" on public.career_arc_shares
  using (((select auth.uid()) = user_id));
alter policy "arc shares are self insertable" on public.career_arc_shares
  with check (((select auth.uid()) = user_id));
alter policy "arc shares are self readable" on public.career_arc_shares
  using (((select auth.uid()) = user_id));
alter policy "arc shares are self updatable" on public.career_arc_shares
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy career_evidence_delete on public.career_evidence
  using (((select auth.uid()) = user_id));
alter policy career_evidence_insert on public.career_evidence
  with check (((select auth.uid()) = user_id));
alter policy career_evidence_select on public.career_evidence
  using (((select auth.uid()) = user_id));
alter policy career_evidence_update on public.career_evidence
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own career profile" on public.career_profiles
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own career profile" on public.career_profiles
  with check (((select auth.uid()) = user_id));
alter policy "Users can read own career profile" on public.career_profiles
  using (((select auth.uid()) = user_id));
alter policy "Users can update own career profile" on public.career_profiles
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own roadmap items" on public.career_roadmap_items
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own roadmap items" on public.career_roadmap_items
  with check (((select auth.uid()) = user_id));
alter policy "Users can read own roadmap items" on public.career_roadmap_items
  using (((select auth.uid()) = user_id));
alter policy "Users can update own roadmap items" on public.career_roadmap_items
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own roadmap" on public.career_roadmaps
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own roadmap" on public.career_roadmaps
  with check (((select auth.uid()) = user_id));
alter policy "Users can read own roadmap" on public.career_roadmaps
  using (((select auth.uid()) = user_id));
alter policy "Users can update own roadmap" on public.career_roadmaps
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own CV evidence" on public.cv_evidence_items
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own CV evidence" on public.cv_evidence_items
  with check (((select auth.uid()) = user_id));
alter policy "Users can read own CV evidence" on public.cv_evidence_items
  using (((select auth.uid()) = user_id));
alter policy "Users can update own CV evidence" on public.cv_evidence_items
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own first CV" on public.first_cvs
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own first CV" on public.first_cvs
  with check (((select auth.uid()) = user_id));
alter policy "Users can read own first CV" on public.first_cvs
  using (((select auth.uid()) = user_id));
alter policy "Users can update own first CV" on public.first_cvs
  using (((select auth.uid()) = user_id));
alter policy "Users can delete own jobs" on public.job_tracker
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own jobs" on public.job_tracker
  with check (((select auth.uid()) = user_id));
alter policy "Users can read own jobs" on public.job_tracker
  using (((select auth.uid()) = user_id));
alter policy "Users can update own jobs" on public.job_tracker
  using (((select auth.uid()) = user_id));
alter policy "Users can read their own profile" on public.profiles
  using (((select auth.uid()) = id));
alter policy "Users can update their own profile" on public.profiles
  using (((select auth.uid()) = id));
alter policy "Users can delete own history" on public.tailor_history
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own history" on public.tailor_history
  with check (((select auth.uid()) = user_id));
alter policy "Users can read own history" on public.tailor_history
  using (((select auth.uid()) = user_id));
alter policy "Users can update own history" on public.tailor_history
  using (((select auth.uid()) = user_id));

-- ── 7. indexes behind foreign keys ────────────────────────────────────────
create index if not exists career_evidence_profile_id_fk_idx on public.career_evidence (profile_id);
create index if not exists career_roadmap_items_roadmap_id_fk_idx on public.career_roadmap_items (roadmap_id);
create index if not exists job_tracker_history_id_fk_idx on public.job_tracker (history_id);
create index if not exists mailing_list_user_id_fk_idx on public.mailing_list (user_id);
create index if not exists match_scan_marks_user_id_fk_idx on public.match_scan_marks (user_id);
create index if not exists role_recommendations_tailor_history_id_fk_idx on public.role_recommendations (tailor_history_id);
