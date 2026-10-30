-- Tailr for Agencies — migration 7: persist scoring baselines.
--
-- The CV parse judges per-candidate baselines (seniority calibration, context
-- fit, confidence, confidence level) that later rescores need unchanged: the
-- stored category values already include soft-signal and review adjustments,
-- so they cannot be recovered from the breakdown row itself. Store the raw
-- baselines alongside.
--
-- Shape: { "seniority": 80, "contextFit": 70, "confidence": 60, "confidenceLevel": 2 }
--
-- Idempotent: safe to re-run against staging and production.

alter table agency.score_breakdowns
  add column if not exists baselines jsonb not null default '{}'::jsonb;
