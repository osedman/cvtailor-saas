-- ============================================================
-- Migration 37: evidence can have layers
--
-- Migration 11 (20260813121000) prepared candidate_evidence for interview
-- evidence: it added `round_id`, widened `origin` to include 'interview', and
-- added `evidence_round_iff_interview` so the two can never disagree. The
-- consent-withdrawal cascade in lib/agency/consent.ts already deletes
-- `origin='interview'` rows by round and rescores afterwards. The dossier
-- already reads `round_id` and renders a `round` layer. Everything was ready.
--
-- Except one thing, which is why per-round enrichment never shipped:
--
--     unique (candidate_id, requirement_id)
--
-- One row per candidate per requirement. Ingestion writes exactly one for
-- EVERY requirement (including a 'missing' row where there is no evidence),
-- so there is no room for a second row from a round. The columns existed and
-- could not be used.
--
-- The unique key becomes two partial ones:
--
--   · the BASE layer — what the CV, a Tailr profile or an application said —
--     stays exactly one row per requirement, so every existing upsert and
--     every ingest path behaves as before;
--   · a ROUND layer — one row per requirement per round, so round 1 and
--     round 2 can each say something about the same requirement without
--     overwriting the other or the CV.
--
-- WHAT THIS DOES NOT DO. It does not decide which layer wins; that is
-- lib/agency/rescore.ts, where the rule is "the latest layer wins, and a
-- recruiter override still beats them all". It does not create round
-- evidence — only lib/agency/enrichment.ts does, from a write-up a human
-- wrote. And it does not touch erasure: purge_candidate cascades on
-- candidate_id, and round evidence additionally cascades on round_id, so a
-- withdrawn consent still takes everything derived from it.
--
-- Idempotent. Safe to run twice.
-- ============================================================

-- The old key, named by Postgres from the table and columns.
alter table agency.candidate_evidence
  drop constraint if exists candidate_evidence_candidate_id_requirement_id_key;

-- One base row per requirement. `where round_id is null` is what keeps
-- ingest's upserts unambiguous: they never carry a round.
create unique index if not exists candidate_evidence_base_unique
  on agency.candidate_evidence (candidate_id, requirement_id)
  where round_id is null;

-- One row per requirement per round. A round may revisit a requirement once;
-- saying two different things about it in the same round is a contradiction
-- the database should refuse rather than a nuance it should store.
create unique index if not exists candidate_evidence_round_unique
  on agency.candidate_evidence (candidate_id, requirement_id, round_id)
  where round_id is not null;

-- Reading a candidate's layers is now a per-candidate ordered scan; the
-- dossier and the rescore both want it in creation order.
create index if not exists candidate_evidence_candidate_created_idx
  on agency.candidate_evidence (candidate_id, created_at);
