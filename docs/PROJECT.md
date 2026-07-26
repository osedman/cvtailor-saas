# Tailr — Project Log

A living record of what has been built, what is in flight, and what is on the backlog.
The visual Kanban view of this lives in Notion; this file is the source of truth in the repo.

**How this is maintained:** every feature, change, or bug fix gets an entry here and a card on the Notion board. Shipped items link to their PR. Update the status when it moves.

Legend: ✅ Shipped · 🔧 In progress · 📋 Backlog · 🐛 Bug

---

## ✅ Shipped

| Item | Type | PR | Notes |
|------|------|----|-------|
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
