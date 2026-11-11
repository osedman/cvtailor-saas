-- Repair for 20260913120000_wave4_decisions_complete_and_proxy_hire.sql, which
-- applied cleanly and shipped two holes. Both were found by probing the
-- deployed schema rather than by reading the SQL back.
--
-- 1. THE CHECK PASSED ON NULL, IN THE DIRECTION THAT MATTERS.
--
--    (outside_process = true and length(trim(outside_process_reason)) > 0)
--
--    With the reason NULL, length(trim(NULL)) is NULL, NULL > 0 is NULL, and
--    `false or NULL` is NULL. A CHECK constraint refuses only on FALSE — NULL
--    passes. So outside_process could be set true with no reason at all,
--    which is the single thing the constraint existed to prevent. The other
--    direction (a reason without the flag) did refuse, which is how it looked
--    like it worked.
--
--    Probed both ways before and after: refused flag-without-reason was `f`,
--    refused reason-without-flag was `t`.
--
-- 2. service_role COULD NOT WRITE THE NEW TABLE.
--
--    agency.role_decision_completions was created with `grant select to
--    authenticated` and nothing else, on the assumption that service_role
--    picks writes up implicitly. It does not here: placements,
--    round_decisions and candidate_compliance all carry an explicit
--    service_role grant, and the new table carried none. The route would have
--    failed at runtime while every mocked test stayed green — the same shape
--    as the two tables this project has already shipped unwritable.
--
-- Idempotent and safe to re-run.

-- ── 1 · make the constraint NULL-safe ─────────────────────────────────────
alter table agency.placements
  drop constraint if exists placement_reason_iff_outside;
alter table agency.placements
  add constraint placement_reason_iff_outside check (
    (outside_process = false and outside_process_reason is null)
    or
    -- coalesce, so a NULL reason evaluates to FALSE rather than to NULL and
    -- the constraint actually refuses it.
    (outside_process = true and length(trim(coalesce(outside_process_reason, ''))) > 0)
  );

-- ── 2 · the role that actually writes it ──────────────────────────────────
-- Audit-coupled still means NO authenticated writes; it does not mean the
-- service role can go without. Same grant the other audit-coupled tables
-- carry, no more.
grant select, insert, update, delete on agency.role_decision_completions to service_role;

-- Belt and braces: the select grant from the first migration, restated so a
-- fresh environment applying only this file is not left half-granted.
grant select on agency.role_decision_completions to authenticated;
