-- Tailr for Agencies — migration 8: audit entity type for team membership.
-- Team changes (invite, role change, suspension) are audit mandated like
-- everything else owners do; the original enum predates the invites feature.
-- Idempotent: safe to re-run against staging and production.

alter table agency.audit_log drop constraint if exists audit_log_entity_type_check;
alter table agency.audit_log add constraint audit_log_entity_type_check
  check (entity_type in ('role', 'requirement', 'constraint', 'candidate',
                         'override', 'decision', 'submission', 'notice',
                         'rights_request', 'member'));
