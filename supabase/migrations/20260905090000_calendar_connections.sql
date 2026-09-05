-- Calendar connections: one per user, service-role only.
--
-- A hiring manager connects the calendar of their choice so Tailr can propose
-- interview windows sized to the candidates they chose. The table holds
-- SEALED tokens (AES-256-GCM under CALENDAR_TOKEN_KEY, see
-- lib/calendar/tokens.ts) and nothing about events: busy intervals are read
-- live and never stored.
--
-- Keyed by auth user, not by agency contact — a diary belongs to the person.
-- No authenticated grants at all: every read and write goes through the
-- service role in lib/calendar/connections.ts, and a user disconnects by
-- calling the route, which deletes the row.
--
-- Run in tailr-staging first (the calendar routes are on staging only), then
-- in the B2B production project when that exists. Idempotent.

create table if not exists public.calendar_connections (
  user_id        uuid primary key references auth.users on delete cascade,
  provider       text not null check (provider in ('google', 'microsoft')),
  access_token   text not null,
  refresh_token  text,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.calendar_connections is
  'Sealed OAuth tokens for a user''s calendar. Busy intervals only; no event content is ever read or stored.';

alter table public.calendar_connections enable row level security;

revoke all on public.calendar_connections from anon, authenticated;
grant select, insert, update, delete on public.calendar_connections to service_role;
