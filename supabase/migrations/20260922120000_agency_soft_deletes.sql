-- ============================================================
-- SOFT DELETES: the way back out of four things you could only ever create
-- 22 September 2026
--
-- A survey of the app found six objects a user can create and never remove.
-- Four of them need a column; this is that column, four times, in the same
-- shape so there is one idea here rather than four.
--
-- WHY SOFT, EVERY TIME. This schema's attribution trail is built on RESTRICT
-- and on audit rows that outlive the thing they describe. A hard delete of a
-- role, a contact, a placement or a pack would either be refused by a foreign
-- key or would take the record of what happened with it. "Removed" in this
-- product means "no longer in anyone's way", never "never happened".
--
-- WHAT IS NOT HERE, on purpose:
--   · candidates          — erasure is purge_candidate(), the single path
--   · round decisions     — append-only; a decision is a fact
--   · client actions      — likewise
--   · members             — suspended, never deleted (audit history)
--   · audit_log           — immutable, by definition
--   · submissions         — frozen; the revocable unit is the recipient link
--
-- THE CHECK-CONSTRAINT TRAP, which bit this schema once already
-- (placement_reason_iff_outside, 14 Sep): a CHECK refuses only on FALSE, and
-- NULL is not FALSE. `voided_at is not null and length(trim(reason)) > 0`
-- evaluates to NULL — not false — when the reason is NULL, and the row is
-- ACCEPTED. Every reason column below is therefore wrapped in coalesce, and
-- both directions plus a whitespace-only value are probed in the tests.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ROLES — discard, which is not "close"
--
-- `closed` is an outcome: it starts the retention clock and tells candidates
-- the role is filled. A role created by mistake, or twice, needs the other
-- verb. A discarded role leaves every list and every count, and the route
-- refuses to discard one that has candidates, a submission or a sent notice
-- — by then it is real and closing is the honest act.
-- ------------------------------------------------------------
alter table agency.job_roles
  add column if not exists discarded_at     timestamptz,
  add column if not exists discarded_by     uuid references auth.users on delete set null,
  add column if not exists discard_reason   text;

alter table agency.job_roles
  drop constraint if exists job_roles_discard_reason_iff_discarded;
alter table agency.job_roles
  add constraint job_roles_discard_reason_iff_discarded check (
    (discarded_at is null and coalesce(discard_reason, '') = '')
    or
    (discarded_at is not null and length(trim(coalesce(discard_reason, ''))) > 0)
  );

-- Every list of live roles filters on this, so it earns an index.
create index if not exists job_roles_live_idx
  on agency.job_roles (agency_id, created_at desc) where discarded_at is null;

-- ------------------------------------------------------------
-- 2. CLIENT CONTACTS — archive
--
-- A hard delete is refused anyway: interview_rounds attributes actions to a
-- contact with RESTRICT, and handover_packs.delivered_to_contact_id likewise.
-- That refusal is correct and this is the way around it — the person leaves
-- the pickers and the address book, and everything they did still names them.
-- ------------------------------------------------------------
alter table agency.client_contacts
  add column if not exists archived_at   timestamptz,
  add column if not exists archived_by   uuid references auth.users on delete set null;

create index if not exists client_contacts_live_idx
  on agency.client_contacts (agency_id, company, full_name) where archived_at is null;

-- ------------------------------------------------------------
-- 3. PLACEMENTS — void, with a reason
--
-- A placement is money, and `declined` / `fell_through` are outcomes about a
-- person, not corrections of a mistake. Recording one against the wrong
-- candidate had no way back at all. A void keeps the row, drops it out of
-- every number, and demands a reason in writing — the same discipline the
-- fall-off reason already carries.
-- ------------------------------------------------------------
alter table agency.placements
  add column if not exists voided_at     timestamptz,
  add column if not exists voided_by     uuid references auth.users on delete set null,
  add column if not exists void_reason   text;

alter table agency.placements
  drop constraint if exists placements_void_reason_iff_voided;
alter table agency.placements
  add constraint placements_void_reason_iff_voided check (
    (voided_at is null and coalesce(void_reason, '') = '')
    or
    (voided_at is not null and length(trim(coalesce(void_reason, ''))) > 0)
  );

-- ------------------------------------------------------------
-- 4. HANDOVER PACKS — void an UNDELIVERED pack only
--
-- A delivered pack is sealed: the client has it, and a product that could
-- un-send it would be lying about what the client holds. An undelivered one
-- is a draft frozen against the wrong candidate, and voiding it is the only
-- way to generate the right one without two packs claiming to be the record.
-- The partial index is the enforcement: a delivered pack cannot be voided.
-- ------------------------------------------------------------
alter table agency.handover_packs
  add column if not exists voided_at     timestamptz,
  add column if not exists voided_by     uuid references auth.users on delete set null,
  add column if not exists void_reason   text;

alter table agency.handover_packs
  drop constraint if exists handover_packs_void_undelivered_only;
alter table agency.handover_packs
  add constraint handover_packs_void_undelivered_only check (
    voided_at is null or delivered_at is null
  );

alter table agency.handover_packs
  drop constraint if exists handover_packs_void_reason_iff_voided;
alter table agency.handover_packs
  add constraint handover_packs_void_reason_iff_voided check (
    (voided_at is null and coalesce(void_reason, '') = '')
    or
    (voided_at is not null and length(trim(coalesce(void_reason, ''))) > 0)
  );

-- ------------------------------------------------------------
-- GRANTS
--
-- No new tables, so no new grants — but the 22 Aug lesson is worth restating
-- where the next person will read it: `grant all on all tables in schema
-- agency to service_role` is a POINT-IN-TIME grant, not a standing rule.
-- These four tables already carry their explicit service_role grants; adding
-- a column does not change an ACL. Verified by attempting the write as the
-- role rather than by reading the grant table.
-- ------------------------------------------------------------
