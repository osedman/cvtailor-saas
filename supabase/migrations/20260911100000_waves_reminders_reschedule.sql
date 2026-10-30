-- Waves, reminders and rescheduling: the rest of the interview phase.
--
-- All three hang off facts the round already carries, so this is four
-- columns and two settings rather than new tables.
--
-- WAVES. Twenty people racing for eight windows is the problem; inviting in
-- waves is the answer. `wave_size` is how many go out at once (null = all of
-- them, which is today's behaviour and stays the default). The rest are the
-- reserve, released when a wave has had `wave_release_hours` to answer or
-- when capacity opens. `interview_rounds.wave` records which wave somebody
-- went out in, so a release can tell what has already gone.
--
-- REMINDERS. Two kinds, and a round records each separately: a nudge to
-- somebody who has not booked, and a reminder before an interview they did
-- book. Stamped so the cron cannot send the same one twice — the alternative
-- is a job that mails people every time it runs.
--
-- RESCHEDULING. `reschedule_policy` already exists on the settings;
-- `rescheduled_count` is what makes it enforceable, because "you may move it
-- once" is otherwise unprovable after the fact.
--
-- Run in tailr-staging first. Idempotent.

alter table agency.interview_settings
  -- Null means invite everyone at once. A number is the wave.
  add column if not exists wave_size           smallint
                             check (wave_size is null or wave_size between 1 and 50),
  add column if not exists wave_release_hours  smallint not null default 48
                             check (wave_release_hours between 1 and 336),
  -- How many times one candidate may move their own interview.
  add column if not exists reschedule_limit    smallint not null default 1
                             check (reschedule_limit between 0 and 10);

comment on column agency.interview_settings.wave_size is
  'How many candidates are invited to book at once. Null invites everyone. The rest wait as the reserve and are released when a wave has had its time or when capacity opens.';

alter table agency.interview_rounds
  add column if not exists wave               smallint not null default 1
                            check (wave between 1 and 100),
  -- Nudges to somebody who has not booked yet.
  add column if not exists last_reminded_at   timestamptz,
  -- The reminder before an interview they did book. Separate, because one
  -- is about an unanswered invitation and the other about an imminent
  -- meeting, and sending either twice is its own kind of rude.
  add column if not exists pre_reminded_at    timestamptz,
  add column if not exists rescheduled_count  smallint not null default 0
                            check (rescheduled_count >= 0);

comment on column agency.interview_rounds.wave is
  'Which invitation wave this round went out in. Derived at invitation, never edited.';

create index if not exists interview_rounds_reminder_idx
  on agency.interview_rounds (agency_id, status, scheduled_at)
  where status = 'scheduled';
