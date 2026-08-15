-- Tailr for Agencies — migration 12: quiet matching.
--
-- A recruiter publishes a role for matching and sets a minimum score. Tailr
-- scans consumer users who have opted in, and recommends the role TO THOSE
-- PEOPLE. The agency sees nothing and nobody until an application lands.
-- There is no job board and no recruiter-side browsing, permanently.
--
-- ============================================================
-- THE INVARIANT, AND WHY THIS MIGRATION DOES NOT BREAK IT
-- ============================================================
--
-- Architecture decision 6 (migration 6) forbids caching match results:
-- "a stored 'this person is a Tailr user' row is itself the disclosure."
-- This migration stores exactly such rows, so read the rule precisely:
--
--   The forbidden row is one AN AGENCY CAN READ. agency.consumer_links was
--   forbidden because it would sit in the agency schema, visible under
--   member_agency_ids(). The disclosure is not the storage. It is the
--   READABILITY BY THE OTHER PARTY.
--
-- Three corollaries, enforced below rather than promised:
--
--   1. NO user_id ON agency.candidates, EVER. The agency learns who someone
--      is because they applied — never because they matched.
--   2. NO CROSS-SCHEMA FK from public into agency. public.published_roles
--      carries agency_id and role_id as PLAIN UUIDs with no REFERENCES: a FK
--      is itself a readable join path, and a constraint error leaks existence.
--      The agency side points at the public row, not the reverse.
--   3. THE AGGREGATE COUNT IS A REAL, THIN DISCLOSURE. agency.role_matching
--      stores a BUCKETED count, never a number, never broken down by any
--      attribute, behind a cooldown so a recruiter cannot ratchet the
--      threshold and watch the bucket move. It is named as a disclosure in
--      the DPIA. It is not described as zero.
--
-- public.recruiter_profile_snapshot IS NOT USED BY THIS FEATURE. That is the
-- ENRICHMENT door: recruiter-initiated, keyed by email, for a candidate the
-- recruiter already holds. Matching is consumer-initiated and keyed by
-- user_id. Two doors, two purposes, two consents — which is also why matching
-- gets its own opt-in below rather than riding on recruiter_visibility.
--
-- THIS AMENDS docs/AGENCIES_SCHEMA.md §3 and §5.3. Both must be edited to say
-- so, or a future session finds role_recommendations and deletes it as a
-- violation of decision 6.
--
-- Depends on: 20260813121000_agency_interview_loop.sql (sequence only).
-- Idempotent: safe to re-run against staging and production.

-- ============================================================
-- 1. CONSENT — the person's own, recorded, and revocable
-- ============================================================

-- Separate from public.profiles.recruiter_visibility on purpose. That flag
-- means "a recruiter who already has my CV may see my Tailr evidence".
-- This one means "roles I never applied to may find me". Different purpose,
-- different revocation consequence; folding them together would silently
-- widen what anyone who ticked the first had agreed to.
--
-- It also fixes a live weakness in that older flag: it is directly writable
-- by the user with no record of WHEN or AGAINST WHAT WORDING. Here the
-- preference row has no authenticated write path at all — it moves only
-- through a route that writes the consent event in the same operation.
create table if not exists public.match_preferences (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  matching_opt_in     boolean not null default false,
  -- Which consent copy they last acted on, so a wording change is visible
  -- rather than retroactively assumed.
  copy_version        text not null default '',
  opted_in_at         timestamptz,
  opted_out_at        timestamptz,
  updated_at          timestamptz not null default now()
);

alter table public.match_preferences enable row level security;

drop policy if exists match_preferences_select_own on public.match_preferences;
create policy match_preferences_select_own on public.match_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Deliberately no insert/update/delete policy. Writes are service-role only,
-- paired with the consent event below in one operation.

-- Append-only history. The table IS the record — a flag alone cannot answer
-- "when did they agree, and to what?", which is the first question anyone
-- asks about consent.
create table if not exists public.matching_consent_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  action        text not null check (action in ('granted', 'withdrawn')),
  copy_version  text not null,
  -- Coarse provenance only. No IP, no user agent: this is a consent record,
  -- not a security log, and over-collecting here would be its own problem.
  surface       text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists matching_consent_events_user_idx
  on public.matching_consent_events (user_id, created_at desc);

alter table public.matching_consent_events enable row level security;

drop policy if exists matching_consent_events_select_own on public.matching_consent_events;
create policy matching_consent_events_select_own on public.matching_consent_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No write policy of any kind, for anyone. Append-only means the app cannot
-- rewrite history even by mistake.

-- ============================================================
-- 2. THE PUBLISHED ROLE — a frozen copy on the consumer side
-- ============================================================
--
-- A snapshot, not a view of agency.job_roles. The person reads THIS, applies
-- against THIS, and their evidence map is scored against THIS — so a
-- recruiter editing requirements mid-flight cannot retroactively change what
-- somebody agreed to send.
create table if not exists public.published_roles (
  id                 uuid primary key default gen_random_uuid(),

  -- Plain uuids. No REFERENCES into the agency schema — see corollary 2.
  agency_id          uuid not null,
  role_id            uuid not null,

  agency_name        text not null,
  role_ref           text not null,
  title              text not null,
  company            text not null default '',
  location           text not null default '',
  seniority          text not null default '',
  salary_band        text not null default '',
  summary            text not null default '',

  -- The frozen requirement set: [{ref, text, weight}]. What the person sees
  -- and what the scan scored against are the same object.
  requirements       jsonb not null default '[]'::jsonb,
  requirements_hash  text not null,

  min_score          smallint not null check (min_score between 0 and 100),

  status             text not null default 'live'
                       check (status in ('live', 'paused', 'expired')),
  published_at       timestamptz not null default now(),
  expires_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists published_roles_role_idx
  on public.published_roles (role_id);

alter table public.published_roles enable row level security;

-- Its SELECT policy is created in section 3, after role_recommendations
-- exists — the policy depends on that table and cannot be written first.

-- ============================================================
-- 3. THE RECOMMENDATION — "a role found you"
-- ============================================================
create table if not exists public.role_recommendations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  published_role_id  uuid not null references public.published_roles(id) on delete cascade,

  score              numeric(5,2) not null check (score >= 0 and score <= 100),
  -- The same shape score_breakdowns holds on the agency side, so the number
  -- the person sees can be explained the way the recruiter's is.
  score_breakdown    jsonb not null default '{}'::jsonb,

  -- WHY this role found them: [{requirement_ref, strength, quote}]. Their own
  -- words, quoted verbatim, mapped to requirements. Never an inference about
  -- them as a person.
  evidence           jsonb not null default '[]'::jsonb,

  state              text not null default 'new'
                       check (state in ('new', 'seen', 'dismissed', 'applied')),
  seen_at            timestamptz,
  dismissed_at       timestamptz,
  applied_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (user_id, published_role_id)
);

create index if not exists role_recommendations_user_state_idx
  on public.role_recommendations (user_id, state, created_at desc);
create index if not exists role_recommendations_role_idx
  on public.role_recommendations (published_role_id);

-- The jsonb mirror of agency.candidate_evidence's evidence_quote_iff_present
-- and evidence_quote_bounds. MISSING renders explicitly and is never filled
-- with inferred content — that rule is the product's argument, and it has to
-- hold on the side the candidate reads too, not only in the recruiter's copy.
create or replace function public.matching_evidence_is_well_formed(p_evidence jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(
    -- missing ⇔ no quote, both directions
    ((item->>'strength') = 'missing') = ((item->>'quote') is null or btrim(item->>'quote') = '')
    -- and the same 1000-character cap
    and coalesce(char_length(item->>'quote'), 0) <= 1000
    and (item->>'strength') in ('strong', 'transferable', 'partial', 'missing')
  ), true)
  from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) as item;
$$;

alter table public.role_recommendations
  drop constraint if exists role_recommendations_evidence_well_formed;
alter table public.role_recommendations
  add constraint role_recommendations_evidence_well_formed
  check (public.matching_evidence_is_well_formed(evidence));

alter table public.role_recommendations enable row level security;

-- THIS POLICY IS WHAT MAKES "THERE IS NO JOB BOARD" STRUCTURALLY TRUE.
-- `select * from published_roles` as user B returns only the roles that
-- already found user B — even if a careless route is written later, and even
-- if someone forgets a where clause. Browsing is not a feature that is
-- switched off; it is a query that comes back empty.
drop policy if exists published_roles_select_recommended on public.published_roles;
create policy published_roles_select_recommended on public.published_roles
  for select to authenticated
  using (
    exists (
      select 1 from public.role_recommendations r
       where r.published_role_id = published_roles.id
         and r.user_id = (select auth.uid())
    )
  );

drop policy if exists role_recommendations_select_own on public.role_recommendations;
create policy role_recommendations_select_own on public.role_recommendations
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists role_recommendations_update_own on public.role_recommendations;
create policy role_recommendations_update_own on public.role_recommendations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- RLS says WHICH ROWS; the column grant says WHICH COLUMNS. Without the
-- column limit, the update policy above would let someone rewrite their own
-- score. Both grants are issued together in section 7.

-- And the trigger says WHICH TRANSITIONS. 'applied' is not a state a client
-- may claim: it means a bundle crossed the wall to an agency, and only the
-- apply route (service role), which actually does that, may say so.
create or replace function public.guard_recommendation_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state = 'applied' and old.state is distinct from 'applied' then
    -- Two ways to be the service role, because auth.role() reads a JWT claim
    -- and is NULL on a direct database connection. PostgREST sets both the
    -- claim and the database role; a superuser session has neither but could
    -- disable this trigger anyway, so refusing it would only be theatre.
    if auth.role() is distinct from 'service_role'
       and current_user not in ('service_role', 'postgres')
    then
      raise exception 'applied is set by the application route, not by the client';
    end if;
  end if;

  -- Applying is terminal. Dismissing afterwards would imply the bundle could
  -- be recalled, which it cannot — withdrawal is a separate, explicit path.
  if old.state = 'applied' and new.state <> 'applied' then
    raise exception 'an application cannot be un-applied';
  end if;

  if new.state = 'seen' and new.seen_at is null then
    new.seen_at := now();
  end if;
  if new.state = 'dismissed' and new.dismissed_at is null then
    new.dismissed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists role_recommendations_state_guard on public.role_recommendations;
create trigger role_recommendations_state_guard
  before update on public.role_recommendations
  for each row execute function public.guard_recommendation_state();

-- ============================================================
-- 4. THE AGENCY SIDE — settings, and the one thin disclosure
-- ============================================================
create table if not exists agency.role_matching (
  role_id              uuid primary key references agency.job_roles(id) on delete cascade,
  agency_id            uuid not null references agency.agencies(id) on delete cascade,

  enabled              boolean not null default false,
  min_score            smallint not null default 70 check (min_score between 0 and 100),

  -- The public row this role was published as. One-way pointer: agency → public.
  published_role_id    uuid,

  requirements_hash    text not null default '',
  last_scan_at         timestamptz,
  -- The cooldown is the anti-probing control, not a cost control. Without it
  -- a recruiter could move the threshold repeatedly and read the bucket
  -- changes as a signal about individuals.
  next_scan_allowed_at timestamptz,

  -- BUCKETED, never a number: 'none', 'fewer_than_5', '5_to_20', 'over_20'.
  -- Floored so a bucket of one is never distinguishable from a bucket of
  -- four, and never broken down by any attribute of anyone.
  matched_bucket       text not null default 'none'
                         check (matched_bucket in ('none', 'fewer_than_5', '5_to_20', 'over_20')),

  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table agency.role_matching enable row level security;

drop policy if exists role_matching_select_members on agency.role_matching;
create policy role_matching_select_members on agency.role_matching
  for select to authenticated
  using (agency_id in (select agency.member_agency_ids()));

-- Audit-coupled: no authenticated write policies. Publishing for matching is
-- a disclosure decision and every change to it lands in agency.audit_log in
-- the same operation, via a service-role route. If the UI shows an
-- AUDIT LOGGED pill, the client cannot write it directly.

-- ============================================================
-- 5. WIDENINGS — matched applicants are their own thing
-- ============================================================

-- 'matched', not 'tailr_profile'. That value means "enriched from a Tailr
-- profile under recruiter_visibility"; this one means "this person chose to
-- send themselves". Different consent, so a different word — collapsing them
-- would make the two indistinguishable in the audit trail.
alter table agency.candidates drop constraint if exists candidates_source_check;
alter table agency.candidates add constraint candidates_source_check
  check (source in ('upload', 'paste', 'ats', 'referral', 'tailr_profile', 'matched'));

alter table agency.ingestion_jobs drop constraint if exists ingestion_jobs_kind_check;
alter table agency.ingestion_jobs add constraint ingestion_jobs_kind_check
  check (kind in ('jd_parse', 'cv_parse', 'score', 'match_scan'));

-- ============================================================
-- 6. CLOSING A ROLE STOPS IT FINDING PEOPLE
-- ============================================================
--
-- Replaces agency.on_role_status_change() with the retention behaviour
-- BYTE-IDENTICAL to migration 5's, plus the published-role mirror. Read the
-- retention half as untouched; it is.
create or replace function agency.on_role_status_change()
returns trigger
language plpgsql
security definer
set search_path = agency, public
as $$
declare
  v_days integer;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    if new.closed_at is null then
      new.closed_at := now();
    end if;
    select retention_days into v_days from agency.agencies where id = new.agency_id;
    update agency.candidates c
       set retention_expires_at = new.closed_at + make_interval(days => v_days)
     where c.role_id = new.id;

    -- A closed role must stop appearing to people who never applied. The
    -- recommendation rows survive: they are the person's own record of what
    -- was shown to them, and deleting that would erase their side of it.
    update public.published_roles p
       set status = 'expired', updated_at = now()
     where p.role_id = new.id and p.status <> 'expired';

  elsif old.status = 'closed' and new.status <> 'closed' then
    new.closed_at := null;
    update agency.candidates c
       set retention_expires_at = null
     where c.role_id = new.id;

    -- Deliberately NOT un-expired. Reopening a role is a recruiter decision;
    -- putting it back in front of people is a separate one, made explicitly.
  end if;
  return new;
end;
$$;

-- ============================================================
-- 7. GRANTS
-- ============================================================
-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated. RLS already denies every write here (no policy exists), but
-- a grant and a policy are two different halves of the same rule, and leaving
-- the grant in place means the day someone adds a permissive policy for one
-- purpose they silently get insert, update and delete for every purpose.
-- Start from nothing and hand back only what each actor needs.
revoke all on public.match_preferences        from anon, authenticated;
revoke all on public.matching_consent_events  from anon, authenticated;
revoke all on public.published_roles          from anon, authenticated;
revoke all on public.role_recommendations     from anon, authenticated;

grant select on public.match_preferences        to authenticated;
grant select on public.matching_consent_events  to authenticated;
grant select on public.published_roles          to authenticated;
grant select on public.role_recommendations     to authenticated;

-- The ONLY write any client may perform in this feature: their own triage of
-- their own recommendation. Not the score, not the evidence, not 'applied'.
grant update (state, seen_at, dismissed_at) on public.role_recommendations to authenticated;

-- anon gets nothing at all: none of this is reachable without a session.

grant execute on function public.matching_evidence_is_well_formed(jsonb) to authenticated, service_role;
