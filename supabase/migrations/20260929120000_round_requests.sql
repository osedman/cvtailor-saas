-- The hiring manager asks for another round (Figma board 33, approved
-- 29 Sep 2026).
--
-- Board 31 said "Ask your recruiter for another round" and put nothing
-- behind it: the plan stops at the last planned round and only the
-- recruiter can extend it. This is the ask, as a record.
--
-- A REQUEST IS NOT A ROUND. Asking books nothing and tells no candidate.
-- The recruiter answers it: 'added' (they raised the role's planned rounds,
-- so the existing invite flow reaches the people asked for) or 'replied'
-- (settled another way). The hiring manager can take it back ('withdrawn').
--
-- APPEND-ONLY. An 'asked' row opens a request; every later row points at it
-- through request_id and closes it. Nothing is edited, so the record says
-- what happened, not only where it ended up. The same shape as
-- client_final_choices and round_decisions.
--
-- AUDIT-COUPLED: no authenticated write grants; the only writer is
-- lib/agency/round-requests.ts, service role, audit row in the same
-- operation. service_role granted EXPLICITLY (see 20260914090000).
--
-- Idempotent and safe to re-run.

create table if not exists agency.round_requests (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references agency.agencies(id) on delete cascade,
  role_id         uuid not null references agency.job_roles(id) on delete cascade,
  -- The request this row closes. Null only on the 'asked' row that opens one.
  request_id      uuid references agency.round_requests(id) on delete cascade,
  action          text not null check (action in ('asked', 'withdrawn', 'added', 'replied')),
  -- Refs, not ids: a request names the people it is about even after one of
  -- them is purged, and a ref carries no personal data on its own.
  candidate_refs  text[] not null default '{}',
  note            text not null default '',
  -- The round it asks for (planned_rounds + 1 at the time), for display.
  round_number    integer check (round_number is null or round_number between 2 and 7),
  by_contact_id   uuid references agency.client_contacts(id) on delete set null,
  decided_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- An 'asked' row opens a request: it has no parent, names at least one
-- person and says what the round is for. Every other row closes one. Written
-- with coalesce/cardinality so a NULL can never slip past a CHECK.
alter table agency.round_requests drop constraint if exists round_request_shape;
alter table agency.round_requests add constraint round_request_shape check (
  (action = 'asked'
     and request_id is null
     and cardinality(candidate_refs) > 0
     and length(trim(coalesce(note, ''))) > 0)
  or
  (action <> 'asked' and request_id is not null)
);

alter table agency.round_requests drop constraint if exists round_request_note_cap;
alter table agency.round_requests add constraint round_request_note_cap check (length(note) <= 2000);

create index if not exists round_requests_role_idx
  on agency.round_requests (role_id, created_at desc);

alter table agency.round_requests enable row level security;

drop policy if exists round_requests_select on agency.round_requests;
create policy round_requests_select on agency.round_requests
  for select using (agency_id in (select agency.member_agency_ids()));

grant select on agency.round_requests to authenticated;
-- No insert/update/delete to authenticated, deliberately: audit-coupled.
grant select, insert, update, delete on agency.round_requests to service_role;
