-- Tailr for Agencies — migration 2 of 6: candidates, evidence, ingestion.
--
-- This is the migration that starts holding third-party personal data: CVs of
-- people who never signed up for Tailr. Every candidate row therefore carries
-- provenance (source, ingested_at, ingested_by) and a retention hook
-- (retention_expires_at) from day one. Migration 5 (retention/purge/notices)
-- must be applied before any REAL candidate CV is ingested — staging test data
-- only until then.
--
-- Depends on: 20260805120000_agency_core.sql.
-- Idempotent: safe to re-run against staging and production.

-- ============================================================
-- CANDIDATE REF ALLOCATION
--
-- Human refs (CAN-01, CAN-02) are per-role. A counter on job_roles avoids the
-- count()+1 race when two CVs upload concurrently. Gaps after failed inserts
-- are fine.
-- ============================================================

alter table agency.job_roles
  add column if not exists candidate_seq integer not null default 0;

create or replace function agency.next_candidate_ref(p_role uuid)
returns text
language plpgsql
volatile
security definer
set search_path = agency, public
as $$
declare
  v_next integer;
begin
  update agency.job_roles
     set candidate_seq = candidate_seq + 1
   where id = p_role
  returning candidate_seq into v_next;

  if v_next is null then
    raise exception 'unknown role %', p_role;
  end if;

  return 'CAN-' || lpad(v_next::text, 2, '0');
end;
$$;

revoke execute on function agency.next_candidate_ref(uuid) from public, authenticated;
grant execute on function agency.next_candidate_ref(uuid) to service_role;

-- ============================================================
-- CANDIDATES
-- ============================================================

create table if not exists agency.candidates (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  role_id        uuid not null references agency.job_roles on delete cascade,
  ref            text not null,                     -- 'CAN-01'
  full_name      text not null,
  email          text,                              -- nullable: redacted CVs exist
  current_title  text not null default '',
  years          numeric(4,1),
  location       text not null default '',
  salary_text    text not null default '',

  -- Provenance. Required on every row; this is the record-keeping obligation.
  source         text not null
                   check (source in ('upload', 'paste', 'ats', 'referral', 'tailr_profile')),
  source_detail  text not null default '',          -- filename, ATS name, referrer
  ingested_at    timestamptz not null default now(),
  ingested_by    uuid references auth.users on delete set null,

  -- Retention. Set by the role-close trigger (migration 5); purged by cron.
  retention_expires_at  timestamptz,
  erasure_requested_at  timestamptz,

  redacted        boolean not null default false,   -- partial/anonymised CV
  cv_storage_path text,                             -- 'agency-cvs' bucket; null for paste
  cv_text         text,                             -- extracted text; nulled by purge

  parse_status   text not null default 'pending'
                   check (parse_status in ('pending', 'parsing', 'parsed', 'failed', 'partial')),
  parse_error    text,
  parsed_at      timestamptz,

  -- Set by dedupe at ingestion. Surfaces a banner in the UI; NEVER auto-removes
  -- or auto-rejects the candidate. set null so purging the original candidate
  -- doesn't block or cascade into this one.
  duplicate_of   uuid references agency.candidates on delete set null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (role_id, ref)
);

create index if not exists candidates_agency_idx
  on agency.candidates (agency_id, created_at desc);
-- The purge job's scan (migration 5).
create index if not exists candidates_retention_idx
  on agency.candidates (retention_expires_at)
  where retention_expires_at is not null;

-- ============================================================
-- CANDIDATE IDENTITIES
--
-- Agency-wide duplicate detection without keeping a shadow pool of people.
-- Stores sha256(lower(trim(email))) — or a name-based fallback hash when the
-- CV has no email — never the raw identifier. One row per (identity,
-- candidate), so the same person appearing on three roles is three rows.
--
-- Service-role only: the dedupe check happens inside the ingestion path, and
-- migration 5's notice suppression list keys on the same hash. Recruiters see
-- the *result* (candidates.duplicate_of), not the index.
-- ============================================================

create table if not exists agency.candidate_identities (
  agency_id      uuid not null references agency.agencies on delete cascade,
  identity_hash  text not null,
  candidate_id   uuid not null references agency.candidates on delete cascade,
  first_seen_at  timestamptz not null default now(),
  primary key (agency_id, identity_hash, candidate_id)
);

create index if not exists candidate_identities_candidate_idx
  on agency.candidate_identities (candidate_id);

-- ============================================================
-- CANDIDATE EVIDENCE
--
-- One row per (candidate, requirement). The product promise — every score
-- traces to CV evidence or an explicit MISSING — is enforced here, not just
-- styled in the UI:
--
--   * strength = 'missing'  <=>  quote is null. Both directions. A strength
--     claim without a verbatim quote cannot be stored; ingestion must either
--     supply the quote or downgrade to missing. Recruiter judgement to the
--     contrary belongs in review_overrides (migration 3), where it is
--     attributed and audit-logged — not in the evidence map.
--   * Quotes are capped at 1000 chars so "quote" can't quietly become "the
--     whole CV", which is what makes them verifiable against the source.
-- ============================================================

create table if not exists agency.candidate_evidence (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency.agencies on delete cascade,
  candidate_id   uuid not null references agency.candidates on delete cascade,
  requirement_id uuid not null references agency.requirements on delete cascade,
  strength       text not null
                   check (strength in ('strong', 'transferable', 'partial', 'missing')),
  quote          text,
  source_cite    text not null default '',          -- 'CV · Experience · Monzo 2021-24'
  origin         text not null default 'cv'
                   check (origin in ('cv', 'tailr_profile')),
  created_at     timestamptz not null default now(),
  unique (candidate_id, requirement_id),
  constraint evidence_quote_iff_present
    check ((strength = 'missing') = (quote is null)),
  constraint evidence_quote_bounds
    check (quote is null or (btrim(quote) <> '' and char_length(quote) <= 1000))
);

create index if not exists candidate_evidence_requirement_idx
  on agency.candidate_evidence (requirement_id);

-- ============================================================
-- INGESTION JOBS
--
-- The observable state behind every async step: JD parse, CV parse, scoring.
-- The prototype's fake progress bars become polls over these rows, and the
-- error states (JD parse failure, CV parse failure, scoring down) render from
-- status + error_code. started/finished timestamps feed the "Parsed in 2.3s"
-- meta line.
-- ============================================================

create table if not exists agency.ingestion_jobs (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agency.agencies on delete cascade,
  role_id      uuid not null references agency.job_roles on delete cascade,
  candidate_id uuid references agency.candidates on delete cascade,  -- null for jd_parse
  kind         text not null check (kind in ('jd_parse', 'cv_parse', 'score')),
  status       text not null default 'queued'
                 check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts     smallint not null default 0,
  error_code   text,       -- 'unreadable_file' | 'model_error' | 'rate_limited' | 'timeout'
  error_detail text,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ingestion_jobs_role_idx
  on agency.ingestion_jobs (role_id, created_at desc);
create index if not exists ingestion_jobs_active_idx
  on agency.ingestion_jobs (agency_id, status)
  where status in ('queued', 'running');

-- ============================================================
-- UPDATED_AT
-- ============================================================

do $$ begin
  create trigger set_candidates_updated_at before update on agency.candidates
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger set_ingestion_jobs_updated_at before update on agency.ingestion_jobs
    for each row execute procedure public.set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- ROW LEVEL SECURITY
--
-- candidates:            members read; owner/recruiter insert+update; NO
--                        authenticated delete — removal happens only through
--                        the service-role erasure/purge path so the audit row
--                        always gets written.
-- candidate_identities:  service-role only (no policies at all).
-- candidate_evidence:    members read; writes service-role only. The evidence
--                        map is machine-parsed output; humans change the
--                        picture via overrides, not by editing evidence.
-- ingestion_jobs:        members read; writes service-role only.
-- ============================================================

alter table agency.candidates           enable row level security;
alter table agency.candidate_identities enable row level security;
alter table agency.candidate_evidence   enable row level security;
alter table agency.ingestion_jobs       enable row level security;

do $$ begin
  create policy "candidates_select" on agency.candidates for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "candidates_insert" on agency.candidates for insert
    with check (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "candidates_update" on agency.candidates for update
    using (agency.has_role(agency_id, 'owner', 'recruiter'))
    with check (agency.has_role(agency_id, 'owner', 'recruiter'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "candidate_evidence_select" on agency.candidate_evidence for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "ingestion_jobs_select" on agency.ingestion_jobs for select
    using (agency_id in (select agency.member_agency_ids()));
exception when duplicate_object then null; end $$;

-- ============================================================
-- GRANTS
-- ============================================================

grant select, insert, update on agency.candidates         to authenticated;
grant select                 on agency.candidate_evidence to authenticated;
grant select                 on agency.ingestion_jobs     to authenticated;
-- candidate_identities: no authenticated grant at all.
grant all on agency.candidates, agency.candidate_identities,
             agency.candidate_evidence, agency.ingestion_jobs to service_role;

-- ============================================================
-- STORAGE: original CV files
--
-- Decision (5 Aug): originals are kept — they are the audit trail's evidence
-- and what makes rectification requests answerable. They die with the same
-- purge that clears cv_text.
--
-- Bucket is private. Uploads happen ONLY server-side (service role, which
-- bypasses RLS) after validation — there is deliberately no authenticated
-- insert/update/delete policy. Members get read, scoped to their agency by the
-- first path segment: paths are '<agency_id>/<role_id>/<candidate_id>/<file>'.
-- The app normally serves short-lived signed URLs; the read policy is defense
-- in depth.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agency-cvs', 'agency-cvs', false,
  10485760,  -- 10 MB
  array['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  create policy "agency_cvs_member_read" on storage.objects for select
    using (
      bucket_id = 'agency-cvs'
      and (storage.foldername(name))[1] in
            (select a::text from agency.member_agency_ids() as a)
    );
exception when duplicate_object then null; end $$;
