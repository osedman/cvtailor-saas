-- Tailr — migration 31: 'booking_answered' joins the switchable notifications.
--
-- The candidate booking doorway (migration 30) lets somebody confirm or
-- decline their own interview. The recruiter has to hear about that, or the
-- feature rebuilds the exact polling problem notifications were added to fix
-- two hours earlier — worse, because a declined slot silently returning to the
-- client's board is a change nobody asked to be told about.
--
-- Same shape as the other five: agency-bound, switchable per person over an
-- agency default. Absent still means ON.
--
-- Note this list is REBUILT from the complete deployed set plus the new value,
-- not from migration 29's list with an addition — the same rule
-- audit-entity-types.test.ts enforces for audit_log, applied here by hand
-- because this constraint has no test of its own yet.

alter table agency.notification_prefs
  drop constraint if exists notification_prefs_event_kind_check;

alter table agency.notification_prefs
  add constraint notification_prefs_event_kind_check
    check (event_kind in (
      'brief_filed',
      'invite_accepted',
      'debrief_recorded',
      'consent_answered',
      'reference_submitted',
      'booking_answered'
    ));
