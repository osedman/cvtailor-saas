-- ============================================================
-- Migration 36: the shortlist recommendation leaves an audit row
--
-- Step 05 gains a "Recommend a shortlist" button. It reads the recruiter's
-- own screening-call answers and the score breakdowns and returns three
-- GROUPS with a reason per candidate. It writes no decision: recruiter_reviews
-- stays untouched, and nothing in this migration creates a place to store a
-- machine's opinion of a person.
--
-- What it DOES need is a record that it was asked for, because a
-- recommendation that names people is the closest thing to an automated
-- decision this product has, and "who asked the machine, and when" has to be
-- answerable. entity_ref is the role ref (ROL-XXXX) and the payload is counts
-- only — never a name, never a reason, never a group. An audit row is read by
-- people who are not entitled to the working, same rule as 'notification'
-- in migration 28.
--
-- Idempotent: the constraint is dropped and rebuilt, as every previous
-- entity_type addition has done (migrations 8, 10, 22, 28, 33).
-- ============================================================

alter table agency.audit_log drop constraint if exists audit_log_entity_type_check;
alter table agency.audit_log add constraint audit_log_entity_type_check
  check (entity_type in (
    'role', 'requirement', 'constraint', 'candidate', 'override', 'decision',
    'submission', 'notice', 'rights_request', 'member',
    'client_invite', 'brief', 'availability', 'round', 'artifact',
    'reference', 'handover',
    'matching',
    'notification',
    'interview',
    -- New in 36. The action is always 'generated' — there is no 'applied',
    -- because applying a recommendation is a human pressing shortlist and
    -- that already writes its own 'decision' row.
    'recommendation'
  ));
