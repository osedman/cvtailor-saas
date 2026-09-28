-- ============================================================
-- THE JOB DESCRIPTION RIDES ON THE BRIEF
-- 26 September 2026 · decided with the founder 24–26 Sep
--
-- The client brief (agency.search_briefs, 23 Sep) says HOW a search runs.
-- The job description says WHAT is being searched for, and until now it
-- lived only on the role (job_roles.jd_raw), typed or uploaded by the
-- recruiter after the terms were agreed. Clients kept sending it by email.
--
-- Now it is an attachment on the brief. Either side may attach it; the
-- client sees it and may replace it; a replaced file is an amendment that
-- both sides sign again — through the existing version machinery, because
-- the version's config carries the file's id (config.jdFileId) and a
-- different id is a different config. When a role connects to the brief
-- the extracted text lands in job_roles.jd_raw if that is empty.
--
-- ONE BUCKET, ONE TABLE:
--
--   storage bucket agency-briefs   — the bytes. PRIVATE, NO POLICIES: the
--                                    same shape as agency-recordings. Every
--                                    byte moves through a service-role route
--                                    that has already checked who is asking.
--   agency.search_brief_files      — the pointer. One row per uploaded
--                                    file: where it is, what it is called,
--                                    who attached it, and the text pulled
--                                    out of it, capped by the route.
--
-- THE ROW IS THE POINTER THAT MAKES THE BLOB ERASABLE. Nothing finds a file
-- in the bucket except through storage_path on this table, so a blob whose
-- row was never written is a file no erasure, purge or discard can reach.
-- The route writes the row in the same function as the upload and removes
-- the blob at once if the insert fails (the CV pointer lesson of 19 Sep).
--
-- WHO SEES IT: the two sides of the brief and nobody else. Never a
-- candidate, never a referee, never a token doorway. The browser holds NO
-- grant on this table at all — not even select — because a hiring manager
-- and a recruiter both read it through routes scoped to their own side.
-- ============================================================

-- ------------------------------------------------------------
-- The bucket
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agency-briefs',
  'agency-briefs',
  false,
  10485760,  -- 10 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- PRIVATE, AND NO POLICIES ON PURPOSE. storage.objects has RLS on, so with
-- zero policies the `authenticated` role can do nothing here — no read, no
-- write, no list. Service role only.

-- ------------------------------------------------------------
-- The pointer
-- ------------------------------------------------------------
create table if not exists agency.search_brief_files (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references agency.agencies on delete cascade,
  brief_id          uuid not null references agency.search_briefs on delete cascade,
  -- `${agency_id}/${brief_id}/${id}/${safe_name}` in the agency-briefs bucket.
  storage_path      text not null unique,
  name              text not null,
  content_type      text not null,
  size_bytes        int  not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256            text not null,
  -- Extracted by the route (lib/extract-file-text.ts), capped at 20 000
  -- characters there. Never selected on a list path.
  text              text not null default '',
  text_chars        int  not null default 0,
  uploaded_by_side  text not null check (uploaded_by_side in ('recruiter', 'client')),
  uploaded_by       uuid references auth.users on delete set null,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table agency.search_brief_files is
  'The job description attached to a client brief. THE ROW IS THE POINTER THAT MAKES THE BLOB ERASABLE: nothing reaches a file in the agency-briefs bucket except through storage_path here, so the route writes this row in the same function as the upload and removes the blob if the insert fails. Read by the two sides of the brief only, through service-role routes; the browser holds no grant.';

create index if not exists search_brief_files_brief_idx
  on agency.search_brief_files (brief_id);
create index if not exists search_brief_files_agency_idx
  on agency.search_brief_files (agency_id);

-- ------------------------------------------------------------
-- RLS + GRANTS
--
-- Service role only. The brief tables grant the browser SELECT; this one
-- grants it nothing, because the file's text is the client's job
-- description and a hiring manager holds no agency membership to scope a
-- policy on. Both sides read through routes (lib/agency/brief-files.ts).
--
-- The explicit service_role grant is not optional — `grant all on all
-- tables in schema agency` was a point-in-time grant (22 Aug 2026).
-- ------------------------------------------------------------
alter table agency.search_brief_files enable row level security;

grant select, insert, update, delete on agency.search_brief_files to service_role;

-- ------------------------------------------------------------
-- Audit entity type
--
-- 'brief' already exists in the audit_log check. Uploads write
-- action 'brief_jd_attached' against it. Nothing to widen.
-- ------------------------------------------------------------
