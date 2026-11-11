-- ============================================================
-- Migration 23 · The brief carries the JD
-- ============================================================
-- The simplified intake (Ose, 20 Aug): the hiring manager posts the job
-- description WITH the brief, accepting the brief carries it straight into
-- the minted role's jd_raw, and the recruiter parses from there. This
-- replaces the client-confirmation loop that was designed on 17 Aug and
-- parked — the structured brief fields stay, as context the parser reads
-- alongside the document.

alter table agency.role_briefs
  add column if not exists jd_raw text not null default '';

comment on column agency.role_briefs.jd_raw is
  'The job description as the hiring manager pasted it. Carried into the minted role''s jd_raw on accept; the parse runs against it plus the structured brief fields.';
