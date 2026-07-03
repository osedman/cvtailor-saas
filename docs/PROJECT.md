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
| CV/job description too long — needs automatic handling, not a hard error | Bug | [#6](https://github.com/osedman/cvtailor-saas/pull/6) | Users hitting the 400 "Input too long" wall with no recovery path. PR #6 already adds Haiku pre-compression for CVs >12k chars (30k hard cap) — needs review/merge. Job description side still has no compression, just the 10k hard cap |
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

_Last updated: 2 July 2026_
