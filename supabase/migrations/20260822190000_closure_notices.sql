-- Tailr — migration 33: closing a role closes the loop.
--
-- Nothing told the other candidates a role was filled — ghosting, which a
-- product arguing for candidate dignity should not facilitate. When the
-- recruiter closes a role, the candidates who were IN the process are told it
-- ended, what that means for their data, and nothing else.
--
-- One column, not a table: candidate_notices is the Art 14 machinery with its
-- own cron and grace window, and closure is a different thing — it fires once,
-- at close, to a set the code derives. The stamp makes it idempotent: a role
-- closed, reopened and closed again does not email anybody twice.
--
-- WHO is derived, not stored: a candidate is told the loop closed only if the
-- loop was ever opened with them — their considered-notice was SENT, or they
-- were interviewed. Somebody whose notice was suppressed has never heard from
-- Tailr about this role, and a closure email would be the FIRST contact,
-- which is worse than none.

alter table agency.candidates
  add column if not exists closure_notified_at timestamptz;

comment on column agency.candidates.closure_notified_at is
  'When this person was told the role ended. Stamped by lib/agency/closure.ts at role close; null means not told (never eligible, suppressed, or the close predates the feature). Idempotency lives here, not in the caller.';
