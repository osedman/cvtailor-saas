-- ============================================================
-- Migration 22 · Transcription jobs
-- ============================================================
-- Transcribing an hour of audio takes minutes, so it cannot happen in a
-- request. It reuses agency.ingestion_jobs — the same queue that carries
-- jd_parse, cv_parse, score and match_scan — rather than growing a second
-- job system with its own retry semantics to get subtly wrong.
--
-- The queue needs to name a ROUND, which it could not before: a candidate
-- can sit in several rounds, so candidate_id + role_id does not identify
-- which interview to transcribe.

alter table agency.ingestion_jobs
  drop constraint if exists ingestion_jobs_kind_check;

alter table agency.ingestion_jobs
  add constraint ingestion_jobs_kind_check
  check (kind in ('jd_parse', 'cv_parse', 'score', 'match_scan', 'transcribe'));

alter table agency.ingestion_jobs
  add column if not exists round_id uuid references agency.interview_rounds on delete cascade;

comment on column agency.ingestion_jobs.round_id is
  'The interview round being transcribed. Null for every other job kind.';

-- One live transcription per round. A double-submit must not spend the
-- transcription budget twice on the same audio, and two concurrent writers
-- racing to fill one artifact is how a transcript ends up half one run and
-- half another.
create unique index if not exists ingestion_jobs_one_live_transcribe_per_round
  on agency.ingestion_jobs (round_id)
  where kind = 'transcribe' and status in ('queued', 'running');

-- The cron's pickup query.
create index if not exists ingestion_jobs_transcribe_queue_idx
  on agency.ingestion_jobs (created_at)
  where kind = 'transcribe' and status = 'queued';
