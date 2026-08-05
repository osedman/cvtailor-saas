-- Tailr for Agencies — migration 3 of 6: screening, decisions, scoring.
--
-- Completes the data layer for the screening → compare → decide loop:
--
--   candidate_reviews   the screening call (CandidateReview in the PRD)
--   review_overrides    recruiter's per-requirement corrections to the CV parse
--   recruiter_reviews   the shortlist decision (RecruiterReview in the PRD)
--   score_breakdowns    server-computed score cache (ScoreBreakdown in the PRD)
--
-- WRITE MODEL — the audit-coupling rule. The brief's record-keeping obligation
-- ("log every requirement edit and every override") is only real if it cannot
-- be bypassed. So: any table whose changes must be audit-logged has NO
-- authenticated write policies at all — writes happen exclusively in API
-- routes via the service-role client, in the same operation that writes the
-- agency.audit_log row. If the UI shows an AUDIT LOGGED pill for it, the
-- client cannot write it directly.
--
-- This migration also retro-tightens migration 1 to the same rule: direct
-- authenticated writes to requirements and role_constraints are revoked here.
-- Free-form surfaces without an audit mandate (job_roles fields, candidates
-- fields) keep their RLS-scoped authenticated writes.
--
-- Depends on: 20260805130000_agency_candidates.sql.
-- Idempotent: safe to re-run against staging and production.

-- ============================================================
-- CANDIDATE REVIEWS (the screening call)
-- ============================================================

create table if not exists agency.candidate_reviews (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  role_id        uuid not null references agency.job_roles on delete cascade,
  candidate_id   uuid not null references agency.candidates on delete cascade unique,
  status         text not null default 'unreviewed'
                   check (status in ('unreviewed', 'reviewed')),
  recruiter_id   uuid references auth.users on delete set null,
  -- Soft signals. 1-5; null = not assessed (clicking the active star clears).
  communication  smallint check (communication between 1 and 5),
  motivation     smallint check (motivation between 1 and 5),
  availability   text not null default '',
  salary_confirm text not null default '',
  notice_period  text not null default '',
  -- { probeIndex: answer } — answers to the pre-generated probe questions.
  call_answers   jsonb not null default '{}'::jsonb,
  -- Private call notes; feed the submission narrative, never shown raw to the
  -- client.
  notes          text not null default '',
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists candidate_reviews_role_idx
  on agency.candidate_reviews (role_id);

-- ============================================================
-- REVIEW OVERRIDES
--
-- Current override state only — one row per (review, requirement), updated in
-- place. History and attribution over time live in agency.audit_log
-- ('override' entity rows with from/to/reason), written by the same service-
-- role operation that upserts here. from_strength snapshots the parsed
-- strength at override time so the delta survives later re-parses.
-- ============================================================

create table if not exists agency.review_overrides (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  review_id      uuid not null references agency.candidate_reviews on delete cascade,
  requirement_id uuid not null references agency.requirements on delete cascade,
  from_strength  text not null
                   check (from_strength in ('strong', 'transferable', 'partial', 'missing')),
  to_strength    text not null
                   check (to_strength in ('strong', 'transferable', 'partial', 'missing')),
  reason         text,
  recruiter_id   uuid references auth.users on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (review_id, requirement_id)
);

create index if not exists review_overrides_requirement_idx
  on agency.review_overrides (requirement_id);

-- ============================================================
-- RECRUITER REVIEWS (the shortlist decision)
--
-- decision is nullable by design: clicking the active segment clears it, and
-- "undecided" is a real state counted in the sticky action bar. There is no
-- machine path that writes 'reject' — no automatic rejection, ever.
-- ============================================================

create table if not exists agency.recruiter_reviews (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  role_id        uuid not null references agency.job_roles on delete cascade,
  candidate_id   uuid not null references agency.candidates on delete cascade unique,
  decision       text check (decision in ('shortlist', 'hold', 'reject')),
  decision_note  text not null default '',
  decided_by     uuid references auth.users on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists recruiter_reviews_role_idx
  on agency.recruiter_reviews (role_id);

-- ============================================================
-- SCORE BREAKDOWNS
--
-- A server-computed cache, never a source of truth the client can write.
-- inputs_hash is the staleness check that enforces "no frontend-computed score
-- ever reaches a client-facing document": submission generation recomputes the
-- hash over (requirements + evidence + overrides + soft signals + review
-- status) and refuses to render from a stale row. engine_version records which
-- scoring rules produced an archived submission.
-- ============================================================

create table if not exists agency.score_breakdowns (
  id                       uuid primary key default gen_random_uuid(),
  agency_id                uuid not null references agency.agencies on delete cascade,
  candidate_id             uuid not null references agency.candidates on delete cascade unique,
  overall                  numeric(5,2) not null check (overall between 0 and 100),
  -- Category sub-scores, each 0-100 pre-weight. Weights (45/25/10/10/10) are
  -- engine constants, versioned by engine_version — not stored per row.
  requirement_coverage     numeric(5,2) not null check (requirement_coverage between 0 and 100),
  evidence_strength        numeric(5,2) not null check (evidence_strength between 0 and 100),
  seniority_calibration    numeric(5,2) not null check (seniority_calibration between 0 and 100),
  context_fit              numeric(5,2) not null check (context_fit between 0 and 100),
  confidence_completeness  numeric(5,2) not null check (confidence_completeness between 0 and 100),
  must_have_hit            smallint not null check (must_have_hit >= 0),
  must_have_total          smallint not null check (must_have_total >= 0),
  confidence_level         smallint not null check (confidence_level between 1 and 4),
  -- { reqId: effective strength } after overrides — what the compare matrix
  -- renders.
  effective                jsonb not null default '{}'::jsonb,
  -- Pre-screening score, preserved for the DeltaChip (was → now).
  original_overall         numeric(5,2) check (original_overall between 0 and 100),
  inputs_hash              text not null,
  engine_version           text not null,
  computed_at              timestamptz not null default now(),
  constraint musts_hit_lte_total check (must_have_hit <= must_have_total)
);

-- ============================================================
-- UPDATED_AT
-- ============================================================

do $$ begin
  create trigger set_candidate_reviews_updated_at before update on agency.candidate_reviews
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_review_overrides_updated_at before update on agency.review_overrides
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_recruiter_reviews_updated_at before update on agency.recruiter_reviews
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- ROW LEVEL SECURITY
--
-- All four tables: members read their agency's rows; NO authenticated write
-- policies (see header). Viewers therefore see screening state and scores
-- read-only for free.
-- ============================================================

alter table agency.candidate_reviews enable row level security;
alter table agency.review_overrides  enable row level security;
alter table agency.recruiter_reviews enable row level security;
alter table agency.score_breakdowns  enable row level security;

do $$ begin
  create policy "candidate_reviews_select" on agency.candidate_reviews for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "review_overrides_select" on agency.review_overrides for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "recruiter_reviews_select" on agency.recruiter_reviews for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "score_breakdowns_select" on agency.score_breakdowns for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

-- ============================================================
-- GRANTS
-- ============================================================

grant select on agency.candidate_reviews to authenticated;
grant select on agency.review_overrides  to authenticated;
grant select on agency.recruiter_reviews to authenticated;
grant select on agency.score_breakdowns  to authenticated;

grant all on agency.candidate_reviews, agency.review_overrides,
             agency.recruiter_reviews, agency.score_breakdowns to service_role;

-- ============================================================
-- RETRO-TIGHTEN MIGRATION 1 (audit-coupling rule)
--
-- Requirement and constraint edits are in the mandated audit set, so direct
-- authenticated writes are removed; the parse-review screen's edits go through
-- API routes that write the audit row in the same operation. Read policies are
-- untouched.
-- ============================================================

drop policy if exists "requirements_insert" on agency.requirements;
drop policy if exists "requirements_update" on agency.requirements;
drop policy if exists "requirements_delete" on agency.requirements;
drop policy if exists "role_constraints_write" on agency.role_constraints;

revoke insert, update, delete on agency.requirements     from authenticated;
revoke insert, update, delete on agency.role_constraints from authenticated;
