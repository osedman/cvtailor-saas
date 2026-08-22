-- Tailr — migration 30: the candidate can answer their own interview.
--
-- Until now scheduleRound() wrote the round and its audit row and told the
-- candidate nothing: the recruiter booked a time off the client's diary and
-- the candidate found out by phone, text, or not at all. Tailr held the round
-- and told the one person whose day it was least.
--
-- WHY A TOKEN AND NOT AN ACCOUNT. Same reasoning as consent and rights: a
-- candidate should not have to create a login to answer a question about their
-- own week. One token, one round, and it dies with the round.
--
-- The token is STORED AS A SHA-256 HASH, never in the clear, exactly like
-- consent_token_hash beside it — a leaked backup should not be a set of live
-- links into people's interviews.
--
-- candidate_response is deliberately separate from `status`. A decline is not
-- a cancellation by the agency and is emphatically not a withdrawal from the
-- role; keeping them apart means the audit trail can say which happened, and
-- the recruiter screen can tell "they said no to Thursday" from "we called it
-- off". `status` still moves to 'cancelled' when a candidate declines, because
-- the meeting genuinely is off — see lib/agency/booking.ts, which clears
-- slot_id in the same operation for the reason setRoundStatus() documents: a
-- cancelled round that keeps slot_id holds that window forever.

alter table agency.interview_rounds
  add column if not exists booking_token_hash text unique;

alter table agency.interview_rounds
  add column if not exists candidate_response text not null default 'pending'
    check (candidate_response in ('pending', 'confirmed', 'declined'));

alter table agency.interview_rounds
  add column if not exists candidate_responded_at timestamptz;

comment on column agency.interview_rounds.booking_token_hash is
  'SHA-256 of the candidate''s one-time booking link. Never stored in the clear. Cleared when the round ends so a spent link cannot be replayed.';

comment on column agency.interview_rounds.candidate_response is
  'What the candidate said about THIS TIME: pending, confirmed, declined. Never a statement about the role — declining a slot is not withdrawing, and nothing may read it as such.';

-- The doorway looks a round up by token hash on every request, so it gets its
-- own index rather than relying on the unique constraint's.
create index if not exists interview_rounds_booking_token_idx
  on agency.interview_rounds (booking_token_hash)
  where booking_token_hash is not null;

-- No new grants needed: interview_rounds already carries them, and the doorway
-- reads and writes through a service-role route like every other token
-- surface. Stated rather than assumed, because migration 1's
-- `grant all on all tables in schema agency` is a one-shot over tables that
-- existed then — a NEW table would have needed its own grant, and this is not
-- one. See lib/__tests__/agency-schema-grants.test.ts.
