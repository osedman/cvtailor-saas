-- Beta allowlist for the career-path private beta.
--
-- Lives in the DB rather than a BETA_EMAILS env var so membership can be
-- changed without a redeploy, and because the repo is public — teammates'
-- addresses never enter code. RLS is enabled with NO policies on purpose:
-- only the service-role client (the server-side feature gate) can read it.
create table if not exists beta_access (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);

alter table beta_access enable row level security;
