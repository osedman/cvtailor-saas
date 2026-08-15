-- Tailr — migration 17: agency.role_matching was created without grants.
--
-- Migration 12 created the table, enabled RLS and wrote a member SELECT
-- policy. It never granted the base privileges, and **an RLS policy is
-- meaningless without a grant underneath** — RLS narrows what a role may
-- reach, it does not confer the right to reach anything.
--
-- Why this bit here and nowhere else: the `public` schema carries Supabase's
-- default privileges, so every table migration 12 created there got
-- service_role and authenticated grants automatically. The `agency` schema is
-- ours and has no such defaults, so every agency table since migration 1 has
-- carried explicit grants — except this one. Compare:
--
--   agency.audit_log        authenticated=r      service_role=arwdDxtm
--   agency.interview_rounds authenticated=r      service_role=arwdDxtm
--   agency.job_roles        authenticated=arw    service_role=arwdDxtm
--   agency.role_matching    (no ACL — owner only)   ← this
--
-- The visible symptom was a recruiter clicking "Publish for matching" and
-- getting `permission denied for table role_matching [42501]`, after the
-- published_roles snapshot had already been written — a half-publish.
--
-- Matching the established pattern exactly:
--   authenticated  SELECT only. role_matching is audit-coupled: every write
--                  goes through a service-role route that writes the
--                  agency.audit_log row in the same operation, so the client
--                  must not be able to write it directly.
--   service_role   full access; it is the only writer.
--   anon           nothing. This schema is never reachable without a session.
--
-- Idempotent: safe to re-run.

grant select on agency.role_matching to authenticated;
grant select, insert, update, delete on agency.role_matching to service_role;

-- The reload matters: PostgREST caches privileges alongside the schema, so a
-- fresh grant is not picked up until it is told.
notify pgrst, 'reload schema';
