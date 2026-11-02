-- Tailr — migration 28: 'notification' joins the audit entity types.
--
-- Cross-wall notifications (lib/agency/notify.ts) audit every outcome, the
-- same as candidate notices do. That write needs an entity_type, and
-- audit_log's check constraint is a closed list — so without this migration
-- the notification inserts its row, throws at the audit step, and the caller
-- sees a 500 on a write that actually succeeded. That is migration 10's exact
-- failure, which cost two days in August and now has a test guarding it
-- (lib/__tests__/audit-entity-types.test.ts).
--
-- Per that test's rule: this list is the COMPLETE deployed set plus the new
-- value, never migration 1's list with an addition. Copied from migration 16,
-- which is the newest rebuild, and diffed against the TS union.
--
-- Run BEFORE deploying the code that writes it, in BOTH projects.

alter table agency.audit_log drop constraint if exists audit_log_entity_type_check;
alter table agency.audit_log add constraint audit_log_entity_type_check
  check (entity_type in (
    'role', 'requirement', 'constraint', 'candidate', 'override', 'decision',
    'submission', 'notice', 'rights_request', 'member',
    'client_invite', 'brief', 'availability', 'round', 'artifact',
    'reference', 'handover',
    'matching',
    -- New in 28. The entity_ref is the event KIND, never its content — an
    -- audit row is read by people who are not entitled to the payload.
    'notification'
  ));
