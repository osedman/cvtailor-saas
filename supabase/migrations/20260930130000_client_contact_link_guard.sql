-- Tailr — a hiring manager's workspace link moves only through the invite
-- flow (30 Sep 2026 access audit).
--
-- client_contacts.user_id is what makes a signed-in person that client's
-- hiring manager. The app only ever sets it through acceptInvite (service
-- role, email-matched, audited) and clears it through unlinkClientContact
-- (service role, audited). But the row policy lets an owner or recruiter
-- UPDATE the row directly through the REST API, so a recruiter could link
-- any account as a hiring manager in their own agency — no invite, no email
-- match, no audit row. It stayed inside their own agency, which is why it was
-- low severity; it is still a door around the one audited path.
--
-- Guard: signed-in API roles cannot set or change user_id. The service role
-- (every app write of this column) and postgres are unaffected.
-- Idempotent: safe to re-run.

create or replace function agency.client_contacts_guard_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and new.user_id is not null then
      raise exception 'client_contacts.user_id is set by accepting an invitation';
    end if;
    if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
      raise exception 'client_contacts.user_id is set by accepting an invitation';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function agency.client_contacts_guard_link() from public, anon, authenticated;

drop trigger if exists client_contacts_guard_link on agency.client_contacts;
create trigger client_contacts_guard_link
  before insert or update on agency.client_contacts
  for each row execute function agency.client_contacts_guard_link();
