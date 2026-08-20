-- ============================================================
-- Migration 24 · The brief's process facts, and right-to-work capture
-- ============================================================
-- Two additions from the 20 Aug intake refinement:
--
-- 1. The hiring manager can say, on the brief, how their process runs:
--    how many interview rounds they expect, and when they want someone in
--    seat. Accept carries both onto the role. ADVISORY, deliberately —
--    round numbers stay derived from what actually happens
--    (interview_rounds), and nothing enforces the plan: the recruiter owns
--    the process (§5.5), and a client saying "two rounds" is an
--    expectation, not a schema constraint.
--
-- 2. agency.candidate_compliance — right-to-work and logistics, its own
--    table rather than columns on candidates, because candidates carries a
--    table-level authenticated UPDATE grant and a compliance assertion
--    ("I verified this person's right to work") must not be writable
--    without its audit row. Same rule as reviews/overrides: NO
--    authenticated write grants; the service-role route writes it and the
--    audit row in one operation.
--
--    Statuses are FACTS, not conclusions: 'verified' and
--    'needs_sponsorship' record what was checked; there is deliberately no
--    'not_eligible' — that is a decision about a person, decisions belong
--    to people, and nothing in this product auto-rejects. A test upstream
--    asserts rtw_status never filters a candidate list.
--
--    No document storage. An RTW check leaves a note of HOW it was done
--    ("share code ABC checked 20 Aug") — identity documents are a separate
--    compliance surface with its own retention rules, and holding passport
--    scans casually is how agencies fail audits.

alter table agency.role_briefs
  add column if not exists interview_rounds smallint
    check (interview_rounds between 1 and 6),
  add column if not exists start_target text not null default '';

alter table agency.job_roles
  add column if not exists planned_rounds smallint
    check (planned_rounds between 1 and 6),
  add column if not exists start_target text not null default '';

create table if not exists agency.candidate_compliance (
  candidate_id   uuid primary key references agency.candidates on delete cascade,
  agency_id      uuid not null references agency.agencies on delete cascade,
  rtw_status     text not null default 'unverified'
                   check (rtw_status in ('unverified', 'verified', 'needs_sponsorship')),
  -- How the check was performed, never the documents themselves.
  rtw_note       text not null default '',
  rtw_checked_at timestamptz,
  -- Provenance FK: consumer account deletion must never be blocked.
  rtw_checked_by uuid references auth.users on delete set null,
  notice_period  text not null default '',
  updated_at     timestamptz not null default now()
);

alter table agency.candidate_compliance enable row level security;

-- Members read; nobody writes but the service role, and the route that does
-- writes the audit row in the same operation.
create policy candidate_compliance_select on agency.candidate_compliance
  for select using (agency_id in (select agency.member_agency_ids()));

grant select on agency.candidate_compliance to authenticated;
