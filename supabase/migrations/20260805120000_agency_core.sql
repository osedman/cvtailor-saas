-- Tailr for Agencies — migration 1 of 6: tenancy core.
--
-- Everything B2B lives in its own `agency` schema, in the same database as the
-- consumer app. The two are deliberately separated:
--
--   * Consumer RLS is always `auth.uid() = user_id`.
--   * Agency RLS is always `agency_id in (select agency.member_agency_ids())`.
--
-- Mixing those two policy families in `public` is how a copy-pasted policy
-- eventually leaks one agency's candidate pool to another. Separate schemas make
-- that mistake structurally hard, and give the third-party PII in migration 2 its
-- own retention regime.
--
-- Auth is shared: one auth.users identity space. A person can be a consumer user
-- and an agency member at the same time; the two are unrelated at the data level.
--
-- MANUAL STEP after applying: add `agency` to the project's exposed schemas
-- (Dashboard → Project Settings → API → Exposed schemas), otherwise PostgREST
-- cannot see these tables.
--
-- Idempotent: safe to re-run against staging and production.

create schema if not exists agency;

grant usage on schema agency to authenticated, service_role;

-- ============================================================
-- AGENCIES + MEMBERSHIP
-- ============================================================

create table if not exists agency.agencies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  -- Retention window for third-party candidate data, counted from role close.
  -- 180d covers the Equality Act tribunal window (3 months less a day) with
  -- buffer. Per-agency override lives here rather than in code.
  retention_days  integer not null default 180
                    check (retention_days between 1 and 3650),
  -- Human-friendly role refs (ROL-2418) are allocated per agency from here.
  role_seq        bigint not null default 2400,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists agency.members (
  agency_id   uuid not null references agency.agencies on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null check (role in ('owner', 'recruiter', 'viewer')),
  status      text not null default 'active'
                check (status in ('invited', 'active', 'suspended')),
  -- set null, not restrict: a consumer-side account deletion must never be
  -- blocked by agency provenance columns.
  invited_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (agency_id, user_id)
);

create index if not exists members_user_idx
  on agency.members (user_id) where status = 'active';

-- ============================================================
-- TENANCY HELPERS
--
-- Resolved once here and reused by every policy below, so there is exactly one
-- definition of "which agencies is the caller in".
--
-- Both are SECURITY DEFINER so they can read agency.members without tripping
-- that table's own RLS policy (which itself calls member_agency_ids()). The
-- definer is the table owner, and owners are exempt from RLS unless the table
-- is set to FORCE ROW LEVEL SECURITY.
--
-- DO NOT add `force row level security` to agency.members — it will cause
-- infinite recursion in every policy in this schema.
-- ============================================================

create or replace function agency.member_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = agency, public
as $$
  select agency_id
  from agency.members
  where user_id = auth.uid()
    and status = 'active';
$$;

create or replace function agency.has_role(p_agency uuid, variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = agency, public
as $$
  select exists (
    select 1
    from agency.members
    where agency_id = p_agency
      and user_id = auth.uid()
      and status = 'active'
      and role = any(p_roles)
  );
$$;

-- Allocate the next human-readable role ref for an agency (ROL-2418).
create or replace function agency.next_role_ref(p_agency uuid)
returns text
language plpgsql
volatile
security definer
set search_path = agency, public
as $$
declare
  v_next bigint;
begin
  update agency.agencies
     set role_seq = role_seq + 1
   where id = p_agency
  returning role_seq into v_next;

  if v_next is null then
    raise exception 'unknown agency %', p_agency;
  end if;

  return 'ROL-' || v_next::text;
end;
$$;

revoke execute on function agency.next_role_ref(uuid) from public, authenticated;
grant execute on function agency.next_role_ref(uuid) to service_role;

-- ============================================================
-- ROLES (the client vacancy — "Role" in the PRD)
--
-- Named job_roles, not roles: `role` already means permission level in this
-- schema and in Postgres itself.
-- ============================================================

create table if not exists agency.job_roles (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null references agency.agencies on delete cascade,
  ref              text not null,
  title            text not null,
  company          text not null default '',
  company_context  text not null default '',
  salary_band      text not null default '',
  location         text not null default '',
  seniority        text not null default '',
  jd_raw           text not null default '',
  -- Private to the agency. Feeds scoring, never reaches a client-facing doc.
  recruiter_notes  text not null default '',
  status           text not null default 'draft'
                     check (status in ('draft', 'open', 'submitted', 'closed')),
  closed_at        timestamptz,
  -- nullable + set null so deleting an auth user never fails on provenance;
  -- who-did-what history lives in audit_log rows, not in this pointer.
  created_by       uuid references auth.users on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (agency_id, ref)
);

create index if not exists job_roles_agency_status_idx
  on agency.job_roles (agency_id, status, created_at desc);

-- ============================================================
-- REQUIREMENTS + CONSTRAINTS
-- ============================================================

create table if not exists agency.requirements (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agency.agencies on delete cascade,
  role_id     uuid not null references agency.job_roles on delete cascade,
  ref         text not null,                       -- 'R01'
  text        text not null,
  weight      text not null check (weight in ('must', 'important', 'nice')),
  category    text not null default '',
  -- 'parsed' = extracted from the JD, 'recruiter' = added or rewritten by hand.
  -- Every transition between the two is an audit event.
  origin      text not null default 'parsed'
                check (origin in ('parsed', 'recruiter')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (role_id, ref)
);

create index if not exists requirements_role_idx
  on agency.requirements (role_id, sort_order);

create table if not exists agency.role_constraints (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agency.agencies on delete cascade,
  role_id     uuid not null references agency.job_roles on delete cascade,
  ref         text not null,                       -- 'C01'
  text        text not null,
  kind        text not null
                check (kind in ('location', 'work-mode', 'comp', 'other')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (role_id, ref)
);

create index if not exists role_constraints_role_idx
  on agency.role_constraints (role_id, sort_order);

-- ============================================================
-- AUDIT LOG
--
-- The UI shows AUDIT LOGGED pills; this is the table that has to make them true.
-- Append-only by construction: members can read their agency's log, and there is
-- no insert/update/delete policy at all, so writes only happen through the
-- service-role client and nothing in the app can rewrite history.
--
-- candidate_id intentionally has NO foreign key. Erasing a candidate must not
-- erase the record that they were considered and on what basis. The log holds
-- refs, decisions and reasons — never CV content.
-- ============================================================

create table if not exists agency.audit_log (
  id            bigserial primary key,
  agency_id     uuid not null references agency.agencies on delete cascade,
  role_id       uuid references agency.job_roles on delete set null,
  candidate_id  uuid,
  actor_id      uuid references auth.users on delete set null,
  entity_type   text not null
                  check (entity_type in ('role', 'requirement', 'constraint',
                                         'candidate', 'override', 'decision',
                                         'submission', 'notice', 'rights_request')),
  entity_ref    text not null default '',          -- 'R03', 'CAN-02'
  action        text not null,                     -- 'created' | 'edited' | 'overridden' | ...
  from_value    jsonb,
  to_value      jsonb,
  reason        text,
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_agency_idx
  on agency.audit_log (agency_id, created_at desc);
create index if not exists audit_log_role_idx
  on agency.audit_log (role_id, created_at desc);
create index if not exists audit_log_candidate_idx
  on agency.audit_log (candidate_id, created_at desc);

-- ============================================================
-- UPDATED_AT
--
-- Defined here rather than assumed: production has this from 001_initial.sql,
-- but staging was built from schema.sql and does not. create or replace with
-- the identical body is a safe no-op where it already exists.
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger set_agencies_updated_at before update on agency.agencies
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_members_updated_at before update on agency.members
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_job_roles_updated_at before update on agency.job_roles
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_requirements_updated_at before update on agency.requirements
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- ROW LEVEL SECURITY
--
-- RLS is the backstop, not the primary control. The application rule stands:
-- lib/agency/db.ts is the only module that builds these queries, and every
-- function takes an AgencyContext { agencyId, userId, role } as its first
-- argument. Route handlers never touch Supabase directly, and agency_id is
-- always derived from the session — never accepted from the client.
-- ============================================================

alter table agency.agencies        enable row level security;
alter table agency.members         enable row level security;
alter table agency.job_roles       enable row level security;
alter table agency.requirements    enable row level security;
alter table agency.role_constraints enable row level security;
alter table agency.audit_log       enable row level security;

-- --- agencies -------------------------------------------------
-- Readable by members. Only owners may rename or change retention.
-- Creation is service-role only (agencies are provisioned manually).

do $$ begin
  create policy "agencies_select" on agency.agencies for select
    using (id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "agencies_update" on agency.agencies for update
    using (agency.has_role(id, 'owner'))
    with check (agency.has_role(id, 'owner'));
exception when duplicate_object then null; end $$;

-- --- members --------------------------------------------------
-- Everyone in an agency can see the team. Only owners may invite or change
-- roles, and only within their own agency.

do $$ begin
  create policy "members_select" on agency.members for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "members_insert" on agency.members for insert
    with check (agency.has_role(agency_id, 'owner'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "members_update" on agency.members for update
    using (agency.has_role(agency_id, 'owner'))
    with check (agency.has_role(agency_id, 'owner'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "members_delete" on agency.members for delete
    using (agency.has_role(agency_id, 'owner'));
exception when duplicate_object then null; end $$;

-- --- job_roles ------------------------------------------------
-- Viewers read everything in their own agency (agency director case).
-- Only owners and recruiters write. Roles are closed, never deleted, so the
-- retention clock and the audit trail stay intact — no delete policy.

do $$ begin
  create policy "job_roles_select" on agency.job_roles for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "job_roles_insert" on agency.job_roles for insert
    with check (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "job_roles_update" on agency.job_roles for update
    using (agency.has_role(agency_id, 'owner', 'recruiter'))
    with check (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

-- --- requirements ---------------------------------------------

do $$ begin
  create policy "requirements_select" on agency.requirements for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "requirements_insert" on agency.requirements for insert
    with check (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "requirements_update" on agency.requirements for update
    using (agency.has_role(agency_id, 'owner', 'recruiter'))
    with check (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "requirements_delete" on agency.requirements for delete
    using (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

-- --- role_constraints -----------------------------------------

do $$ begin
  create policy "role_constraints_select" on agency.role_constraints for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "role_constraints_write" on agency.role_constraints for all
    using (agency.has_role(agency_id, 'owner', 'recruiter'))
    with check (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

-- --- audit_log ------------------------------------------------
-- Read-only to members. No insert/update/delete policies on purpose: writes go
-- through the service-role client only, and the log can never be edited or
-- pruned from the application. Same pattern as public.beta_access (017).

do $$ begin
  create policy "audit_log_select" on agency.audit_log for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

-- ============================================================
-- GRANTS
--
-- Supabase's default privileges cover `public` only, so a new schema needs
-- explicit grants. RLS above is what actually constrains these.
-- ============================================================

grant select                         on agency.agencies         to authenticated;
grant update                         on agency.agencies         to authenticated;
grant select, insert, update, delete on agency.members          to authenticated;
grant select, insert, update         on agency.job_roles        to authenticated;
grant select, insert, update, delete on agency.requirements     to authenticated;
grant select, insert, update, delete on agency.role_constraints to authenticated;
grant select                         on agency.audit_log        to authenticated;

grant usage, select on all sequences in schema agency to authenticated, service_role;
grant all on all tables in schema agency to service_role;
