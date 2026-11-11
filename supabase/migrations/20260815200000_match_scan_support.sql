-- Tailr — migration 16: what the matching scan needs, plus an audit regression.
--
-- ============================================================
-- 1. THE AUDIT CONSTRAINT REGRESSION (found in passing, real, live)
-- ============================================================
--
-- Migration 8 added 'member' to audit_log's entity_type check. Migration 10
-- (client auth, 13 Aug) rebuilt the SAME constraint to add the client-actor
-- values — starting from migration 1's list, not the deployed one — and
-- silently dropped 'member'. Since then, adding a recruiter to a team on
-- staging inserts the member row and then THROWS at the audit step
-- (app/api/agency/team/route.ts writes entityType 'member'; writeAudit
-- propagates the constraint violation): the route 500s, the invite email
-- never sends, and the member exists anyway. The failure mode is exactly what
-- the comment in lib/agency/types.ts warns about — "keep the two in step".
--
-- This migration rebuilds the constraint from the COMPLETE list: every value
-- in the TS union, plus 'matching' for the publish/pause/rescan trail. A new
-- test (lib/__tests__/audit-entity-types.test.ts) parses the union out of
-- types.ts and asserts the newest constraint migration carries every value,
-- so the next person who rebuilds this list cannot repeat migration 10's slip.

alter table agency.audit_log drop constraint if exists audit_log_entity_type_check;
alter table agency.audit_log add constraint audit_log_entity_type_check
  check (entity_type in (
    'role', 'requirement', 'constraint', 'candidate', 'override', 'decision',
    'submission', 'notice', 'rights_request', 'member',
    'client_invite', 'brief', 'availability', 'round', 'artifact',
    'reference', 'handover',
    'matching'
  ));

-- ============================================================
-- 2. SCAN MARKS — skip-on-unchanged, with nothing worth leaking
-- ============================================================
--
-- The scan must not re-assess a person whose evidence and the role's
-- requirements are both unchanged — that is the whole cost model. The mark
-- records WHAT WAS ASSESSED, deliberately not what was concluded:
--
--   * no score column. A stored score for someone who did not match is a
--     judgement about a person kept where they cannot see it. `matched` is
--     kept only so the scan can maintain the bucket without re-deriving it.
--   * zero policies, zero grants. No session reads this table — not the
--     person (their view is role_recommendations), not any agency (their
--     view is the bucket). The scan runs as the service role, which
--     bypasses RLS.
create table if not exists public.match_scan_marks (
  published_role_id  uuid not null references public.published_roles(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  profile_hash       text not null,
  requirements_hash  text not null,
  matched            boolean not null,
  assessed_at        timestamptz not null default now(),
  primary key (published_role_id, user_id)
);

alter table public.match_scan_marks enable row level security;
revoke all on public.match_scan_marks from anon, authenticated;

comment on table public.match_scan_marks is
  'Scan bookkeeping: which (profile, requirements) pair was last assessed per '
  'person per published role, so an unchanged pair is never re-assessed. '
  'Deliberately stores no score — see migration 16 header.';
