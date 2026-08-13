# Tailr for Agencies — schema & migration plan (proposal)

Status: **agreed 5 Aug 2026; ALL SIX migrations applied to `tailr-staging` and
RLS-verified same day — the data layer is complete** (isolation, cross-tenant write denial, evidence
constraints, identities lockdown, audit-coupled write lockdown — see
PROJECT.md). Production untouched.
Outstanding manual step: add `agency` to exposed schemas in the staging
dashboard. Test fixture (`rls-test-alpha` / `rls-test-beta`) left in staging
for Ose's own validation.
Base branch: cut from `origin/staging` (staging is ahead of both `main` and this
branch — latest applied migration there is `20260728172335_course_catalog.sql`).

---

## 1. The one big decision: a separate `agency` schema

Everything B2B lives in a dedicated Postgres schema, `agency`, in the **same**
Supabase database as the consumer app. Not `public` with an `agency_` prefix.

Why:

- **The privacy boundary becomes structural, not a code convention.** The rule
  "never expose `career_roadmaps` to recruiters" is enforced by the fact that the
  agency data-access client is constructed with `db: { schema: 'agency' }` and
  the only door into consumer data is one `security definer` function whose body
  is auditable in a single place.
- **Tenancy predicates differ.** Every consumer table's RLS is `auth.uid() =
  user_id`. Every agency table's is `agency_id in (...my agencies...)`. Mixing
  the two families in `public` makes it easy to write the wrong policy by
  copy-paste, which is exactly the failure mode that leaks a candidate pool.
- **Third-party PII gets its own retention regime.** Candidate rows are personal
  data about people who never signed up. Keeping them in a schema with its own
  purge job and its own erasure path keeps that obligation visible.

Cost: the agency app needs its own Supabase client wrapper, and `agency` must be
added to the project's exposed schemas. Both are one-time.

**Auth is shared.** One `auth.users` identity space. A person can be a consumer
user and an agency member simultaneously; the two are unrelated at the data
level. `public.profiles` stays the single profile row.

---

## 2. Tables

### 2.1 Tenancy

```sql
create schema if not exists agency;

create table agency.agencies (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text not null unique,
  -- default retention window for third-party CVs, from role close
  retention_days         integer not null default 180 check (retention_days between 1 and 3650),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table agency.members (
  agency_id   uuid not null references agency.agencies on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null check (role in ('owner','recruiter','viewer')),
  status      text not null default 'active' check (status in ('invited','active','suspended')),
  invited_by  uuid references auth.users,
  created_at  timestamptz not null default now(),
  primary key (agency_id, user_id)
);
```

Tenancy is resolved once, in SQL, and reused by every policy:

```sql
create or replace function agency.member_agency_ids()
returns setof uuid language sql stable security definer set search_path = agency, public as $$
  select agency_id from agency.members
  where user_id = auth.uid() and status = 'active';
$$;

create or replace function agency.has_role(p_agency uuid, variadic p_roles text[])
returns boolean language sql stable security definer set search_path = agency, public as $$
  select exists (
    select 1 from agency.members
    where agency_id = p_agency and user_id = auth.uid()
      and status = 'active' and role = any(p_roles)
  );
$$;
```

Every table below carries a denormalised `agency_id` (even where it is derivable
through `role_id`) so that **one** policy shape applies everywhere:

- `select`: `agency_id in (select agency.member_agency_ids())`
- `insert`/`update`: same, plus `agency.has_role(agency_id, 'owner','recruiter')`
- `delete`: `owner` only, and for candidates only via the erasure path (§2.6)

RLS is the backstop. The application-side rule stands: **`lib/agency/db.ts` is
the only module that builds queries, and every function takes an
`AgencyContext { agencyId, userId, role }` as its first argument.** No route
handler touches Supabase directly. UI never passes `agency_id` — it is derived
from the session.

### 2.2 Roles and requirements

```sql
create table agency.job_roles (                      -- "Role" in the PRD
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  ref            text not null,                      -- 'ROL-2418', unique per agency
  title          text not null,
  company        text not null default '',
  company_context text not null default '',
  salary_band    text not null default '',
  location       text not null default '',
  seniority      text not null default '',
  jd_raw         text not null default '',
  recruiter_notes text not null default '',          -- private, never in client output
  status         text not null default 'open'
                   check (status in ('draft','open','submitted','closed')),
  closed_at      timestamptz,
  created_by     uuid not null references auth.users,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (agency_id, ref)
);

create table agency.requirements (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agency.agencies on delete cascade,
  role_id     uuid not null references agency.job_roles on delete cascade,
  ref         text not null,                          -- 'R01'
  text        text not null,
  weight      text not null check (weight in ('must','important','nice')),
  category    text not null default '',
  origin      text not null default 'parsed' check (origin in ('parsed','recruiter')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (role_id, ref)
);

create table agency.role_constraints (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references agency.agencies on delete cascade,
  role_id    uuid not null references agency.job_roles on delete cascade,
  ref        text not null,                           -- 'C01'
  text       text not null,
  kind       text not null check (kind in ('location','work-mode','comp','other')),
  sort_order integer not null default 0,
  unique (role_id, ref)
);
```

`job_roles` rather than `roles` deliberately — `role` already means "permission
level" in this schema and in Postgres itself.

### 2.3 Candidates and third-party PII

Candidates are **role-scoped**, not agency-pool-scoped. That is what makes
"retention expires when the role closes" a clean, enforceable rule rather than a
per-row judgement call. Cross-role duplicate detection is handled by a separate
identity index that stores only a hash.

```sql
create table agency.candidates (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  role_id        uuid not null references agency.job_roles on delete cascade,
  ref            text not null,                        -- 'CAN-01'
  full_name      text not null,
  email          text,                                 -- nullable: redacted CVs exist
  current_title  text not null default '',
  years          numeric(4,1),
  location       text not null default '',
  salary_text    text not null default '',

  -- ingestion + provenance (required for every row, from day one)
  source         text not null check (source in ('upload','paste','ats','referral','tailr_profile')),
  source_detail  text not null default '',            -- filename, ATS name, referrer
  ingested_at    timestamptz not null default now(),
  ingested_by    uuid not null references auth.users,
  retention_expires_at timestamptz,                    -- set on role close; see §2.6
  erasure_requested_at timestamptz,
  redacted        boolean not null default false,      -- partial/anonymised CV
  cv_storage_path text,                                -- Supabase Storage, agency-scoped bucket
  cv_text         text,                                -- extracted, nullable after purge

  parse_status   text not null default 'pending'
                   check (parse_status in ('pending','parsing','parsed','failed','partial')),
  parse_error    text,
  parsed_at      timestamptz,
  duplicate_of   uuid references agency.candidates,    -- set by dedupe, never auto-removed
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (role_id, ref)
);

-- Agency-wide duplicate detection without keeping a shadow pool of people.
create table agency.candidate_identities (
  agency_id      uuid not null references agency.agencies on delete cascade,
  identity_hash  text not null,       -- sha256(lower(email)) or sha256(name|dob-ish fallback)
  candidate_id   uuid not null references agency.candidates on delete cascade,
  first_seen_at  timestamptz not null default now(),
  primary key (agency_id, identity_hash, candidate_id)
);
```

`parse_status = 'partial'` plus `redacted` is what drives the redacted-CV state
in the UI. `'failed'` + `parse_error` drives the CV-parse-failure state. Neither
ever removes the candidate from the list — consistent with "no automatic
rejection".

### 2.4 Evidence

```sql
create table agency.candidate_evidence (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  candidate_id   uuid not null references agency.candidates on delete cascade,
  requirement_id uuid not null references agency.requirements on delete cascade,
  strength       text not null check (strength in ('strong','transferable','partial','missing')),
  quote          text,                                  -- null iff strength = 'missing'
  source_cite    text not null default '',              -- "CV · Experience · Monzo 2021-24"
  origin         text not null default 'cv'
                   check (origin in ('cv','tailr_profile')),
  created_at     timestamptz not null default now(),
  unique (candidate_id, requirement_id),
  constraint missing_has_no_quote check (strength <> 'missing' or quote is null)
);
```

That last check constraint is the "`MISSING` is never filled with inferred
content" rule expressed in the database. Worth having.

### 2.5 Screening, decisions, scoring

Following the brief's split literally — screening data and decision data are
separate records.

```sql
-- CandidateReview: the screening call.
create table agency.candidate_reviews (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies on delete cascade,
  role_id       uuid not null references agency.job_roles on delete cascade,
  candidate_id  uuid not null references agency.candidates on delete cascade unique,
  status        text not null default 'unreviewed' check (status in ('unreviewed','reviewed')),
  recruiter_id  uuid not null references auth.users,
  communication smallint check (communication between 1 and 5),
  motivation    smallint check (motivation between 1 and 5),
  availability  text not null default '',
  salary_confirm text not null default '',
  notice_period text not null default '',
  call_answers  jsonb not null default '{}'::jsonb,   -- { probeIndex: answer }
  notes         text not null default '',             -- feeds submission narrative
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Current override state. History lives in the audit log.
create table agency.review_overrides (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  review_id      uuid not null references agency.candidate_reviews on delete cascade,
  requirement_id uuid not null references agency.requirements on delete cascade,
  from_strength  text not null check (from_strength in ('strong','transferable','partial','missing')),
  to_strength    text not null check (to_strength   in ('strong','transferable','partial','missing')),
  reason         text,
  recruiter_id   uuid not null references auth.users,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (review_id, requirement_id)
);

-- RecruiterReview: the shortlist decision.
create table agency.recruiter_reviews (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies on delete cascade,
  role_id       uuid not null references agency.job_roles on delete cascade,
  candidate_id  uuid not null references agency.candidates on delete cascade unique,
  decision      text check (decision in ('shortlist','hold','reject')),  -- null = undecided
  decision_note text not null default '',
  decided_by    uuid references auth.users,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

`decision` is nullable by design — clicking the active segment clears it, and
"undecided" is a real state shown in the sticky action bar totals.

Scoring is a **server-computed cache**, never a source of truth the client can
write:

```sql
create table agency.score_breakdowns (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references agency.agencies on delete cascade,
  candidate_id      uuid not null references agency.candidates on delete cascade,
  overall           numeric(5,2) not null,
  requirement_coverage numeric(5,2) not null,   -- 45%
  evidence_strength    numeric(5,2) not null,   -- 25%
  seniority_calibration numeric(5,2) not null,  -- 10%
  context_fit          numeric(5,2) not null,   -- 10%
  confidence_completeness numeric(5,2) not null,-- 10%
  must_have_hit     smallint not null,
  must_have_total   smallint not null,
  confidence_level  smallint not null check (confidence_level between 1 and 4),
  effective         jsonb not null default '{}'::jsonb,  -- reqId -> effective strength
  original_overall  numeric(5,2),                        -- pre-screening, for DeltaChip
  inputs_hash       text not null,     -- hash of requirements+evidence+overrides+signals
  engine_version    text not null,
  computed_at       timestamptz not null default now(),
  unique (candidate_id)
);
```

`inputs_hash` is the mechanism that satisfies "never let a frontend-computed
score reach a client-facing document": submission generation recomputes, compares
the hash, and refuses to render if the cache is stale. `engine_version` lets us
prove which scoring rules produced an archived submission.

RLS on `score_breakdowns` and `candidate_evidence`: `select` for members,
**no insert/update/delete policies at all** — written only by the service-role
scoring/ingestion path. Same trick already used for `beta_access` (migration 017).

### 2.6 Audit log, retention, erasure

```sql
create table agency.audit_log (
  id           bigserial primary key,
  agency_id    uuid not null references agency.agencies on delete cascade,
  role_id      uuid references agency.job_roles on delete set null,
  candidate_id uuid,                       -- intentionally no FK: survives erasure
  actor_id     uuid references auth.users,
  entity_type  text not null,              -- 'requirement' | 'override' | 'decision' | 'candidate' | 'submission'
  entity_ref   text not null,              -- 'R03', 'CAN-02'
  action       text not null,              -- 'created'|'edited'|'deleted'|'overridden'|'decided'|'generated'|'erased'
  from_value   jsonb,
  to_value     jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);
```

Append-only: `select` policy for members of the agency; **no** insert, update or
delete policies — writes go through service role only, and there is no path in
the app that deletes a row. `candidate_id` deliberately has no foreign key so
that erasing a candidate does not erase the record that they were considered and
why. The log stores refs and decisions, not CV content.

```sql
create table agency.erasure_requests (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies on delete cascade,
  candidate_id  uuid not null references agency.candidates on delete cascade,
  requested_at  timestamptz not null default now(),
  requested_by  uuid references auth.users,
  channel       text not null default 'recruiter' check (channel in ('recruiter','candidate','regulator')),
  status        text not null default 'pending' check (status in ('pending','completed','rejected')),
  completed_at  timestamptz,
  note          text not null default ''
);
```

Retention mechanics:

- Closing a role sets `candidates.retention_expires_at = now() + agencies.retention_days`
  for every candidate on it (trigger on `job_roles.status -> 'closed'`).
- A scheduled purge (pg_cron, mirroring the existing 03:00 course-catalog cron)
  nulls `cv_text`, deletes the Storage object, drops `candidate_evidence` quotes,
  and writes an `erased` audit row. Name, ref and score summary survive only in
  the audit log.
- Erasure requests run the same purge immediately.

### 2.7 Submissions

```sql
create table agency.submissions (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agency.agencies on delete cascade,
  role_id       uuid not null references agency.job_roles on delete cascade,
  format        text not null check (format in ('document','email','portal')),
  snapshot      jsonb not null,          -- fully-rendered content at generation time
  engine_version text not null,
  generated_by  uuid not null references auth.users,
  generated_at  timestamptz not null default now(),
  portal_token_hash text unique,         -- sha256; raw token shown once
  portal_expires_at timestamptz,
  revoked_at    timestamptz
);
```

`snapshot` makes a sent submission immutable — later overrides do not silently
rewrite what the client already received. Portal links are unauthenticated by
URL, so only the hash is stored and the row carries an expiry and a revoke.

### 2.8 Ingestion jobs (error states)

```sql
create table agency.ingestion_jobs (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agency.agencies on delete cascade,
  role_id      uuid not null references agency.job_roles on delete cascade,
  candidate_id uuid references agency.candidates on delete cascade,
  kind         text not null check (kind in ('jd_parse','cv_parse','score')),
  status       text not null default 'queued'
                 check (status in ('queued','running','succeeded','failed')),
  attempts     smallint not null default 0,
  error_code   text,                      -- 'unreadable_pdf' | 'model_error' | 'rate_limited' | 'timeout'
  error_detail text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

This table is what the six missing error/empty states actually read from. The
progress bar on the candidates screen becomes a poll (or Realtime subscription)
over these rows instead of a 60ms timer.

---

## 3. Consumer app: reused vs extended

**Reused unchanged**

| Table / module | Use |
|---|---|
| `auth.users`, `public.profiles` | one identity space; agency members are ordinary users |
| `public.rate_limits` + `consume_rate_limit()` RPC | JD parse, CV parse and scoring get new presets in `lib/rate-limit.ts` (`agency_parse`, `agency_score`) under the shared `ai:*` buckets |
| `lib/sanitize.ts` | output sanitisation on everything model-generated |
| `lib/anthropic.ts` | tool-use pattern; the untrusted-content framing already used in `app/api/first-cv/extract/route.ts:68` is the template for both JD and CV prompts |
| `lib/supabase/server.ts` | `createAdminClient()` is the service-role path for scoring/ingestion writes |

**Extended (one new column + one function, nothing else touched)**

```sql
alter table public.profiles
  add column if not exists recruiter_visibility boolean not null default false,
  add column if not exists recruiter_visibility_updated_at timestamptz;
```

Off by default, user-toggleable, revocable. Revocation takes effect on next
fetch because enrichment is **never copied** into the agency schema — it is read
through this function at request time:

```sql
create or replace function public.recruiter_profile_snapshot(p_email text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
  -- returns null unless a profile matches AND recruiter_visibility = true.
  -- Reads: career_evidence, career_profiles.sections, tailor_history-derived
  --        requirement coverage.
  -- NEVER reads: career_roadmaps, career_roadmap_items, first_cvs,
  --              cv_evidence_items, subscriptions, usage_logs.
$$;
```

`career_roadmaps` / `career_roadmap_items` are the candidate's private view of
their own weaknesses and are out of bounds. I'd like a unit test that asserts the
function body contains no reference to either table, so a future edit can't
quietly widen it.

**Match semantics, restated so the build can't get it wrong:**

- *Matched + opted in* → enrichment used; candidate gets `TAILR PROFILE`
  indicator; `candidate_evidence.origin = 'tailr_profile'` on enriched rows;
  `confidence_completeness` rises and the breakdown shows why.
- *Matched + not opted in* → **byte-for-byte identical** to unmatched. No row
  written, no flag, no timing difference the recruiter could read as a signal.
  This is why there is no `agency.consumer_links` table caching match results:
  a stored "this person is a Tailr user" row is itself the disclosure.
- *Unmatched* → normal CV-only parse. Default path.

---

## 4. Migration plan

Numbered with the timestamp convention (the last applied migration on staging
already uses it), so there is no collision with the `009`/`011` divergence
between this branch and `origin/staging`. All idempotent — `create ... if not
exists`, policies wrapped in the `do $$ ... exception when duplicate_object`
block used in `019_career_evidence.sql`.

| # | File | Contents | Ships with |
|---|---|---|---|
| 1 | `..._agency_core.sql` | schema, `agencies`, `members`, `member_agency_ids()`, `has_role()`, `job_roles`, `requirements`, `role_constraints`, `audit_log`, all RLS | Build step 1–2 |
| 2 | `..._agency_candidates.sql` | `candidates`, `candidate_identities`, `candidate_evidence`, `ingestion_jobs`, storage bucket + policies | Build step 3 |
| 3 | `..._agency_scoring.sql` | `candidate_reviews`, `review_overrides`, `recruiter_reviews`, `score_breakdowns` | Build step 4 |
| 4 | `..._agency_submissions.sql` | `submissions`, portal token index | Build step 6 |
| 5 | `..._agency_retention.sql` | `erasure_requests`, role-close trigger, `agency.purge_expired()`, pg_cron entry | with step 3, *before* any real CV is ingested |
| 6 | `..._recruiter_visibility.sql` | `profiles` columns + `recruiter_profile_snapshot()` | Build step 7 |

### 4.1 As-built deltas (files are the source of truth from here)

Where the shipped SQL deliberately differs from the §2 draft:

- **Migration 1** (`20260805120000_agency_core.sql`): all `auth.users` provenance
  FKs (`members.invited_by`, `job_roles.created_by`, `audit_log.actor_id`) are
  nullable `on delete set null` — a consumer account deletion must never be
  blocked by agency provenance. `job_roles.created_by` is therefore nullable,
  contra the draft. Added `agencies.role_seq` + `next_role_ref()` (service-role
  only) for ROL-XXXX allocation.
- **Migration 2** (`20260805130000_agency_candidates.sql`):
  - `job_roles.candidate_seq` + `next_candidate_ref()` (service-role only) for
    race-free CAN-0N refs.
  - `candidates.duplicate_of` and `candidates.ingested_by` are `on delete set
    null` (purging one candidate must not block or cascade into another).
  - The evidence quote constraint is **two-directional**:
    `(strength = 'missing') = (quote is null)`, plus a 1000-char cap and
    non-blank check. A strength claim without a quote is unstorable; recruiter
    judgement goes through `review_overrides` instead.
  - `candidate_identities` has **no authenticated policies or grants** —
    service-role only. Recruiters see `duplicate_of`, never the index.
  - `ingestion_jobs` gained `started_at`/`finished_at` (feeds "Parsed in 2.3s").
  - Storage: private `agency-cvs` bucket created in-migration with a 10 MB
    limit and PDF/DOCX-only MIME allowlist. Read policy scoped by first path
    segment = member agency; **no authenticated write policies** — uploads are
    server-side only. Path convention: `<agency_id>/<role_id>/<candidate_id>/<file>`.
- **Migration 3** (`20260805140000_agency_scoring.sql`):
  - **The audit-coupling rule**, a deliberate departure from §2's draft policy
    shape: every table whose changes are audit-mandated (`candidate_reviews`,
    `review_overrides`, `recruiter_reviews`, `score_breakdowns`, and — retro-
    tightened from migration 1 — `requirements`, `role_constraints`) has **no
    authenticated write policies or grants**. Writes happen only in API routes
    via the service role, in the same operation that writes the `audit_log`
    row, so the log cannot be bypassed by a direct PostgREST call. Rule of
    thumb: if the UI shows an `AUDIT LOGGED` pill for it, the client can't
    write it directly. Free-form surfaces (`job_roles`, `candidates` fields)
    keep RLS-scoped authenticated writes.
  - `score_breakdowns` carries `original_overall` (DeltaChip), bounds checks
    on every sub-score, and `musts_hit_lte_total`.
  - Provenance FKs (`recruiter_id`, `decided_by`) follow the nullable
    `on delete set null` pattern.
- **Migration 4** (`20260805150000_agency_submissions.sql`):
  - `submissions` **dropped the draft's `portal_token_hash`/`portal_expires_at`/
    `revoked_at` columns** — superseded by per-recipient rows in
    `submission_recipients` (§5.1 decision). Tokens stored as sha256 only.
  - `client_actions.candidate_id` is nullable `set null` with a denormalised
    `candidate_ref`, so "client approved CAN-02" survives candidate purge —
    same reasoning as `audit_log.candidate_id` having no FK.
  - `submission_recipients.contact_id` is `on delete restrict`: contacts with
    live submissions can't be deleted from under the attribution trail;
    contact erasure = service-role anonymisation, not row deletion.
  - Write model: contacts are authenticated-writable (address book);
    submissions/recipients/actions are service-role only per the
    audit-coupling rule. Portal clients are anonymous to Postgres — the portal
    route validates raw tokens by hash via service role and serves only the
    snapshot.
- **Migration 5** (`20260805160000_agency_retention.sql`):
  - `notice_delay_days` is **hard-capped at 28** (`notice_delay_within_art14`)
    so no configuration can exceed the Art 14 one-month outer bound.
  - `candidate_notices` enforces `suppressed ⇔ suppressed_reason` — a notice
    cannot be silently suppressed without a recorded reason.
  - `rights_requests.candidate_id` is nullable `set null` + denormalised
    `candidate_ref` (the draft's cascade FK would have deleted the erasure
    request record as a side-effect of executing the erasure).
  - Purge is `agency.purge_candidate()` (single implementation, service-role
    only): audit `erased` row with `{name, ref, overall}` — the only place
    those survive — then row delete; suppression-list insert on
    erasure/objection but NOT on retention expiry (a fresh upload for a new
    role is legitimate new processing). `agency.purge_expired()` wraps it and
    **returns cv storage paths** — the app cron deletes files via the Storage
    API, because SQL deletion of `storage.objects` rows orphans blobs. Until
    that cron route ships, no real candidate data may be ingested.
  - Role-close trigger stamps `closed_at` + candidate retention; reopen clears
    both. Verified live: close → +180d exactly; reopen → cleared; forced
    expiry → full cascade purge with client action + audit surviving.
- **Migration 6** (`20260805170000_recruiter_visibility.sql`):
  - `recruiter_profile_snapshot(email)` is **service-role-execute-only** —
    granting it to authenticated would let any logged-in user probe arbitrary
    emails for Tailr membership. Verified denied.
  - Snapshot exposes: Career Arc sections, `career_evidence` (hidden=false
    only, user's `rephrased_text` preferred over the raw claim), and coarse
    activity stats (counts/dates, never tailor content). Never reads
    roadmaps/first-CV/subscription tables; an app-side unit test should
    assert the function body references none of them.
  - Not-opted-in and unmatched exit through the same null path — verified
    identical. No `agency.consumer_links` cache exists by design; revocation
    is honoured at next fetch, and callers finding null for a candidate with
    `origin='tailr_profile'` evidence must delete those rows and rescore
    (contract in the migration header).
  - Verified against real staging data: opted-in account returned 16 evidence
    items + full Arc + activity stats; test account reset to opted-out after.

- **Migration 10** (`20260813120000_agency_client_auth.sql`) — **WRITTEN 13
  AUG, NOT YET APPLIED ANYWHERE**: §5.4 made SQL. Nullable
  `client_contacts.user_id` (set null) + partial lookup index (deliberately
  non-unique — one person may be several contacts); `client_invites` with
  raw-once token hashes (contact_id CASCADE: the invite is a grant in flight,
  the audit row is the durable trace); `audit_log.entity_type` widened once
  for the whole client-actor build. Member-select RLS only; invited users get
  no policy at all.
- **Migration 11** (`20260813121000_agency_interview_loop.sql`) — **WRITTEN 13
  AUG, NOT YET APPLIED ANYWHERE**: §5.5 made SQL, with three as-built deltas:
  - **Purge zero-breakage design, contra §5.5's letter.** "Extend
    `purge_candidate()` to return recording paths" would change that
    function's return shape and break the *deployed* cron/rights code in the
    apply-to-deploy window (migrations run first, by rule). As built:
    `purge_candidate` untouched; new read-only
    `candidate_recording_paths(uuid)` collector (service-role execute);
    `purge_expired()` recreated with an **added** `recording_paths text[]`
    column — old JS ignores the extra key, new JS deletes the blobs. Same
    single erasure path.
  - **`candidate_evidence.round_id` is CASCADE, not set null** — set null
    would trip `evidence_round_iff_interview`
    (`(origin='interview') = (round_id is not null)`); evidence sourced from
    a round cannot outlive it. Completed rounds are never app-deleted, so in
    practice this fires only under candidate purge.
  - **Booking is an index, not a status**: `interview_rounds.slot_id` partial
    unique index is the whole double-booking mechanism;
    `availability_slots` has no `booked` column to drift.
  - Everything else lands as decided: brief as pre-role object; per-round
    candidate consent columns with raw-once `consent_token_hash`; artifact
    `kind transcript/debrief` with `artifact_recording_iff_transcript`;
    transcript jsonb in Postgres, recording path + `verified_at` /
    `recording_deleted_at` for the cron sweep (partial index provided);
    append-only `round_decisions`; `candidate_references.notice_sent_at`;
    `handover_packs` snapshot discipline with in-app delivery only.

Sequencing rules, per the project's usual practice:

1. Every migration lands on **staging first**, verified there, then ported to
   production as a separate deliberate step. Migration before code, always.
2. Migration 5 is not optional and does not get deferred to "after launch" — the
   moment step 3 ships, the agency is holding third-party personal data.
3. Nothing in migrations 1–5 touches a `public.*` table. Migration 6 is the only
   one that does, and it is additive (two nullable-safe columns with defaults) —
   zero risk to the live consumer app.
4. `agency` must be added to the Supabase project's exposed schemas before
   migration 1 is useful from the app.

---

## 5. Decisions (5 Aug 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Agency onboarding | **Manual provisioning**, but with self-serve *teammate invites* inside an agency so Ose isn't the bottleneck at user #2. Owner can invite; agency creation stays manual. |
| 2 | `viewer` scope | **Split into two concepts** — see §5.1. Agency-side `viewer` = agency-wide read. Client-side people are a separate actor, not an `agency.members` role. |
| 3 | Retention | **180 days** from role close. Justified: covers the Equality Act tribunal window (3 months less a day) with buffer. Per-agency override already in schema. |
| 4 | CV file storage | **Keep the original.** It is a compliance asset, not just a UX nicety — see §5.2. |
| 5 | Portal links | **Unauthenticated token + expiry + revoke**, as designed. Client *actions* in the link are wanted — this changes the risk class, see §5.1. |
| 6 | Deployment | Same Next.js app under `/agencies`. Two new product threads raised — see §5.3. |

### 5.1 New: the client is a third actor

Q2 and Q5 collapsed into the same feature. A client-side hiring manager who sees
"only the roles the agency is representing them for" and a client who can hit
*Approve* / *Book interview* in the portal link are the same person with the same
permission set. Design them together as one surface, not two.

Modelling: clients are **not** `agency.members`. They are
`agency.client_contacts` scoped to a `client_company`, with access granted
per-submission (or per-role), and they never see the agency's internal view —
no recruiter notes, no rejected candidates, no evidence overrides.

```sql
create table agency.client_contacts (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agency.agencies on delete cascade,
  company      text not null,
  email        text not null,
  full_name    text not null default '',
  created_at   timestamptz not null default now(),
  unique (agency_id, email)
);

-- One row per recipient, so actions are attributable and links are revocable
-- individually. Replaces the single portal_token_hash on agency.submissions.
create table agency.submission_recipients (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  submission_id  uuid not null references agency.submissions on delete cascade,
  contact_id     uuid not null references agency.client_contacts on delete cascade,
  token_hash     text not null unique,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz
);

-- The PRD's "Outcome" object. Client-side actions land here.
create table agency.client_actions (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agency.agencies on delete cascade,
  recipient_id uuid not null references agency.submission_recipients on delete cascade,
  candidate_id uuid not null references agency.candidates on delete cascade,
  action       text not null check (action in ('interview','approve','decline','question')),
  message      text not null default '',
  created_at   timestamptz not null default now()
);
```

**Per-recipient tokens are non-negotiable once actions exist.** With one shared
link, a forwarded email means an unknown party can approve a candidate and the
audit log records "someone with the link". Per-recipient tokens make every
action attributable to a named contact, and let the recruiter revoke one
person's access without killing everyone's.

Client actions are *signals to the recruiter*, never state changes on the
shortlist. `decline` does not remove a candidate — same no-auto-rejection rule.

### 5.2 Why keeping the original CV is the safer choice

Extracting the text and keeping our own structured document does **not** reduce
the regulatory footprint. The extract is still personal data on the same
retention clock, and a structured evidence map with scores attached is arguably
*more* sensitive than the source PDF because it is profiling output.

Keeping the original cuts the other way and helps:

- **It is the audit trail's evidence.** The whole product claim is "every score
  traces to a quote". If the source document is gone, the quote is unverifiable
  and an override dispute has nothing to resolve against.
- **Right to rectification** (UK GDPR Art 16) is answerable — a candidate saying
  "your system says I lack Go" can be checked against the actual document.
- Both artefacts die together on the same purge job, so there is no divergence.

The real compliance gap is **not storage format** — it is that nobody has told
the candidate. Three artefacts needed before the first real CV is ingested:

1. **Article 14 notice.** Personal data collected indirectly obliges the
   controller (the agency) to inform the individual, generally within a month.
   Tailr should *build the mechanism* — a templated candidate notice fired on
   ingestion — and make it a selling point. Nobody in the market does this well.
2. **A DPA** between Tailr (processor) and each agency (controller). Needed
   before the first design partner uploads a real CV, not after.
3. **A DPIA.** Systematic profiling to inform decisions about people almost
   certainly triggers Art 35. The mitigations are already designed in
   (human-in-the-loop, no auto-rejection, explicit `MISSING`, full audit log) —
   the DPIA is largely writing down what we already built.

*Not legal advice — needs a data-protection review before launch.*

### 5.2b Candidate notice — IN SCOPE for v1 (decided 5 Aug)

The Article 14 notice mechanism ships in v1. Design decisions:

- **Delay window, hard auto-fire.** Scheduled for **day 7** after ingestion, not
  sent on upload. In the window the recruiter may (a) send now, (b) add a
  personal line, or (c) record *"already informed by other means"* with a note —
  which suppresses the send but writes an audit row, putting the assertion on
  the agency. If nothing happens, it fires at day 7. **The auto-fire is not
  switch-off-able.** That is the whole value; an optional notice is a checkbox
  no agency can point to in an audit.
- **Tone: good news first.** Opens with "Acme Recruitment is considering you for
  a senior backend role at a fintech in London." Rights/retention content sits
  below. The normal candidate experience is silence, so this reads as a
  candidate-experience upgrade the agency can market.
- **Do not name the client company** by default — protects the agency's client
  relationship and the candidate's position.
- **Reply-to = the recruiter**, so interested candidates reach a human.
- **Sender:** only `gettailr.com` is a verified Resend sender, so notices send
  from Tailr's domain with the agency named prominently in the body.
  See [[resend-email-setup]].
- **No marketing use.** The notice landing page is not a consumer acquisition
  funnel — repurposing legally-obtained contact details is a purpose-limitation
  breach and would discredit the feature. A quiet footer line is the ceiling.
- **Suppression list** keyed on `agency_id + identity_hash`, so a re-upload after
  an objection or erasure does not re-notify or re-process.
- **No contact details** (redacted CVs, job-board scrapes) → record
  `suppressed_reason = 'no_contact_details'`; the Art 14(5)(b) disproportionate-
  effort exemption plus the agency's public privacy notice is the fallback.
  Never silently skip without a record.

Schema consequences, landing in migration 5:

- `agency.candidate_notices` — one row per candidate: `channel`, `status`
  (`scheduled|sent|suppressed|bounced|failed`), `scheduled_for`, `sent_at`,
  `personal_note`, `suppressed_reason`, `suppressed_by`, `template_version`.
- `agency.notice_suppressions` — `(agency_id, identity_hash, reason, created_at)`.
- **Generalise `erasure_requests` → `agency.rights_requests`** with
  `kind in ('access','rectification','erasure','objection')`. The notice landing
  page posts straight into it, so the candidate-facing rights flow and the
  recruiter-initiated erasure path share one queue.
- `agency.agencies` gains `notice_delay_days` (default 7), `notice_from_name`,
  `notice_reply_to`.

### 5.3 Parked: two threads from Q6

Both raised 5 Aug, neither in the current 7-step build. Captured so they aren't
lost — see the brainstorm notes for the argument.

- **A. Quick person-to-role analysis.** One CV against one JD, scored, no role
  or shortlist required. Small build, reuses the whole scoring engine. Strongest
  candidate for the free wedge / demo / API surface. **Recommend building early**
  as a by-product of step 3 rather than parking it.
- **B. Sourcing from the Tailr consumer pool.** Recruiter browses/selects
  existing Tailr users who fit a role. This is a *different product* — a
  two-sided marketplace with a different consent model, not an extension of the
  enrichment feature. Needs its own consent tier, and its quality is gated on
  consumer liquidity in the specific niche. **Recommend the inverted design**
  (candidate-initiated opt-in per role) over recruiter-initiated search.
  **Decided 5 Aug: parked, not in v1.** Consumer *enrichment* (step 7) is
  unaffected and still ships — only recruiter-side discovery is out.

### 5.4 Client-actor auth model (decided 13 Aug 2026, workshop with Ose)

Context: the hiring-manager loop concept
([Figma](https://www.figma.com/design/AWRRbEOX6rLsltutFDL3zs)) needs HMs to
log in, post role briefs, review shortlists, run interview rounds and make
decisions. Three facts in the as-built schema shaped the decision:
`client_contacts` is per-agency (`unique(agency_id, email)`) with **no
user_id**; portal viewers are **anonymous to Postgres** (service-role routes
match token hashes against snapshots); and `client_actions.recipient_id` is
NOT NULL → `submission_recipients`, so all client attribution today hangs off
a submission — but the HM concept has clients acting *before* any submission
exists (brief, availability) and *between* them (round decisions).

Decided, all four on the recommended option:

1. **One auth pool; roles are relationships, not account types.**
   `auth.users` is the person. Consumer (`profiles`), recruiter
   (`agency.members`) and HM (linked `client_contacts`) are orthogonal hats
   one person may hold — an HM can privately be a consumer job-seeker and
   that must never fork accounts or leak across planes. Post-login routing by
   hat lookup; switcher for multi-hat users. Rejected: a separate client auth
   system.

2. **Linkage = `client_contacts.user_id uuid null references auth.users on
   delete set null`, invite-only.** Recruiter invites a contact (audited:
   who granted client access, when); HM accepts on a verified email;
   `user_id` binds. **No email-matching self-claim** — "an agency once typed
   your email" must not become account access, and grants must keep their
   attribution. Multi-agency = one auth user linked to N per-agency contact
   rows, each independently granted and revocable (unlink = set null; access
   dies on next request). `set null` preserves the provenance invariant —
   consumer/HM account deletion is never blocked; contact-row erasure remains
   service-role anonymisation (the `submission_recipients.contact_id`
   RESTRICT trail is untouched by linking).

3. **HMs get ZERO RLS grants — API-only access, extending the portal
   precedent.** The HM view is disclosure-filtered, not row-filtered: live
   tables hold recruiter-private material (`candidate_reviews.notes`,
   undisclosed evidence), so any direct read policy is one mistake away from
   showing a client their recruiter's inner workings. Audit-coupled tables
   already have no authenticated writes; client actors additionally have no
   authenticated reads on recruiter tables. Every HM read flows through
   service-role routes shaped by snapshot/disclosure rules; RLS stays as
   default-deny. Hat detection is a per-request service-role lookup of
   `client_contacts where user_id = auth.uid()` (JWT custom claims later as
   an optimisation, not v1).

4. **`client_actions` is not widened.** It stays the portal-token signal
   table. The interview loop gets its own tables keyed by
   `(agency_id, contact_id)` + actor `user_id` — briefs, availability,
   rounds, round decisions, handover — all service-role written with audit
   rows in the same operation (AUDIT LOGGED pill). Round decisions carry real
   state (progression), but state machine and candidate visibility stay
   separate: decline never hides anyone. Detailed DDL is its own workshop.

5. **Sign-in: magic link only for HMs in v1.** Every sign-in re-proves email
   ownership — the same trust the invite rests on. No password support
   burden for a weekly-at-most user class. SSO later for enterprise clients.

6. **Portal tokens coexist permanently.** Token = one submission, one
   lightweight reviewer; account = the full loop. The recipient-revocation
   UI (the standing gap) gets built as part of this work.

7. **Deployment: same Next.js app, own route group** (e.g. `/hiring`
   alongside `/agencies`) — one Vercel project, shared design system and API
   routes. Rejected: separate deployment (doubles env-var management, which
   has burned this project before).

### 5.5 Interview-loop DDL (decided 13 Aug 2026, workshop with Ose)

Scope: invites + the interview loop (briefs → availability → rounds →
artifacts → decisions → references → handover). **Job board + applicant pool
DDL is explicitly NOT here** — it touches the consumer schema and Art 13
flows and gets its own workshop. No migration applied yet; files to be
written from this section.

Pattern for every new table: `agency` schema · RLS enabled · recruiter
member READS via `member_agency_ids()` · writes service-role-only with the
audit row in the same operation (AUDIT LOGGED pill) · HMs zero policies
(§5.4).

The set:

1. **`client_invites`** — agency_id · contact_id (cascade) · token_hash
   unique (raw once) · invited_by (set null) · expires_at · accepted_at /
   accepted_by · revoked_at. Accept binds `client_contacts.user_id`. Plus
   the §5.4 linkage ALTER itself (nullable user_id + partial index).
2. **`role_briefs`** — **pre-role object, recruiter converts** (decided):
   status submitted/accepted/declined; accepting mints the job_role (ROL ref
   then, not before) and stamps nullable role_id (set null). contact_id
   restrict. Declining a brief is allowed and audited — no-auto-rejection
   protects candidates, not briefs.
3. **`availability_slots`** — contact_id · optional role_id · starts_at /
   ends_at · revoked_at. Booked is NOT a status column: a slot is booked iff
   a round references it (unique index on `interview_rounds.slot_id`).
4. **`interview_rounds`** — candidate_id **cascade** (a round is candidate
   PII; purge takes it) · unique(role_id, candidate_id, round_number) ·
   contact_id restrict · slot_id · meeting_url · status
   scheduled/completed/cancelled · DPIA columns: capture_consent_status
   (pending/granted/declined/withdrawn), capture_consent_at,
   consent_token_hash unique — consent is per-round, from the candidate,
   with its own token trail, never an HM assertion.
5. **`round_artifacts`** — round_id unique cascade · kind
   **transcript/debrief** (declined consent is a kind, not a missing row, so
   no-artifact-no-progression stays enforceable) · **content jsonb in
   Postgres** (decided: ~50KB/45min; purge = row cascade, atomic) ·
   recording_path (Storage) · verified_at · recording_deleted_at ·
   engine_version. Cron sweep deletes recordings where verified and not yet
   deleted. **`purge_candidate()` must be extended to return recording
   paths** alongside CV paths.
6. **Transcript evidence: NO new table** — widen `evidence.origin` check
   with an interview value + nullable round_id (cascade).
   `evidence_quote_iff_present` polices transcript claims for free.
7. **`round_decisions`** — **append-only** (decided): reversal inserts a new
   row, latest wins; the table is its own history, matching
   review_overrides' ethos. decision advance/hold/decline · contact_id
   restrict · decided_by set null · candidate_ref denorm survives purge.
   No value here ever touches candidate visibility.
8. **`candidate_references`** — candidate_id cascade + candidate_ref denorm ·
   referee name/email/relationship · request_token_hash · **notice_sent_at**
   (referees are data subjects; the fair-processing notice is a column) ·
   status drafted/requested/received/chasing/declined · content jsonb,
   attributed verbatim.
9. **`handover_packs`** — submission discipline: immutable snapshot jsonb,
   engine_version, generated_by, **delivered in-app to the contact only**
   (decided; tokened HR recipients buildable later without rework) ·
   delivered_to_contact_id restrict · candidate_ref denorm + candidate_id
   set null. Generation refuses on stale inputs_hash.

Reused, not rebuilt: notice machinery (candidate + referee notices via
gettailr.com/Resend), cron route (gains recording sweep + slot expiry),
retention (role close → purge cascades rounds → artifacts → references).

## 6. Note on the UI phase

Per the project's standing rule, the UI work in build steps 2–7 goes through
Figma before any component is written, even though the handoff is hifi — the
prototype's tokens map onto Tailr brand v1.0 but the six missing error/empty
states have no design at all and need designing rather than improvising.
