-- ============================================================
-- A REFERENCE IS A CHARACTER REFERENCE OR AN HR REFERENCE
-- 23 September 2026 · Figma frame 24, bands C, D and H
--
-- Ose: "we need to have either character reference or HR reference", and
-- "the recruiter should be able to pick".
--
-- Until now every reference was the same thing and every referee got the
-- same four open questions — which asked an HR team what somebody was like
-- to work with, a question most are not permitted to answer.
--
-- TWO COLUMNS, TWO DIFFERENT IDEAS:
--
--   candidate_references.kind    — what THIS referee is being asked for.
--                                  Set when they are added; drives which
--                                  form their link opens.
--   candidates.references_wanted — which kinds this CANDIDATE needs before
--                                  hand-over. The recruiter's choice, per
--                                  candidate, because Meridian ask for HR on
--                                  every hire and most clients do not.
--
-- The second is an array rather than two booleans so "neither" stays
-- expressible: a candidate nobody wants references for is a real case, and
-- two booleans would make it look like an unanswered question.
--
-- DEFAULT 'character' ON EXISTING ROWS. Every reference taken before today
-- was requested with the character questions, so that is what it is. Calling
-- them 'unknown' would be more honest about our own history and less honest
-- about what the referee actually answered.
-- ============================================================

alter table agency.candidate_references
  add column if not exists kind text not null default 'character';

alter table agency.candidate_references
  drop constraint if exists candidate_references_kind_check;
alter table agency.candidate_references
  add constraint candidate_references_kind_check
    check (kind in ('character', 'hr'));

-- Which kinds this candidate needs. Empty array = none required, which is
-- different from the default of both being wanted.
alter table agency.candidates
  add column if not exists references_wanted text[] not null default array['character']::text[];

-- A CHECK CANNOT CONTAIN A SUBQUERY. The first cut of this migration wrote
-- the no-duplicates rule as `array_length(...) = (select count(distinct k)
-- from unnest(...) k)` and Postgres refused the whole script with 0A000,
-- "cannot use subquery in check constraint" — correctly, because a CHECK
-- must be immutable and row-local, and a subquery is neither.
--
-- The fix is not a cleverer expression: it is to name the four legal values.
-- With two kinds there are exactly four, the list reads as the rule it is,
-- and duplicates and unknown values are both impossible by construction.
--
-- ORDER IS CANONICAL: character first. An array is ordered and
-- ['hr','character'] would be refused, so anything writing this column sorts
-- it. That is a deliberate constraint on writers rather than a looser check
-- here — two spellings of one fact is how a column starts disagreeing with
-- itself.
alter table agency.candidates
  drop constraint if exists candidates_references_wanted_check;
alter table agency.candidates
  add constraint candidates_references_wanted_check check (
    references_wanted = array[]::text[]
    or references_wanted = array['character']::text[]
    or references_wanted = array['hr']::text[]
    or references_wanted = array['character', 'hr']::text[]
  );

-- The checklist asks "which kinds are in?" per candidate on every close-out.
create index if not exists candidate_references_kind_idx
  on agency.candidate_references (candidate_id, kind, status);

-- ============================================================
-- GRANTS — the point-in-time trap, restated (22 Aug 2026).
--
-- `grant all on all tables in schema agency to service_role` was a
-- POINT-IN-TIME grant, not a standing rule, and three shipped tables could
-- never be written by the role that writes them. No new tables here, and a
-- new COLUMN inherits the table's ACL, so nothing to grant — but verify by
-- attempting the write as the role, not by reading the grant table.
-- ============================================================
