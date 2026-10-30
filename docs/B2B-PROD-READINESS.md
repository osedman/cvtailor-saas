# Tailr for Agencies — what stands between staging and production

19 Oct 2026. The list Ose asked for: everything that has to be decided, fixed
or configured before the B2B product has a production environment connected
to the main Tailr app. Facts below were checked against the repo, the two
Supabase projects and `docs/PROJECT.md` on the day; nothing here is from
memory. Items marked **Ose** need a decision or a dashboard he alone can
reach. Order is the order to do them in.

## 0 · The decision that gates everything: one deployment or two

`staging` is **454 commits ahead of `main`** (and `main` is 29 ahead of
`staging`). The diff is 533 files, and **106 of them are not B2B**: the
consumer auth routes (`app/api/auth/*`), `proxy.ts`, `lib/site-url.ts`,
`lib/supabase/*`, rate limiting, the admin pages, Career Arc, the tracker and
history routes. So `staging` is not "main plus the agency product"; it is a
second app that has drifted from the first.

Standing decisions (do not relitigate): the B2B product gets its own domain
(`tailrecruit.com`, bought 29 Sep, live on staging only); it does **not** go
into the consumer production deployment (22 Aug); and the agency schema
lives in the **same Supabase project** as the consumer data (5 Aug), because
the consumer bridge `recruiter_profile_snapshot(email)` (matching) reads
consumer tables.

Two ways to honour all three:

| | A · One codebase, one deployment, two hosts | B · Second Vercel project from a `b2b` branch |
|---|---|---|
| Code | Reconcile `staging` → `main`; one build serves `app.gettailr.com` and `tailrecruit.com` (what `proxy.ts` and `DOMAINS.md` were built for) | `staging` (or a new branch) deploys as its own production; `main` stays consumer-only |
| Database | Prod Supabase project, agency schema added | Same prod Supabase project (the bridge needs it) — so the two deployments share a database anyway |
| Env | One Production set | Two sets to keep in step; the 28 Jul "Preview-scoped variable" trap, twice |
| Risk | 454 commits of consumer changes reach consumer prod at once | Two drifting copies of `proxy.ts`, `site-url.ts`, auth and rate-limiting forever |

**DECIDED 19 Oct 2026 (Ose): Option A.** This supersedes the 22 Aug line
that the agency product would not go into the consumer deployment; the
separate domain and the shared Supabase project stand. Rules unchanged:
nothing merges to `main` without Ose saying so for that specific port.

### Move 1 · consumer catch-up, `staging` → `main`, in reviewed chunks

A trial merge of `main` into `staging` (local, 19 Oct) conflicts in **28
files**, all where both branches changed the same code separately in
July–August: admin pages and metrics (10), course catalog and sync (6),
career-path and career-evidence routes (2), `lib/email.ts`, `lib/anthropic.ts`,
`next.config.js`, `vercel.json`, `app/tailor/page.tsx`, five tests and two
scripts. Everything else merges clean. So step one is a single **"main back
into staging"** merge resolving those 28, after which `staging` is a strict
superset of `main` and every later port is a clean cherry-pick range.

Then the consumer-side diff (106 files) goes to `main` as PRs, smallest
blast radius first, each one built and clicked on a preview before merge:

| # | Chunk | Commits / files | Needs on prod |
|---|---|---|---|
| 1 | Platform: fonts, `app/layout.tsx`, globals, rate limiting, `server-timing`, `public-fetch`, small libs, analytics | 22 / 13 | — |
| 2 | Auth: `request-otp`, `post-login`, `landing`, `/login`, `session-user`, cookie options, `hat-routing`, `site-url`, `proxy.ts` | 16 / 16 | Supabase redirect URLs if any new path |
| 3 | Email: `email.ts`, senders, style, weekly cron, path digest | 15 / 7 | `vercel.json` cron + `CRON_SECRET` |
| 4 | CV tailor: panels, header, role-mode banner, tailor/parse/scrape/history routes | 21 / 14 | — (carries the stale-CV fix once built) |
| 5 | Career Arc: ledger, reveal, share cards, `/arc/[token]` | 18 / 17 | migrations `019`, `020` **before** deploy |
| 6 | Career path and courses: compute, roadmap store, upskill, first-cv, catalog, sync | 19 / 14 | — |
| 7 | Admin and debug | 10 / 11 | — |
| 8 | Settings, billing, tracker, feature gate | 6 / 9 | — |
| 9 | Calendar connections and `.ics` | 5 / 6 | shared with B2B; may ride with move 2 |

Also in the diff and **not for `main`**: `Marketing/`, `email/*.html` drafts,
`.rescued-from-icloud/`, `AGENTS.md`, `tsconfig.tsbuildinfo`.

### Move 2 · the agency product itself

`app/agencies`, `app/hiring`, `app/api/agency`, `app/api/hiring`, `app/api/me`,
`lib/agency`, `components/agency`, the doorways, matching, their tests, the
`agency-cvs`/`agency-recordings` buckets — as one port, after §1's
migrations have run on prod and §2–3 are in place. Then `tailrecruit.com`
apex → production and `DOMAIN_SPLIT_ENABLED` flipped.

## 1 · Database — the production port

- **57 migration files** exist on `staging` that have never run on
  production (`git diff --name-only origin/main origin/staging --
  supabase/migrations`): 55 agency/matching files from `20260805120000` on,
  plus the consumer files `019_career_evidence` and `020_career_arc_shares`.
- **The staging migration ledger is not a record of what is applied.**
  Supabase lists 44 entries on `tailr-staging`; about 25 of the 57 files
  (quiet matching, consent lock, waves/reminders, calendar connections,
  handover checklist, soft deletes, search briefs, brief JD files, client
  final choice and others) were run by hand in the SQL editor and are not in
  it. Build the production apply list **from the files, in filename order**,
  not from the ledger.
- Rehearse on a prod-shaped scratch project (or a Supabase branch of prod)
  before touching production. Verify grants by **attempting the write as
  the role** (`set local role service_role`, insert, abort) — three shipped
  tables could not be written by the role that writes them, and the grant
  table looked complete each time.
- The two hardening migrations (`20260930_harden_public`, `harden_agency`)
  are staging-only until **Ose** says otherwise.
- Storage: the `agency-cvs` and `agency-recordings` buckets have to exist on
  prod; bucket creation is in `20260817090000` but policies should be
  checked by effect.
- Crons: `vercel.json` runs `/api/agency/cron` daily at 03:30 (Art 14
  candidate notices — **auto-fire, not switch-off-able by design** — plus
  the retention and recording sweeps) and `/api/cron/weekly`. Production
  needs `CRON_SECRET` set and the route confirmed to answer it before the
  first real CV is ingested.

## 2 · Vercel — production configuration

All **Production-scoped, ticked explicitly**, then redeploy (anything
`NEXT_PUBLIC_*` is baked in at build time):

| Variable | Value | Note |
|---|---|---|
| `NEXT_PUBLIC_BUSINESS_URL` | `https://tailrecruit.com` | every B2B link derives from it |
| `DOMAIN_SPLIT_ENABLED` | `true` | **one flag cuts www, app and agencies over together**; `www.gettailr.com` and `app.gettailr.com` DNS must both be Valid first |
| `B2B_MAIL_DOMAIN` | `tailrecruit.com` | only **after** Resend shows Verified (§3) |
| `EMAIL_ALLOWLIST` | unset | prod sends real mail; the guard is non-prod only |
| `CRON_SECRET` | set | §1 |
| Supabase URL + both keys | all three from the **prod** project | the 30 Jul lesson: a key from the other project fails as `Invalid API key` and no sign-in mail is ever sent |

The Vercel connector in this session lists zero projects for the team, so
none of this could be checked from here. **Ose** or a session with Vercel
access.

## 3 · Domain, mail and auth for `tailrecruit.com`

- [ ] `tailrecruit.com` apex added to the Vercel project; DNS Valid. **Ose**
- [ ] Domain **auto-renew ON** — it was OFF at purchase. **Ose**
- [ ] **Resend: verify `tailrecruit.com`** (records into Vercel DNS). Until
      then the agency product emails hiring managers from the consumer
      brand, and lean-frame's Workspace filtered @gettailr.com sign-in mail
      on 29 Sep. **Ose**
- [ ] Supabase **prod** → Auth → Redirect URLs: add
      `https://tailrecruit.com/auth/confirm` and `/auth/callback`. Without
      this B2B sign-in fails while the consumer side looks fine. **Ose**
- [ ] Do **not** set `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` to span both domains;
      business hosts are host-only cookies by design.
- [ ] Supabase **magic-link email template**: staging's is malformed
      (`token_hash{` — the `=` is missing), so the button never
      authenticates and only the code path works. **Check production's
      template** before any agency sign-in depends on it. **Ose**

## 4 · Security and hardening still open (from the 30 Sep audit)

- Rights tokens stored in plain text, no expiry, no rate limit — needs a
  migration.
- `scrape-job` and `parse-cv` need no sign-in.
- The owner's team invite creates confirmed accounts; hiring-invite accept
  does not check `email_confirmed_at`.
- Revoke authenticated UPDATE on `agency.agencies` (settings audit bypass);
  the same table-wide-grant caveat on `job_roles.owner_id`.
- Recruiters can write `client_contacts.user_id` through RLS (inside their
  own agency only).
- **Product call (Ose):** a revoked shortlist recipient who still sits on a
  round keeps role access through that round. Should revoking end it?

## 5 · Legal gates

- Lawyer review + DPIA + DPA. The interview-capture consent copy is written
  and built but **not cleared for a real candidate**; capture, transcription
  and per-round enrichment stay unbuilt behind it. `docs/DPIA-*.md`,
  `docs/LEGAL-REVIEW-PACK.md`, `docs/CONSENT-COPY-DRAFT.md`.
- The Art 14 candidate notice goes live with real mail the moment the first
  real CV is ingested on prod (§1). Know that before the first import.
- `docs/NON-COMPETE.md` is signed off; where it lives publicly is **Ose's**
  call, lawyer pass advisable.

## 6 · Known bugs and gaps

- **Consumer: the apply path can send a stale CV** (diagnosed 22 Aug, not
  fixed). Two candidate mechanisms — the localStorage restore race in
  `components/cv-tailor/resizable-panels.tsx`, or applying via
  `role_recommendations.tailor_history_id` pointing at the last tailor run.
  **Ask Ose which repro he hit**; they need different fixes.
- **Submission route at 50 candidates:** `MAX_CANDIDATES_PER_ROLE` is 50,
  but the route rescores shortlisted candidates in a sequential loop, three
  queries each, under `maxDuration = 60`. Load-test a full shortlist before
  a real agency hits it.
- "Viewing as" switch hid itself after sign-in — **fixed 19 Oct**
  (`52bbaab`); a hard refresh was the only workaround before.
- Frame 44 B leftover: the shortlist's "screening notes are not part of this
  submission" line is pinned by the withheld-material guard. **Ose** to say
  whether it may change.
- Interviews / close-out wording (frame 46, `713:2`): drafted, parked by
  Ose on 19 Oct. Compare is the focus.
- Staging has orphaned CV blobs in `agency-cvs` (storage deletion is blocked
  from SQL). Prod's purge path must be checked by effect, not status code.
- Oje's account has never signed in; his address is not on the staging
  `EMAIL_ALLOWLIST`. Prod has no allowlist, so this is staging-only.

## 7 · Housekeeping

- A card on the Notion product board carries what looks like the **staging
  database password in its title**. Move it to a secret store and rotate.
- The `web-design-guidelines` skill `CLAUDE.md` asks for is not installed in
  the cloud sessions; UI changes have been measured by browser check only.
- Keep ROL-2421 and its candidates (test fixtures, `CLAUDE.md`).

## Order

1. §0 decision → §1 rehearsal on a scratch project → consumer catch-up ports
   to `main`.
2. §3 domain, Resend, redirect URLs, template (none of it blocks on code).
3. §4 hardening migrations and the §6 load test, on staging first.
4. §1 production apply, §2 env, redeploy, first sign-in on
   `tailrecruit.com` verified by effect (a row written, a mail received).
5. §5 before the first real candidate.
