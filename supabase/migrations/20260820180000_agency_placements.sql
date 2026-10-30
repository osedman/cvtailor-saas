-- ============================================================
-- Migration 25 · Placements — the event the business is paid for
-- ============================================================
-- The loop ran decision → references → handover with no record of who
-- actually got the job. Without this row an agency cannot compute the four
-- numbers it runs on: fill rate, time-to-fill, fee value, rebate exposure.
--
-- ONE ROW PER (role, candidate). A role may place several people; a
-- candidate is placed on a role once. The unique index is the whole
-- mechanism against a double-recorded fee.
--
-- STATUS IS AN OUTCOME, NOT A JUDGEMENT. 'declined' means the candidate
-- said no to an offer — it is not a mark against them, must never filter or
-- rank anyone, and a guardrail test scans for exactly that. Same rule that
-- governs rtw_status (migration 24) and client decline actions.
--
-- FALL-OFF IS FIRST CLASS, not a status someone edits away. A placement
-- that ends inside the rebate window is the money event agencies fear, and
-- it needs its own timestamp and reason so it can be counted rather than
-- quietly overwritten.
--
-- AUDIT-COUPLED, because placements are money: no authenticated write
-- grants at all. The service-role route writes the row and the audit entry
-- in one operation. Same shape as agency.candidate_compliance.
--
-- NOTHING HERE CLOSES A ROLE. Closing stays the recruiter's deliberate act
-- because it starts the retention clock (§4 retention).

create table if not exists agency.placements (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references agency.agencies on delete cascade,
  role_id          uuid not null references agency.job_roles on delete cascade,
  candidate_id     uuid not null references agency.candidates on delete cascade,

  status           text not null default 'offered'
                     check (status in ('offered','accepted','declined','started','fell_through')),

  offered_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  declined_at      timestamptz,
  start_date       date,
  started_at       timestamptz,
  fell_through_at  timestamptz,
  fell_through_reason text not null default '',

  -- The fee is agreed per placement even where terms are standing, so it
  -- lives here rather than on the client.
  fee_percent      numeric(5,2) check (fee_percent is null or (fee_percent >= 0 and fee_percent <= 100)),
  fee_value        numeric(12,2) check (fee_value is null or fee_value >= 0),
  currency         text not null default 'GBP',
  -- Weeks from start_date during which a fall-off claws the fee back.
  rebate_weeks     smallint check (rebate_weeks is null or (rebate_weeks >= 0 and rebate_weeks <= 52)),

  notes            text not null default '',
  -- Provenance: consumer account deletion must never be blocked.
  created_by       uuid references auth.users on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists placements_role_candidate_uniq
  on agency.placements (role_id, candidate_id);

create index if not exists placements_agency_status_idx
  on agency.placements (agency_id, status);

-- Rebate exposure: everything started, inside its window, not yet fallen
-- through. Indexed because it is the query an owner runs on a Monday.
create index if not exists placements_rebate_window_idx
  on agency.placements (start_date)
  where status = 'started' and rebate_weeks is not null;

alter table agency.placements enable row level security;

create policy placements_select on agency.placements
  for select using (agency_id in (select agency.member_agency_ids()));

grant select on agency.placements to authenticated;
