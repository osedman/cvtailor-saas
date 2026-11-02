-- Wave 4 · the two facts the loop was inferring.
--
-- Both items are the same mistake in different places: the product decides
-- something important by reading around the edge of it.
--
--   1. Whether the client has finished deciding was read off the round count
--      against planned_rounds (next-action.ts:179) — a plan the same file's
--      header calls "never a gate". A client who decides early, or who wants
--      one more round, is read wrong either way, and the success measure
--      "submission -> all decisions" has no end timestamp to measure to.
--
--   2. Whether a hire came through the process was not read at all.
--      lib/agency/placements.ts has no decision check, so a placement — the
--      fee, the rebate window, the start date — can be recorded against a
--      candidate nobody ever advanced. That happens legitimately; it is not
--      an error to record, it is an error not to say so.
--
-- Both tables are AUDIT-COUPLED: no authenticated write grants, so the only
-- writer is a service-role route that writes the audit row in the same
-- operation. That is what lets a UI pill say AUDIT LOGGED and mean it.
--
-- Idempotent and safe to re-run.

-- ── 1 · the client's own statement that they have finished deciding ────────
--
-- Append-only, newest wins — the shape agency.round_decisions already uses.
-- A client who reopens writes a 'withdrawn' row rather than editing history,
-- so the record says what happened rather than only where it ended up.
create table if not exists agency.role_decision_completions (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies(id) on delete cascade,
  role_id       uuid not null references agency.job_roles(id) on delete cascade,
  action        text not null check (action in ('completed', 'withdrawn')),
  note          text,
  -- Nullable on delete set null: removing a contact must never erase the
  -- fact that the decision round was closed, only who closed it.
  by_contact_id uuid references agency.client_contacts(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists role_decision_completions_role_idx
  on agency.role_decision_completions (role_id, created_at desc);

alter table agency.role_decision_completions enable row level security;

drop policy if exists role_decision_completions_select on agency.role_decision_completions;
create policy role_decision_completions_select on agency.role_decision_completions
  for select using (agency_id in (select agency.member_agency_ids()));

grant select on agency.role_decision_completions to authenticated;
-- No insert/update/delete to authenticated, deliberately: audit-coupled.

-- ── 2 · the hire that skipped the loop ────────────────────────────────────
alter table agency.placements
  add column if not exists outside_process        boolean not null default false,
  add column if not exists outside_process_reason text;

-- Reason iff flag, enforced in BOTH directions — the same shape as
-- evidence_quote_iff_present on agency.candidate_evidence, which this
-- product already relies on for missing <-> no quote. A flag without a
-- reason is impossible, and so is a reason quietly attached to a normal hire.
alter table agency.placements
  drop constraint if exists placement_reason_iff_outside;
alter table agency.placements
  add constraint placement_reason_iff_outside check (
    (outside_process = false and outside_process_reason is null)
    or
    (outside_process = true and length(trim(outside_process_reason)) > 0)
  );

-- Existing rows default to false with a null reason, which the constraint
-- permits, so nothing already recorded is invalidated by this.
