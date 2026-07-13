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
| Richer onboarding guidance (coachmarks, feature strip, nudge, 7-step checklist) | Feature | [#9](https://github.com/osedman/cvtailor-saas/pull/9) | Gated to admin, then rolled out via #25 |
| Per-user rate limiting on AI endpoints | Feature | [#10](https://github.com/osedman/cvtailor-saas/pull/10) | Postgres counters; migration applied |
| Unit tests + GitHub Actions CI | Chore | [#11](https://github.com/osedman/cvtailor-saas/pull/11) | 20 Vitest tests on sanitiser + scoring |
| CI hardening: `pnpm build` in the workflow | Chore | [#16](https://github.com/osedman/cvtailor-saas/pull/16) | Catches typecheck/build errors on PRs, not just after merge |
| Sentry error tracking (`@sentry/nextjs`) | Feature | [#17](https://github.com/osedman/cvtailor-saas/pull/17) | Native instrumentation, no next.config wrapper. Inert until DSN set |
| Staging environment (isolated Supabase + branch-scoped Vercel env) | Chore | [#18](https://github.com/osedman/cvtailor-saas/pull/18) | Dedicated tailr-staging Supabase project; verified end-to-end (sign-in landed in staging DB, not prod) |
| Fix schema.sql drift (missing job_description + full_name) | Bug | [#21](https://github.com/osedman/cvtailor-saas/pull/21) | schema.sql was missing columns production actually has, causing silent history-save failures on staging |
| Landing page accessibility (reduced motion, contrast, focus rings) | Fix | [#13](https://github.com/osedman/cvtailor-saas/pull/13) | WCAG contrast + prefers-reduced-motion |
| Build-break hotfix (vitest.config type error) | Bug | [#14](https://github.com/osedman/cvtailor-saas/pull/14) | Broke production build; `singleFork` invalid |
| Privacy policy page (`/privacy`) + footer link | Feature | [#15](https://github.com/osedman/cvtailor-saas/pull/15) | UK/EU GDPR, grounded in real data practices |
| Welcome email + mailing list | Feature | — | Resend; one-time welcome; `mailing_list` table |
| PDF upload fix (unpdf + DOMMatrix polyfill) | Bug | — | Production 500 on PDF parse |
| Word CV download template + "Made with Tailr" footer | Feature | — | Modern Clean template |
| Word download: real .docx (was HTML-as-.doc) | Bug | [#28](https://github.com/osedman/cvtailor-saas/pull/28) | HTML renamed to .doc opened as plain text / looked corrupt for many users; now OOXML via `docx` |
| Magic-link errors swallowed by www redirect | Bug | [#29](https://github.com/osedman/cvtailor-saas/pull/29) | After domain split, failed `/auth/confirm` → `app/?error=…` was 308'd to www with query stripped; users saw a blank homepage and re-requested links. Also: persist sessions with `.gettailr.com` cookies; click-to-confirm + OTP so mobile email prefetchers don't burn the one-time link |
| Weekly digest newsletter automation | Chore | — | Scheduled task; drafts HTML + LeanFrame Gmail draft |
| Mailing list cleanup (test/bounce rows) | Chore | — | Removed 4 junk rows |
| AI endpoint timeout fix (`maxDuration` 60→300 + client abort 290s) | Bug | [#22](https://github.com/osedman/cvtailor-saas/pull/22) | 60s FUNCTION_INVOCATION_TIMEOUT on real tailor runs |
| CV/JD auto-compression (Haiku Pass 0, limits 30k/20k) | Bug | [#22](https://github.com/osedman/cvtailor-saas/pull/22) | Replaces the hard 400 wall; supersedes PR #6. LengthBar warnings in panel footers |
| Identical re-run cache (input_hash, migration 006) | Bug | [#22](https://github.com/osedman/cvtailor-saas/pull/22) | Same CV+JD no longer re-rolls a different match score. Run migration 006 on production Supabase |
| Interview Prep follow-up card alignment | Fix | [#22](https://github.com/osedman/cvtailor-saas/pull/22) | Line-height/styling matched to question cards |
| Company Analysis floating bullet-dot parser fix | Fix | [#22](https://github.com/osedman/cvtailor-saas/pull/22) | Wrapped/split bullets now group into one block |
| Career Arc: private CV highlight reel (`/career-arc`) | Feature | [#23](https://github.com/osedman/cvtailor-saas/pull/23) | Guided intake (4 personalised skippable questions), art-directed card reveal, document frame. Migration 005 required on production Supabase. Follow-up: re-add inline editing (dropped in v2 redesign) |
| Career Arc in-app launch announcement | Chore | [#24](https://github.com/osedman/cvtailor-saas/pull/24) | Dismissible ink banner on /tailor; auto-hides once an arc exists. Launch email sent to mailing list 6 Jul |
| Richer onboarding guidance rolled out to all users | Feature | [#25](https://github.com/osedman/cvtailor-saas/pull/25) | Flag flipped: removed `isAdminEmail` gates in onboarding + tailor coachmarks |
| www + app domain split | Chore | [#25](https://github.com/osedman/cvtailor-saas/pull/25) [#26](https://github.com/osedman/cvtailor-saas/pull/26) | `www.gettailr.com` marketing, `app.gettailr.com` product. Domains on Vercel; `DOMAIN_SPLIT_ENABLED=true`; apex redirects live. #26 folded redirects into `proxy.ts` (Next 16). Supabase Site URL + redirect URLs updated. Optional later: Framer/Webflow for www |

## 🔧 In progress / open PRs

| Item | Type | PR | Notes |
|------|------|----|-------|
| Career-signal banner (career-memory Phase 1) | Feature | [#19](https://github.com/osedman/cvtailor-saas/pull/19) | Mines tailor_history for recurring weak-evidence keywords; merged to staging, awaiting review before prod |

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
| Reviews: collect in-app user reviews/ratings | Feature | Med | Prompt at high-satisfaction moments (strong tailor result, arc built); feeds the landing testimonials item |
| Terms of Service page | Chore | Low | Companion to the privacy policy |
| Dedicated privacy@ contact address | Chore | Low | Swap into the privacy policy once set up |
| `tsconfig.tsbuildinfo` gitignore tidy | Chore | Low | Build artifact tracked in git |

---

_Last updated: 13 July 2026_
