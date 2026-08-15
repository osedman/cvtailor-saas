# Migration 12 — quiet matching

**Status: written, NOT applied anywhere.** Per `CLAUDE.md`, migrations run
manually and always before the code that reads them. Nothing in the app reads
these tables yet, so applying this is safe and inert.

File: `supabase/migrations/20260815090000_quiet_matching.sql`

## Run it

**Staging first — project `tailr-staging` (`pwonuqkpumgejqmotkwh`).**
Confirm the project ref in the Supabase dashboard header before you paste
anything. Then: SQL Editor → paste the whole file → Run.

Do **not** run it in production. Production has never seen a line of agency
code, and this is not the migration to change that with.

The file is idempotent — safe to re-run.

## Then verify it did what it claims

Paste this afterwards. Every row should say `PASS`.

```sql
with checks as (
  select 'tables created' as check,
         (select count(*) from information_schema.tables
           where (table_schema='public' and table_name in
                 ('match_preferences','matching_consent_events','published_roles','role_recommendations'))
              or (table_schema='agency' and table_name='role_matching')) = 5 as ok
  union all
  select 'rls on all five',
         (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where (n.nspname='public' and c.relname in
                 ('match_preferences','matching_consent_events','published_roles','role_recommendations'))
              or (n.nspname='agency' and c.relname='role_matching'))
  union all
  select 'no write policy on consent tables',
         (select count(*) from pg_policies
           where schemaname='public'
             and tablename in ('match_preferences','matching_consent_events')
             and cmd <> 'SELECT') = 0
  union all
  select 'recommendation update is column-limited',
         (select count(*) from information_schema.column_privileges
           where table_schema='public' and table_name='role_recommendations'
             and grantee='authenticated' and privilege_type='UPDATE') = 3
  union all
  select 'anon holds nothing',
         (select count(*) from information_schema.table_privileges
           where table_schema='public' and grantee='anon'
             and table_name in ('match_preferences','matching_consent_events',
                                'published_roles','role_recommendations')) = 0
  union all
  select 'source accepts matched',
         (select pg_get_constraintdef(oid) from pg_constraint
           where conname='candidates_source_check') like '%matched%'
  union all
  select 'job kind accepts match_scan',
         (select pg_get_constraintdef(oid) from pg_constraint
           where conname='ingestion_jobs_kind_check') like '%match_scan%'
  union all
  select 'no FK from public into agency',
         (select count(*) from pg_constraint c
            join pg_class ch on ch.oid=c.conrelid join pg_namespace nh on nh.oid=ch.relnamespace
            join pg_class pa on pa.oid=c.confrelid join pg_namespace np on np.oid=pa.relnamespace
           where c.contype='f' and nh.nspname='public' and np.nspname='agency') = 0
)
select check, case when ok then 'PASS' else 'FAIL' end as result from checks;
```

## The two behaviours worth proving by hand

Both are the point of the migration, and neither is provable from a status code.

**1. There is no job board.** As a signed-in consumer user with no
recommendation, `select * from public.published_roles` must return **zero
rows**, even with a live published role sitting in the table. Browsing is not
a feature that is switched off — it is a query that comes back empty.

**2. A client cannot claim an application.** As `authenticated`, updating a
recommendation's `state` to `'applied'` must raise. Updating it to `'seen'` or
`'dismissed'` must succeed. `score` must be unwritable in both cases.

Run these as a real user, not as `postgres` — the guard deliberately lets a
superuser through, since a superuser can disable the trigger anyway and
refusing them would only be theatre.

## What this does NOT do

- No consumer opt-in UI yet — `match_preferences.matching_opt_in` is false for
  everyone and nothing writes it. The scan would find nobody, correctly.
- No scan, no recommendations, no `/found` screen, no publish control.
- `public.profiles.recruiter_visibility` is untouched. It governs enrichment,
  a different door with a different consent, and still has no UI either.

## Gate items this adds to the lawyer/DPIA queue

- The **aggregate count** (`agency.role_matching.matched_bucket`) is a real,
  if thin, disclosure to the agency. It is bucketed, floored, cooldown-limited
  and never broken down by any attribute — but it must be named as a
  disclosure in the DPIA, not described as zero.
- **Art 13 at the moment of applying** replaces Art 14 on a delay for matched
  applicants: the person hands us everything themselves, so the notice belongs
  in the apply confirmation rather than seven days later.
- **The controller boundary**: Tailr is sole controller until someone applies.
- A **matching clause in the DPA**.
