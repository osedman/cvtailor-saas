-- Tailr — migration 15: migration 14's revoke did nothing. This one works.
--
-- Migration 14 ran this, without error, and changed nothing:
--
--   revoke update (recruiter_visibility, recruiter_visibility_updated_at)
--     on public.profiles from authenticated, anon;
--
-- Because the grant it was trying to subtract from is TABLE-level, not
-- column-level. Confirmed on staging:
--
--   select unnest(relacl) from pg_class where oid='public.profiles'::regclass;
--   →  authenticated=arwdDxtm/postgres      -- 'w' = UPDATE on every column
--   select attacl from pg_attribute where attrelid='public.profiles'::regclass;
--   →  (none)
--
-- In PostgreSQL a column-level REVOKE cannot subtract from a table-wide
-- privilege. The table-level `w` keeps authorising every column, and
-- information_schema.column_privileges keeps listing all of them because it
-- derives its rows from the table grant. The statement is a silent no-op:
-- correct syntax, real columns, no error, no effect.
--
-- The fix is to drop the table-wide UPDATE and hand back an explicit column
-- list. Everything except the two consent columns is re-granted, so behaviour
-- is otherwise IDENTICAL to before — this migration is not the place to
-- relitigate what else a client may write.
--
-- Only one user-scoped write to this table exists in the app
-- (app/api/preferences/route.ts sets cv_template). path_digest_opt_out and
-- recruiter_visibility are written by the service role, which is unaffected.
--
-- ⚠ SEPARATE FINDING, NOT FIXED HERE: `plan` and `tailors_used` remain
-- client-writable under the same `auth.uid() = id` policy, so a signed-in
-- user can grant themselves a plan or reset their own usage counter. That is
-- a real hole and a different decision — raised for Ose rather than folded
-- into a consent migration.
--
-- Depends on: 20260815160000_consent_subject_and_lock.sql.
-- Idempotent: safe to re-run.

revoke update on public.profiles from authenticated, anon;

grant update (
  id,
  email,
  full_name,
  country,
  cv_template,
  path_digest_opt_out,
  plan,
  tailors_used,
  created_at,
  updated_at
) on public.profiles to authenticated;

-- anon gets nothing back: it could never satisfy `auth.uid() = id` anyway, so
-- the grant only ever implied a capability that did not exist.

comment on column public.profiles.recruiter_visibility is
  'Enrichment opt-in. NOT client-writable — moves only through '
  'lib/matching/preferences.ts, which writes the matching_consent_events row '
  'in the same operation. A flag a client can set directly cannot answer '
  '"when did I agree, and to what wording?".';
