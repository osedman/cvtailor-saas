-- Tailr — migration 32: roles get an owner.
--
-- Members exist, roles did not belong to anyone, and real desks are
-- commission-driven — "whose role is this" is a question with money on it.
-- Until now the closest thing was created_by, which is provenance, not
-- ownership: the person who typed the role in is not necessarily the person
-- running it, and created_by nulls out when an account is deleted.
--
-- It also fixes a guess the product was already making: notification
-- recipients resolve through created_by as a proxy ("roles have no owner —
-- that is a named gap", lib/agency/notify.ts). Owner is now the answer and
-- created_by drops back to being what it always was, history.
--
-- Backfilled from created_by because that guess was right more often than
-- not, and an unowned role would fall back to spamming the agency's owners —
-- the exact behaviour ownership exists to end.
--
-- Reassignment is audit-coupled through the service-role route (entityType
-- 'role', action 'owner_changed'), because moving a role between desks is a
-- commission event someone will ask about later. NOTE: authenticated holds
-- table-wide UPDATE on job_roles by design (intake field edits ride RLS), so
-- a crafted client could technically write owner_id unaudited. Narrowing that
-- means dropping the table-wide grant and re-granting an explicit column list
-- (a column-level REVOKE cannot subtract from a table-wide privilege — see
-- migration 15's lesson on public.profiles). Deliberately not done in this
-- migration; recorded as the follow-up it is.

alter table agency.job_roles
  add column if not exists owner_id uuid references auth.users on delete set null;

comment on column agency.job_roles.owner_id is
  'The member running this role — commission attribution and the preferred notification recipient. Reassignment is audited (owner_changed). Falls back to created_by, then agency owners, when null.';

update agency.job_roles
   set owner_id = created_by
 where owner_id is null
   and created_by is not null;
