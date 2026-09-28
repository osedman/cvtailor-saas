-- The client's final choice, with their reason (Figma board 31, approved
-- 28 Sep 2026).
--
-- Ose, 28 Sep, after advancing two candidates at the last planned round of
-- ROL-2419: "there's no more rounds. There should be an option to select the
-- final … how will the hiring manager see or justify their decision?"
--
-- Until now the loop could say "you took 2 forward" and nothing more. The
-- choice between them happened on the recruiter's close-out screen, where the
-- client never is, and the recruiter guessed ("Suggested" only when exactly
-- one person was taken forward).
--
-- WHAT THIS IS: a statement of PREFERENCE by the hiring manager, with a
-- reason in their own words. It is not a hire. The hire, the offer and the
-- placement stay the recruiter's acts — a fact outranks a preference.
--
-- WHAT IT IS NOT: a rejection. Choosing one person writes nothing about
-- anyone else; the people not chosen stay "taken forward" until the
-- recruiter closes the loop with them.
--
-- APPEND-ONLY, NEWEST WINS — the shape round_decisions and
-- role_decision_completions already use. Changing a choice writes a new row;
-- 'withdrawn' returns the role to "not chosen yet" without editing history.
--
-- AUDIT-COUPLED: no authenticated write grants. The only writer is
-- lib/agency/final-choice.ts, service role, audit row in the same operation.
-- service_role is granted EXPLICITLY — three tables in this schema shipped
-- unwritable by assuming it was implicit (see 20260914090000).
--
-- Idempotent and safe to re-run.

create table if not exists agency.client_final_choices (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies(id) on delete cascade,
  role_id       uuid not null references agency.job_roles(id) on delete cascade,
  -- Cascade: purge_candidate() deleting the candidate takes the hiring
  -- manager's sentence about them with it. The reason is about a person.
  candidate_id  uuid references agency.candidates(id) on delete cascade,
  candidate_ref text,
  action        text not null check (action in ('chosen', 'neither', 'withdrawn')),
  reason        text not null default '',
  -- Nullable, set null: removing a contact or an account must never erase
  -- the fact that a choice was made, only who made it.
  by_contact_id uuid references agency.client_contacts(id) on delete set null,
  decided_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- A person is named iff the action is 'chosen'. `is not null` can never
-- evaluate to NULL, so this refuses in both directions.
alter table agency.client_final_choices
  drop constraint if exists final_choice_candidate_iff_chosen;
alter table agency.client_final_choices
  add constraint final_choice_candidate_iff_chosen check (
    (action = 'chosen') = (candidate_id is not null)
  );

-- The reason is required for a choice and for "neither". coalesce + trim:
-- a CHECK refuses only on FALSE, and a whitespace-only reason is no reason.
alter table agency.client_final_choices
  drop constraint if exists final_choice_reason_required;
alter table agency.client_final_choices
  add constraint final_choice_reason_required check (
    action = 'withdrawn' or length(trim(coalesce(reason, ''))) > 0
  );

alter table agency.client_final_choices
  drop constraint if exists final_choice_reason_cap;
alter table agency.client_final_choices
  add constraint final_choice_reason_cap check (length(reason) <= 2000);

create index if not exists client_final_choices_role_idx
  on agency.client_final_choices (role_id, created_at desc);

alter table agency.client_final_choices enable row level security;

drop policy if exists client_final_choices_select on agency.client_final_choices;
create policy client_final_choices_select on agency.client_final_choices
  for select using (agency_id in (select agency.member_agency_ids()));

grant select on agency.client_final_choices to authenticated;
-- No insert/update/delete to authenticated, deliberately: audit-coupled.
grant select, insert, update, delete on agency.client_final_choices to service_role;
