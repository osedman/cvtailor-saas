# Tailr — Project Log

A living record of what has been built, what is in flight, and what is on the backlog.
The visual Kanban view of this lives in Notion; this file is the source of truth in the repo.

**How this is maintained:** every feature, change, or bug fix gets an entry here and a card on the Notion board. Shipped items link to their PR. Update the status when it moves.

Legend: ✅ Shipped · 🔧 In progress · 📋 Backlog · 🐛 Bug

---

## 📊 Feature status audit — 28 July 2026 (input to next sprint)

Requested in the 27 Jul sync: every feature, one line, where it actually is.
"Validated" means a real user (not us) used it and it did its job.

| Feature | Where | Status | Validated? | Priority next sprint |
|---|---|---|---|---|
| Tailor pipeline (2-pass, compression, cache) | **Prod** | Done | ✅ real users | Maintain |
| Match score + gaps / ATS / JD coverage | **Prod** | Done | ✅ confirmed good in sync | Maintain |
| Job fetch from any URL | **Prod** | Done | ✅ any board + bare-host normalize | Maintain |
| Cover letter | **Prod** | Done | Partial | Maintain |
| Interview prep, tracker, history | **Prod** | Done | Partial | Maintain |
| Magic-link auth + rate limiting + RLS | **Prod** | Done | ✅ | Maintain |
| Evidence-first First CV builder | **Prod** | Done | 🔶 Oje testing parser with varied files | Await Oje's findings |
| Editable output (CV + letter) | Staging | Done, needs migration 014 at port | ✅ praised in sync | **Port to prod** |
| CV templates ×6 + live preview | Staging | Done, needs migration 015 at port | ✅ demoed well | **Port to prod** |
| Quick Wins (Upskill merged, evidence gate, promotion/expiry) | Staging | Done, needs migration 016 **before** code | Not yet | **Port to prod** |
| North Star career path (journey, readiness, forecast) | Staging | Done | 🔶 demoed 27 Jul, real E2E still owed | Refine per sync feedback |
| Live job market (Reed.co.uk, flagged off) | Staging | Built (`0cd9f67` swapped Adzuna→Reed 28 Jul) | ❌ needs REED_API_KEY (free, instant at reed.co.uk/developers) + MARKET_INSIGHTS_ENABLED=1 in Vercel | **Ose: register + set env vars** |
| Pace forecast + weekly digest | Staging | Done | Not yet | Port with career path |
| Career Arc | Staging | Done | Not yet | Hold — not in sync priorities |
| Font/design-system consistency | Staging (this commit) | **Fixed + guardrail test** | Pending Oje re-check | Verify on staging |
| Admin dashboard: north star + activation funnel | Staging (this commit) | **Done** | — | Use it to pick next month's work |
| Sentry activation | — | Inert, needs DSN | — | Low |
| Free-tier quota enforcement | — | Not started | — | Med (needs Stripe) |
| Recruitment platform prototype | Separate | Ideation only | — | **Paused pending Y's feedback** — by decision |

**Standing rule:** gap referencing and all generated CV text are governed by
[docs/EVIDENCE-RULE.md](EVIDENCE-RULE.md) — *Tailr reframes evidence; it never
manufactures it. Empty beats invented.* (Decided 28 Jul.)

**Descoped / retired:** Upskill tab (merged into Quick Wins) · migration 009 ·
long university programmes in roadmaps (focused, free OCW modules may enter
the reviewed course repository when they meet the same practical duration bar).

**Prod port order when approved:** migrations 014 + 015 + 016 (016 strictly
before its code) → editable output + templates + quick wins + career path
North Star in one cut, backfill at cutover.

## 🎫 Tickets from the 27 Jul sync (backlog until prioritised)

| # | Ticket | Type | Priority | Notes |
|---|---|---|---|---|
| S1 | Font consistency across CV output, tooltips, career path, edit view | Bug | High | **Done on staging 28 Jul** — editor now typeset in the selected template's face; paste boxes + tracker + `.t-quote` in brand sans; `typography-consistency.test.ts` fails the build on new unapproved mono |
| S2 | Salary + specific job details in role search / recommendations | Feature | Med | Provider swapped to Reed.co.uk 28 Jul (`0cd9f67`) — salaries are employer-posted so no "predicted" caveat needed. Unblocks when REED_API_KEY is set |
| S3 | Loading tooltip during live job research | UX | Low | Brand-consistent loading state on role search |
| S4 | Core vs non-core skill categorisation + explanatory tooltips | Feature | Med | Career path UI restructure agreed in sync |
| S5 | Missing skills coloured red in gap map | UX | Low | Pairs with S4 |
| S6 | "Next"/"Later" clarity — sequence not priority | UX | Low | Copy/tooltip fix |
| S7 | Career path performance/speed | Perf | Med | Measure before optimising |
| S8 | Job-fetch wording: "paste any URL", not LinkedIn/Indeed | Copy | Low | **Done 28 Jul** — copy updated across tailor UI, onboarding, marketing; bare hosts (`www.indeed.com/…`) now normalize to `https://` via `lib/job-url.ts` |
| S9 | Tailr Course Repository + Udemy sourcing | Feature | Med | **Repository implementation ready 28 Jul**: global RLS-backed catalogue, reviewed seed, Microsoft Learn + key-gated YouTube adapters, weekly sync/liveness checks, candidate review queue, deterministic skill/region/free ranking, and catalogue IDs resolved server-side across all roadmap/upskill paths. Migration `20260728172335_course_catalog.sql` must run in staging then prod before deploy. Remaining external dependency: Udemy Affiliate API approval; scraping remains ruled out by ToS. |

---

## ✅ Shipped

| Item | Type | PR | Notes |
|------|------|----|-------|
| **Beta gate moved to the DB (`beta_access`, migration 017)** | Feature | — | Shipped 28 Jul (`94f1077`). Adding a tester is an INSERT, not a redeploy. Ose, Oje and Daniel inserted in BOTH prod and staging; admins always pass; `BETA_EMAILS` survives as an emergency override. 9 unit tests pin the decisions incl. DB-failure fallback. `isMarketEnabled()` now needs only `REED_API_KEY` |
| **Career-path era → production (private beta)** | Feature | [#30](https://github.com/osedman/cvtailor-saas/pull/30) | Shipped 28 Jul (`04f3f12`), endpoints verified live. Gated by `BETA_EMAILS` (Ose, Oje, Daniel): North Star path, quick wins, Reed market, evidence, Career Arc. Ungated for all: 6 CV templates as real .docx, inline editing, font fixes. Prod DB migrated 012–016 (016 backfill verified). Open: prod env vars (BETA_EMAILS, REED_API_KEY, MARKET_INSIGHTS_ENABLED) + close PRs #6/#19 |
| Custom domain gettailr.com | Chore | [#1](https://github.com/osedman/cvtailor-saas/pull/1) | Brand URLs moved to gettailr.com |
| First-run onboarding (welcome modal + checklist) | Feature | [#2](https://github.com/osedman/cvtailor-saas/pull/2) | Gated to admin, then rolled out |
| Stateless magic-link sign-in (`/auth/confirm`) | Feature | [#3](https://github.com/osedman/cvtailor-saas/pull/3) | token_hash flow; fixes "request the link again" |
| Tailr brand logo (favicon, app icons, email, header) | Feature | [#4](https://github.com/osedman/cvtailor-saas/pull/4) | Replaced default Vercel mark |
| Prominent coral CV section headings + company-analyser source fix | Fix | [#5](https://github.com/osedman/cvtailor-saas/pull/5) | Faint headings; company now from JD only |
| Enhanced workspace UI (gated) | Feature | [#7](https://github.com/osedman/cvtailor-saas/pull/7) | Oat canvas, cards, score bar, tab icons |
| Enhanced workspace UI rolled out to all users | Feature | [#8](https://github.com/osedman/cvtailor-saas/pull/8) | Flag flipped on |
| Richer onboarding guidance (coachmarks, feature strip, nudge, 7-step checklist) | Feature | [#9](https://github.com/osedman/cvtailor-saas/pull/9) | Gated to admin |
| Per-user rate limiting on AI endpoints | Feature | [#10](https://github.com/osedman/cvtailor-saas/pull/10) | Postgres counters; migration applied |
| Unit tests + GitHub Actions CI | Chore | [#11](https://github.com/osedman/cvtailor-saas/pull/11) | 20 Vitest tests on sanitiser + scoring |
| CI hardening: `pnpm build` in the workflow | Chore | [#16](https://github.com/osedman/cvtailor-saas/pull/16) | Catches typecheck/build errors on PRs, not just after merge |
| Sentry error tracking (`@sentry/nextjs`) | Feature | [#17](https://github.com/osedman/cvtailor-saas/pull/17) | Native instrumentation, no next.config wrapper. Inert until DSN set |
| Staging environment (isolated Supabase + branch-scoped Vercel env) | Chore | [#18](https://github.com/osedman/cvtailor-saas/pull/18) | Dedicated tailr-staging Supabase project; verified end-to-end (sign-in landed in staging DB, not prod) |
| Landing page accessibility (reduced motion, contrast, focus rings) | Fix | [#13](https://github.com/osedman/cvtailor-saas/pull/13) | WCAG contrast + prefers-reduced-motion |
| Build-break hotfix (vitest.config type error) | Bug | [#14](https://github.com/osedman/cvtailor-saas/pull/14) | Broke production build; `singleFork` invalid |
| Privacy policy page (`/privacy`) + footer link | Feature | [#15](https://github.com/osedman/cvtailor-saas/pull/15) | UK/EU GDPR, grounded in real data practices |
| Welcome email + mailing list | Feature | — | Resend; one-time welcome; `mailing_list` table |
| PDF upload fix (unpdf + DOMMatrix polyfill) | Bug | — | Production 500 on PDF parse |
| Word CV download template + "Made with Tailr" footer | Feature | — | Modern Clean template |
| Weekly digest newsletter automation | Chore | — | Scheduled task; drafts HTML + LeanFrame Gmail draft |
| Mailing list cleanup (test/bounce rows) | Chore | — | Removed 4 junk rows |

---

## ⚠️ Trap: Vercel env vars are scoped, and a missing one looks like success

**Cost: three rounds of "still not working" on 28 Jul 2026.**

The live job market was switched on for staging in the morning by adding
`REED_API_KEY` in Vercel. That saved into the **Preview** scope only. When the
career-path era shipped to production the same afternoon, production had
`MARKET_INSIGHTS_ENABLED` but **no Reed key at all** — so `isMarketEnabled()`
was false, `fetchMarket()` returned null, and the salary lines silently never
rendered.

**Why it took three rounds:** `/api/career-path/market` answers
`200 {enabled:false}` when the integration is off. The runtime logs showed
`POST /api/career-path/market 200` — indistinguishable from success. Only the
empty `market_snapshots` table gave it away.

**The rules that follow from it:**
1. A Vercel env var set while working on staging is **Preview-scoped**. Shipping
   the feature to production means editing that row to tick **Production**, or
   adding a second row. Setting it once is not enough.
2. Never treat a 200 from a route that can return `{enabled:false}` as proof.
   Verify the *effect* (a row written, a value rendered), not the status code.
3. `/api/admin/market-check` (admin-only) exists for exactly this: it reports
   which precondition failed, lists which env var NAMES are actually present
   (values never returned), and probes Reed both directly and through
   `fetchMarket`. Reach for it before speculating. The env-name list is what
   finally settled this one — it showed no `REED_*` variable existed at all.

_Recorded 28 July 2026._

---

## 🎯 Feature: Core = the North Star only; JD skills live in Upskill (28 July 2026)

**Decision (Ose):** every skill Tailr researches for the chosen North Star role
is **core**. Every skill arriving from a job description is **upskill**, and
stays there — there is no promotion onto core, because core is the role you
chose to aim at and a single application does not get to change that.

**The bug this fixed.** `add-skill-for-jd` called `addItems()` without a
horizon, and the column defaults to `'core'` — so JD-derived skills were
silently joining the North Star path and inflating its readiness. Nothing
errored; the numbers were quietly wrong. Both DBs were checked before shipping:
no real rows were affected, so migration 018's repair clause is preventative.
A second instance of the same family: `/api/upskill` accept-mode explicitly
wrote `'core'`.

**Why the value was renamed.** `'quick'` described SIZE (a small auto-captured
win). The distinction users care about is ORIGIN. Effort still decides
auto-capture vs explicit accept — it just no longer names the horizon.

**`add-skill` now takes an explicit `origin`.** One endpoint serves two callers:
the career path's own skill map (a real North Star skill → core) and the tailor
results panel (`origin:"jd"` → upskill). Inferring server-side is how core got
polluted in the first place.

**Removed:** `promoteToCore`, `promotionEligible`, and the promotion UI. The
`promote` endpoint answers 410 rather than silently ignoring a stale client.

**Design:** done in Figma first per the rule in `CLAUDE.md` —
https://www.figma.com/design/PyzSuQcvilrl80EjFrUP73

**Guard:** `lib/__tests__/horizon-assignment.test.ts` fails the build if
anything pairs `horizon: 'core'` with `source: 'tailor_run'`, if `add-skill`
reverts to inferring origin, or if promotion returns. The DB constraint is now
`horizon in ('upskill','core')`, so `'quick'` cannot be written at all.

**Shipped:** staging `27e0ed3`, prod `17dbe2b`. Migration 018 applied to BOTH
databases before the code deployed. Verified on staging with real data:
5 core (all `north_star`) / 1 upskill (`tailor_run`), zero JD-in-core
violations; Ose confirmed the user flow end to end.

_Last updated: 28 July 2026_

---

## 📌 29 July 2026 — staging work not yet in production

Everything below is on `staging` and verified there. It has NOT been ported.
Prod is at the 28 Jul cut (career-path era behind the private beta).

| Item | Notes |
|---|---|
| Upskill UI — Concept B segmented switch | Concept A's tinted panel read as bolted on. One segmented control now does all the separating; "Your skills." heads one area with North Star / Upskill as views. Upskill tab carries its open count so the hidden half is discoverable |
| Tailr course repository + sync (Cursor agent) | `course_catalog` / `course_candidates` / `course_sync_runs`. **Prod needs migration `20260728172335_course_catalog.sql` BEFORE this code ships** |
| Course review queue + catalogue browse | `/admin/courses`, two views. Bulk approve/reject; catalogue search + paging in Postgres. Retire sets `status='stale'` rather than deleting, so the unique `canonical_url` index still blocks re-adds |
| YouTube sourcing aimed at our users | Queries now RPA/BA/automation, not generic dev topics. Ten trusted channels by default |
| Provider cap (`diversifyByProvider`) | Microsoft Learn was 2,000 of 2,012 rows and filled every shortlist slot. Capped at 2 of 5, soft — backfills rather than returning fewer |
| Win-back email + `scripts/send-winback.mjs` | Built, **not sent**. Blocked on the key rotation below |
| `/walkthrough` onboarding page | Seven-slide walkthrough on the marketing site, linked from the hero |

**Two bugs worth remembering, both found by shipping:**
`vettedChannels()` returned an EMPTY set when its env var was unset, so every
channel was untrusted and a sync appeared to do nothing. And `hydrate()` sent
every video id in one request against YouTube's hard 50-id limit — fine at 8
search queries, a 400 at 16. Batched now, with a failed batch skipped rather
than losing the whole run.

## 🔐 OPEN — rotate the exposed Supabase `service_role` key

The production `service_role` key was pasted into a chat transcript on 29 Jul.
It bypasses all RLS: full read/write on every user's CV text, email and history.

It is a **legacy symmetric JWT**, so it cannot be rotated directly. The path is:
migrate JWT secret → rotate signing keys → **revoke** the previous key (without
revoke the old key stays valid) → create new secret/publishable API keys →
update Vercel → verify → **only then** disable the legacy pair. Disabling before
Vercel is updated takes gettailr.com down. `supabase-js` takes the new secret key
in the same position, so no code changes are needed — only env values.

Blocks: sending the win-back email, and any unattended end-to-end testing.

_Last updated: 29 July 2026_

## 🔧 In progress / open PRs

| Item | Type | PR | Notes |
|------|------|----|-------|
| Long-CV handling (Pass 0 compression, higher limits) | Feature | [#6](https://github.com/osedman/cvtailor-saas/pull/6) | Adds a Haiku pre-compress pass; awaiting review |
| Career-memory Phase 1: pattern-spotting banner | Feature | [#19](https://github.com/osedman/cvtailor-saas/pull/19) | `staging` only, not merged. Client-side aggregation of weak-evidence keywords across tailor history (`lib/career-signal.ts`), dismissible banner on `/tailor` |
| Career-memory Phase 2/3: generated roadmap + checklist | Feature | — | `staging` only, not merged. New `/career-path` page + `/api/career-path` route: Sonnet + web search finds free resources per skill gap, project brief, CV phrasing; progress checklist persisted in `career_roadmaps` table (migration 004). Entry point is the Phase 1 banner's "See your career path" link |
| Schema drift fix (`tailor_history.job_description`, `profiles.full_name`) | Bug | — | `staging` DB was missing columns production actually has, discovered while testing career-memory. `schema.sql` corrected + migration 003 added |
| `/api/tailor` and `/api/career-path` timeout fix (`maxDuration` 60→300) | Bug | — | `staging` only, not merged. See "Bug: AI endpoints timing out at 60s" below |
| CV/job description too long — automatic compression | Bug | [#6](https://github.com/osedman/cvtailor-saas/pull/6) | Fixed on `staging`: PR #6's CV pre-compression ported (Haiku Pass 0, >12k chars, 30k cap) plus new JD compression (>6k chars, 20k cap, strips EEO/benefits boilerplate), run in parallel. LengthBar warnings in both panel footers. PR #6 itself now superseded — close when staging merges |
| Inconsistent match scores on identical re-runs — input-hash cache | Bug | — | `staging` only. Same CV+JD produced different scores each run (non-deterministic extraction pass). Migration 006 adds `tailor_history.input_hash`; identical re-runs now return the stored result instantly (checked before rate limit, zero API cost) with a toast |
| Living skills profile: roadmap updates through the tailor flow | Feature | — | `staging` only, not merged. CareerSyncPanel under tailor results compares each run's evidence against the roadmap: one-click 'mark done' when a roadmap skill shows strong evidence, status chips for gaps already on the path, copy-CV-bullet for done skills, one-click 'add to career path' for new gaps (single-skill AI generation, `add-skill` mode on /api/career-path) |
| Living Career Path (career-path rework) | Feature | — | `staging` only, all 4 stages. Reworks the generate-once roadmap into a living path: continuous journey line (milestones -> you-are-here -> target readiness ring), compute layer (`lib/career-path-compute.ts`: unlock-ranking + readiness from `tailor_history`+`job_tracker`, migration 007 adds `current_title`+`milestones`), intake form killed/seeded, rebuild confirm dialog; update actions (I-got-the-job, add-project, add-skill-for-JD) that also write to the Arc; and a money-path-safe feedback edge in `/api/tailor` (closed path skills become evidence, no-op when empty). Owed before prod: 1 real end-to-end generation test + independent money-path verification of the feedback edge |
| Career Arc: private CV highlight-reel page | Feature | — | `staging` only, not merged. New `/career-arc` page + `/api/career-profile` route: Sonnet extraction (no web search, pure CV extraction, explicitly told never to invent facts) into timeline/skills/growth/projects/inferred qualities, all click-to-edit inline. Auto-generates from the user's most recent `tailor_history.original_cv`; paste-box fallback if none exists. `career_profiles` table (migration 005) has a `source` column left room for an aggregated (multi-tailor) generator later. Needs migration 005 run manually in `tailr-staging` SQL Editor before testing |

## 📋 Backlog (suggested, not started)

| Item | Type | Priority | Notes |
|------|------|----------|-------|
| Activate Sentry: create project + set `NEXT_PUBLIC_SENTRY_DSN` in Vercel | Chore | High | Code merged and inert; needs external Sentry account + DSN env var |
| Sentry source map upload | Enhancement | Low | Readable stack traces; needs a Sentry auth token |
| Free-tier quota enforcement | Feature | Med | Plan-based caps → paywall; needs Stripe |
| Career-memory layer (outcome-aware profile) | Feature | Med | The "billion-dollar" bet: compounding personal profile |
| Emotional-investment features | Feature | Med | Win celebration, rejection reframing, negotiation, proactive nudges |
| Design pass: Tracker / History pages | Enhancement | Low | Still original styling, pre-enhanced-workspace |
| Design pass: results-content cards | Enhancement | Low | Tab bar redesigned; inner content not |
| Social proof / testimonials on landing | Enhancement | Low | Recommended by design audit; needs real users |
| Terms of Service page | Chore | Low | Companion to the privacy policy |
| Dedicated privacy@ contact address | Chore | Low | Swap into the privacy policy once set up |
| `tsconfig.tsbuildinfo` gitignore tidy | Chore | Low | Build artifact tracked in git |

---

## 🐛 Bug: AI endpoints timing out at 60s (`staging`, fixed 2 July 2026)

**Symptom:** `/api/tailor` and (by the same root cause) `/api/career-path` returned HTTP 504 with `X-Vercel-Error: FUNCTION_INVOCATION_TIMEOUT` on real requests, confirmed both in the browser DevTools Network tab and in Vercel runtime logs ("Vercel Runtime Timeout Error: Task timed out after 60 seconds"). Discovered while testing the career-memory feature end-to-end on staging.

**Root cause:** both routes had `export const maxDuration = 60`, and both do genuinely slow work:
- `/api/tailor` runs a sequential two-pass AI pipeline (Haiku extract → Sonnet rewrite, `max_tokens: 5000` on the rewrite) that can exceed 60s on larger CVs/job descriptions.
- `/api/career-path` runs a single Sonnet call with up to 8 web searches plus tool-use generation — arguably even more likely to exceed 60s.

Ruled out first: the database/auth/RLS layer. Generated a real Supabase session via the Admin API and performed the exact authenticated insert the app makes — it succeeded immediately, isolating the problem to function execution time, not data access.

**Fix:** raised `maxDuration` from `60` to `300` on both `app/api/tailor/route.ts` and `app/api/career-path/route.ts`, and raised the matching client-side `AbortController` timeout in `app/tailor/page.tsx` from `70_000`ms to `290_000`ms (kept slightly below the server-side budget so the server error surfaces before the client aborts). `300` was chosen as an empirical test of what the account's Vercel plan tier actually permits, since Vercel's docs didn't give a definitive per-tier ceiling — the original `60` exactly matching the observed timeout confirmed the plan does honor at least that value.

**Status:** pushed to `staging` only, verified via a local build (tarball of `staging` + these three files + `pnpm build`). Not yet merged to `main` per standing instruction not to merge career-memory work until the user has fully tested it. Still needs: a real (non-seeded) end-to-end test of career-path roadmap generation on staging to confirm 300s actually resolves the timeout.

---


---

## 🧭 Feature: Pace forecast + weekly digest (career path) — spec agreed 25 July 2026

**Principle (Ose's call): no deadlines, no shame ledger.** A user-set due date is a
commitment; missing it produces shame and app-avoidance. Instead the date is an
**output, not an input** — a forecast computed from pace that only ever *shifts*,
like a delivery estimate. No "overdue" state exists anywhere in the system.

**V1 scope (shipped to staging 25 Jul 2026):**
1. **Pace forecast** — `forecastReadyDate(openSkills, hoursPerWeek)` (pure fn,
   ~10h/skill heuristic v1): North Star pin shows "At ~N hrs/week · ready by
   {Month}". Pace editable inline (1/3/5/10 hrs) → `mode: set-pace`.
2. **Momentum, not deadlines** — items stamp `touchedAt` on every status change;
   pin shows "Last stitch: N days ago". The thread is continuity, not calendar.
3. **Weekly digest email** — Vercel cron (Mon 09:00 UTC) → `/api/path-digest`
   (Bearer CRON_SECRET). One email/week max: readiness now + forecast month +
   in-progress skills + one next action. Tone rules: always lead with the win;
   absence is never named; worst case is an offer to re-plan ("December drifted —
   re-plan at 1 hr/week?"). Unsubscribe = one click, HMAC-signed link, no login
   (`profiles.path_digest_opt_out`, migration 012).
4. **Real external dates only** (job-tracker interviews/deadlines) may appear as
   hard dates later — they're not self-judgment. Not in v1.

**Later:** per-skill effort estimates from set-target research (replaces 10h
heuristic); digest links that one-click start a skill; tracker-date integration.


---

## 💷 Feature: Live job market on the career path — v1 spec (26 July 2026)

**Idea:** readiness stops being an abstract number and starts pricing the path.
Three surfaces: (a) salary band + live role count on the locked North Star,
(b) "one skill away" counts — closing skill X opens N more live roles,
(c) later: clickable live postings with "Tailor for this".

**Data source decision.** Use a jobs **API, not scraping** (LinkedIn/Indeed ToS +
anti-bot make scraping both unlawful-ish and unreliable; Firecrawl's proper role
is enriching a single posting a user explicitly opens). Adzuna is the fit for UK:
`/jobs/gb/search` plus `/jobs/gb/histogram` for the salary distribution, and
responses carry `salary_min`/`salary_max` + `salary_is_predicted` (predicted
salaries MUST be labelled, never shown as fact).

**Licensing reality (blocking for GA, not for build):** Adzuna free tier is
~1,000 calls/month and commercial use beyond a 14-day evaluation needs written
consent. Action: email Adzuna for a commercial key (we send qualified traffic —
plausible mutual benefit). Until then the feature ships behind a flag and the
app degrades to exactly today's behaviour.

**Caching = the whole trick.** Snapshots are keyed on **(role, region), not user** —
every user aiming at "Product Operations Lead / GB" shares one snapshot,
refreshed weekly (migration 013 `market_snapshots`). A few hundred calls a month
serves thousands of users, and the page renders from cache instantly.

**Flag:** `MARKET_INSIGHTS_ENABLED=1` **and** `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`
present. Any missing → API returns `{ enabled: false }` and the UI renders nothing.

**V1 scope (built 26 Jul 2026):** salary band (25th/median/75th from histogram),
live role count, top hiring companies, and per-open-skill "opens N more roles"
counts computed by honest keyword presence across fetched descriptions. Pure
functions unit-tested; no per-job AI calls.

**Later:** clickable postings + "Tailor for this" deep link; ready-today vs
at-100% salary comparison; tracker interview dates as real external dates.

_Last updated: 26 July 2026_

---

## ✏️ Feature: Editable output — tailored CV + cover letter (26 July 2026)

**Idea:** the model's output is a draft, not a verdict. Users know their own
history better than the pipeline does, so let them fix a wording, drop a bullet,
or reword a claim without leaving Tailr and without re-running a tailor.

**Scope shipped:** inline plain-text editing of (a) the Tailored CV and (b) the
Cover Letter, on both the tailor page and the History detail view. Edits persist
to `tailor_history`. Deliberately NOT editable: Key Changes / Gaps / ATS Notes —
those are analysis of the run, not the artefact the user sends out.

**Storage decision.** The edited CV is written back into the existing `result`
jsonb (`result.tailoredCV`) rather than a parallel column, so every existing
reader — history list, Word/.txt download, tracker sync — picks up the edit with
zero changes. The AI's untouched version is preserved once, on the first edit,
under `result.tailoredCVOriginal`, which powers "Revert to AI version".

The cover letter previously had **no persistence at all** (generated client-side,
lost on reload), so migration 014 gives it a `cover_letter` column. It's now
saved on generation as well as on edit, and rehydrates when you reopen a run.
`edited_at` records hand-edits only, not generations.

**Migration 014 (`014_editable_output.sql`) is required** — until it's applied,
saving an edit fails (both paths write `edited_at`). Idempotent, additive, no
backfill needed.

**Editor is a raw textarea, on purpose.** Everything downstream — Word/.txt
export, ATS keyword checking, tracker sync — consumes plain text, so a rich
editor would only be flattened back out again. ⌘↵ saves, Esc cancels.

**Save ordering:** persist first, then apply locally. A failed save leaves the
editor open with the user's draft intact, and what's on screen never disagrees
with what's stored. Runs with no `historyId` (unsaved) still edit fine —
session-only.

_Last updated: 26 July 2026_

---

## 🎨 Feature: CV templates — six styles, live preview (26 July 2026)

**Idea:** one house style doesn't fit a law CV and a design CV. Users pick a
template, see the real thing on screen, and download exactly that.

**Grounded in current guidance, not taste** (Microsoft Create, Indeed, ResuFit,
resume.io, Jan 2026):
- **Layout never varies.** Every template is single-column, no tables, no text
  boxes, no sidebars — multi-column is the single biggest cause of ATS parsing
  failures. Templates differ in typography and rules ONLY. A unit test enforces
  this: no `<table>`, no `column-count`, no flex/grid in any output.
- Only ATS-safe, near-universally installed faces: Calibri, Cambria, Garamond,
  Georgia, Helvetica/Arial. Every stack ends in a generic family because
  Helvetica ships on macOS but not Windows and the .doc usually opens on Windows.
- Body text never below 10pt (also unit-tested).

**The six:** Modern Clean (default, unchanged from before so nobody's existing
output shifts) · Classic Serif (Cambria, centred, law/government/education) ·
Executive Garamond (narrower face, fits a long career without shrinking type) ·
Editorial Georgia (screen-first serif, comms/marketing) · Minimal Sans
(Helvetica, no colour or rules, design/tech) · ATS Plain (Arial, deliberately
unstyled, for ruthless filters).

**One token set, two renderers.** `lib/cv-templates.ts` holds points-based tokens
consumed by BOTH the Word builder and the on-screen preview (px = pt × 4/3), so
the preview is the download rather than a lookalike — they cannot drift.

**Persistence:** `profiles.cv_template` (migration 015), free text not an enum —
template ids are a product concern that will churn faster than the schema should.
Unknown/NULL degrades to the default via `toTemplateId`, so retiring a template
can never break a user's results view. `useCvTemplate` is local-first:
localStorage paints instantly (a CV re-skinning itself a beat after render looks
broken), then the server value corrects it. Signed-out users get a working
picker that simply doesn't persist.

**Migration 015 required** before the preference persists; without it the picker
still works per-device via localStorage.

_Last updated: 26 July 2026_

---

## ⚡ Feature: Quick wins — Upskill merged into the career path (27 July 2026)

**Problem:** Upskill wrote a per-run plan to `tailor_history.upskill` that nothing
else read — closing a skill there ticked a box on one history row and changed
nothing (no evidence edge, no forecast, no digest). Two parallel skill lists, one
inert. Migration 009 never went to prod, so prod never saw the tab.

**Decision (per the Quick Wins plan + Phase 0 findings):** one store, two horizons.
Items normalised out of `career_roadmaps.items` (jsonb array, one row per user)
into `career_roadmap_items` (migration 016) — real rows with `horizon`
(`quick`/`core`), `source`, `source_run_id` FK, `role_family_at_capture`,
`surfaced_count`, `archived_at`. Dedupe on skill is a DB unique index, not app
code. `career_roadmaps` keeps its per-user fields; its `items` column is left in
place untouched for rollback, to be dropped in a later migration.

**Horizon rules by consumer** — the pollution-prevention core of the design:
path/readiness/forecast/market read `core` only; evidence review and the tailor
evidence edge read both. Quick wins can never move the North Star's numbers.

**Capture (Phase 3):** the generator now estimates `effortHours` per skill
(honest, CV-calibrated, "do not flatter"). `splitByEffort`: ≤5h auto-captures as
`quick`; anything bigger — or with NO usable estimate — comes back as a candidate
needing explicit "Add to my path". That rule keeps "learn Kubernetes" out of the
quick lane. `/api/upskill` rewritten as this endpoint; PATCH cycles status in the
shared store, so closing a skill anywhere closes it everywhere.

**Surfaces (Phase 4):** `components/quick-wins.tsx` — one card, two placements:
"Close these gaps" strip in the tailor Gaps tab (replaces the Upskill tab), and a
"Quick wins" section on the career path above the skill map. Same write path.
GET /api/career-path now returns `quickWins` alongside the roadmap.

**Sequencing constraint for prod:** the wired code reads `career_roadmap_items`
— prod MUST get migration 016 (table + backfill) before this code deploys, or
the career path 500s for all users. Staging had 016 applied first; backfill
verified exact (4/4 items, order + content match).

**The loop (Phase 5, 27 Jul):** the tailor evidence edge is now evidence-gated —
only skills closed with a PASSED evidence review are woven into future CVs
(loadProvenSkills). A self-ticked "done" shows done in the UI but never adds a
CV line and never lifts the match; without that gate the feature is keyword
stuffing with better fonts. Because the evidence block is part of the tailor
cache hash, an unverified close re-serves the cached run (score provably
unmoved) while a verified close forces a fresh run — the acceptance test holds
by construction. When a re-run of the same JD scores higher with proven skills
in play, the response carries scoreDelta and the tailor page shows the payoff
banner: "You closed X — this job went 61% → 68%." Quick-win cards gained
"Verify with evidence" (same reviewer route as the path, both horizons), so
verification is reachable at the moment of closing — addressing the Phase 0
finding that evidence uploads were ~never used.

**Promotion + expiry (Phase 6, 27 Jul):** a quick win OFFERS promotion to the
core path when surfaced by 3+ applications (a pattern, not a one-off job) or
closed with passed evidence (proven investment) — `promotionEligible`, unit
tested. Always an offer, never automatic; provenance survives promotion.
Untouched quick wins (not done, no activity in 30 days) auto-archive lazily on
the career-path read — no cron — and un-archive with surfaced_count++ if a
later run resurfaces the skill. Done items never expire. NOTE one deliberate
deviation from the plan: rule 2 was "on the North Star role family AND just
closed", but the North Star's role family isn't stored anywhere and deriving it
would cost an AI call, so the shipped rule is "closed with passed evidence" —
a stronger signal, and safe because it only gates an offer.

**Still open:** dropping `tailor_history.upskill` + migration 009 file, dropping
`career_roadmaps.items` once proven; prod port needs 016 (table+backfill at
cutover) before this code.

_Last updated: 27 July 2026_
