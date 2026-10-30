-- The handover checklist: every mandatory item resolved before the pack is
-- handed over.
--
-- Four of the five items are derived from facts that already exist
-- (references received, right to work seen, placement recorded, start date
-- set); the fifth — terms confirmed — has no fact behind it. Any item the
-- facts do not settle is resolved here by a recruiter: done, waived with a
-- reason, or not applicable. Nothing here is auto-completed on delivery
-- (the prototype did that; we do not), and deliverHandoverPack refuses
-- while an item is unresolved, so the gate is the server's, not a button's.
--
-- Audit-coupled: no authenticated write grants; the service role writes the
-- row and its audit entry in one operation (lib/agency/handover-checklist.ts).
-- The service-role grant is explicit because `grant all on all tables` was a
-- point-in-time grant (20260822090000).
--
-- Run in tailr-staging first. Idempotent.

create table if not exists agency.handover_items (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies on delete cascade,
  role_id       uuid not null references agency.job_roles on delete cascade,
  candidate_id  uuid not null references agency.candidates on delete cascade,
  item          text not null
                  check (item in ('references', 'right_to_work', 'placement', 'start_date', 'terms')),
  state         text not null
                  check (state in ('done', 'waived', 'not_applicable')),
  -- Why it was waived or marked not applicable. Required for those two
  -- states; the check makes a silent skip impossible.
  reason        text not null default '',
  resolved_by   uuid references auth.users on delete set null,
  resolved_at   timestamptz not null default now(),
  constraint handover_items_reason_when_waived
    check (state = 'done' or length(btrim(reason)) > 0),
  unique (role_id, candidate_id, item)
);

alter table agency.handover_items enable row level security;

drop policy if exists handover_items_select on agency.handover_items;
create policy handover_items_select on agency.handover_items
  for select using (agency_id in (select agency.member_agency_ids()));

grant select on agency.handover_items to authenticated;
grant select, insert, update, delete on agency.handover_items to service_role;
