-- 'hold' joins the client's decisions on a shortlist.
--
-- Ose's spec for the interview phase gives the client three calls per
-- candidate, not two: interview, hold, decline. Hold is the one that was
-- missing — "not this wave, but do not write them off" — and without it a
-- client who is unsure has only a decline, which is the wrong signal
-- entirely and reaches the candidate as a closed door.
--
-- It is also what invitation waves will run on: the held are the reserve,
-- released when capacity opens.
--
-- REBUILT FROM THE DEPLOYED LIST. 'approve' and 'question' are the portal's
-- own verbs and stay; dropping either would break every action already
-- recorded. Same discipline as the audit_log entity_type rebuild, which
-- once silently dropped a value by starting from migration 1's list.
--
-- NOTHING IS REMOVED BY A HOLD. Like every other client action it is a
-- signal on a submission, never a state change on a person: no code path
-- turns it into a rejection, and the candidate is not told.
--
-- Run in tailr-staging first. Idempotent.

alter table agency.client_actions
  drop constraint if exists client_actions_action_check;

alter table agency.client_actions
  add constraint client_actions_action_check
  check (action in ('interview', 'approve', 'decline', 'question', 'hold'));

comment on column agency.client_actions.action is
  'The client''s call on one candidate in a submission. interview = into the interview cohort; hold = not this wave, kept in reserve; decline = not for this role; approve/question = the portal''s original verbs. All are signals, never removals.';
