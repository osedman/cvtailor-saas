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
| Live job market (Reed.co.uk, flagged off) | Staging | Built (`0cd9f67` swapped Adzuna→Reed 28 Jul) | Prod env vars set (verified 11 Aug); NOT scoped to Preview, so staging market stays dark | Scope REED_API_KEY to Preview if staging needs it |
| Pace forecast + weekly digest | Staging | Done | Not yet | Port with career path |
| Career Arc | Staging | Done | Not yet | Hold — not in sync priorities |
| Font/design-system consistency | Staging (this commit) | **Fixed + guardrail test** | Pending Oje re-check | Verify on staging |
| Admin dashboard: product health (aggregates + masked drill-down) | Branch `feat/admin-product-health` | **In progress** | — | Staging verify → port to prod on approval |
| Sentry activation | — | Inert, needs DSN | — | Low |
| Free-tier quota enforcement | — | Not started | — | Med (needs Stripe) |
| Recruitment platform prototype | Separate | Ideation only | — | **Paused pending Y's feedback** — by decision |

**Standing rule:** gap referencing and all generated CV text are governed by
[docs/EVIDENCE-RULE.md](EVIDENCE-RULE.md) — *Tailr reframes evidence; it never
manufactures it. Empty beats invented.* (Decided 28 Jul.)

### Landing page scroll story (7 Aug 2026) — on staging

Replaced the three-card "How it works" section with a pinned, scroll-driven 3D
card sequence (`components/landing/scroll-story.tsx`, no new dependencies, CSS
3D + rAF, no WebGL). One candidate's application moves through four beats:
tailor (card lifts off a deck, coral lines draw), match score (87 ring + the
hero mock's evidence chips), interview prep (question-card carousel), tracker
(cards snap into Applied/Interview/Offer with the "Moved to Interview" toast),
ending on a Tailor my CV CTA. Desktop + motion-safe only; small screens and
reduced-motion get a static four-beat fallback (`motion-safe:lg:` gating).
`#how-it-works` anchor preserved. **Retired with disclosure:** the old 3-step
copy ("Drop in your CV / Paste the job / Tailor & apply") and its FileText/Link2
icons. Verified locally beat-by-beat at 1280px + mobile 375px (no console
errors, no horizontal overflow). Figma skipped — Ose said ship straight to
staging from the approved artifact prototype. Watch after ship: hero CTA
clickthrough + tailor-start rate.

### Prod port cut: PR #61 (11 Aug 2026)

Consumer port branch `port/consumer-gaps-scroll-story` opened as PR #61 after
Ose's staging pass: scroll-story landing, condensed results view + persistent
summary bar, collapsible Gaps tab + optimistic Add to path, strip removal,
plus the prerequisite evidence sidebar layer (panel, ledger, career-evidence
lib/route, tailor-match, tests, two exports appended to lib/anthropic).
Build + 244 tests green on the branch. **Merge gate: Ose runs
019_career_evidence.sql in PRODUCTION Supabase first, then merges.**

### Gaps tab restructure + persistent tailor summary bar (11 Aug 2026) — on staging

Ose flagged the Gaps tab told the same story three times (Evidence Matched
panel, standalone Requirements coverage card, separate gap-advice list).
Approved Figma frames: https://www.figma.com/design/Xsa5coXGNKKCqfXXbdr4FA
Three collapse levels now: the whole Evidence Matched panel collapses to a
one-line strip (chevron in header, open by default); named gaps collapse to a
strip of gap names (open by default) with the tall cards replaced by one-line
rows; and a new `CoverageMap` disclosure (closed by default) absorbs the old
coverage card AND the gap-advice rows, grouped Strong/Transferable/Partial/
Missing. **Disclosed:** the bank-traceability "N matched · view detail" list
now renders only in the compact CV-tab rail, not on the Gaps tab. Also fixed:
clicking "Tailor another" used to swap the job summary bar for the input
panels with no way back — the bar now persists above the inputs as "Back to
results". Files: `evidence-match-panel.tsx`, `results-tabs.tsx`,
`app/tailor/page.tsx`.

Follow-up (same day): Ose flagged "Close these gaps" duplicated the named
gaps. First pass condensed the strip to one row (`5657155`); Ose then called
it: **remove the strip from the Gaps tab entirely**. The named gap rows are
now the single add-to-path action there. `UpskillStrip` was then deleted
outright on Ose's confirmation (the career path's `UpskillSection` and the
quick-win cards in the same file are untouched and keep the same
`/api/upskill` write path). Consequence
worth knowing: beta users with no evidence bank see no gap actions on the
Gaps tab now (the panel needs bank rows to render). Also made "Add to path"
optimistic like the 7 Aug screening-controls fix — the row flips to "On your
path" on click and rolls back with an error toast if the save fails.

### Admin product health (6 Aug 2026) — in progress on `feat/admin-product-health`

Rebuilt `/admin` around product health, not volume + PII tables. `/api/admin/stats`
now returns server-side aggregates only (no emails/IPs/CV/JD). Dashboard: 7-day
activation, median time-to-first-tailor, weekly active tailorers, 30-day return;
weekly signup cohorts; strict outcome funnel through Offer; quality (match score,
feedback, edit rate, cover letters); feature adoption (Path, North Star, Arc,
Evidence, First CV); stuck segments with masked ids (`User ··A7F2`). No migration.
Figma skipped by request (MCP rate-limited). Notion card owed — no Notion connector
in this session. Staging verify next; prod port only on explicit approval.

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
| **Career-path era → production (private beta)** | Feature | [#30](https://github.com/osedman/cvtailor-saas/pull/30) | Shipped 28 Jul (`04f3f12`), endpoints verified live. Gated by `BETA_EMAILS` (Ose, Oje, Daniel): North Star path, quick wins, Reed market, evidence, Career Arc. Ungated for all: 6 CV templates as real .docx, inline editing, font fixes. Prod DB migrated 012–016 (016 backfill verified). Env vars: REED_API_KEY + MARKET_INSIGHTS_ENABLED confirmed Production-scoped in Vercel (verified 11 Aug); BETA_EMAILS unneeded since the DB beta gate (017) |
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

## 🐛 Staging locked out by production's key rotation (30 July 2026)

**Symptom:** staging loaded fine for anyone, but the sign-in modal returned
`Invalid API key`. Reported as "I don't have access to staging", which sent the
first 20 minutes down the Vercel Deployment Protection path — the wrong tree.
Staging was returning **200** to an unauthenticated `curl` the whole time.

**Cause:** collateral damage from the `service_role` rotation logged above. When
production moved to the new `sb_publishable_…` / secret key pair and Vercel was
updated, the new **production** values landed at a scope that also covered the
`staging` branch's Preview environment. Staging ended up with
`NEXT_PUBLIC_SUPABASE_URL` → `tailr-staging` but **both keys** → production's
project. Supabase rejects a key belonging to another project.

**Two separate breakages, one cause — the second was hidden behind the first:**

| Variable | Effect |
|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser auth calls 401 |
| `SUPABASE_SERVICE_ROLE_KEY` | `POST /api/auth/request-otp` → 400 `Invalid API key`; **no login email is ever sent** |

Fixing only the anon key looked like progress and changed nothing user-visible.
The service-role key is what actually sends the magic link.

**Status: RESOLVED same day.** Both keys replaced with `tailr-staging`'s own, each
edited in place in the Vercel dashboard (nothing deleted), then redeployed.
Verified: the staging bundle ships staging URL + staging key, `/auth/v1/settings`
returns 200, and `POST /api/auth/request-otp` returns `{"ok":true}` — the same
call that returned `Invalid API key` before the fix. Production was checked
before and after every change and never changed.

**Rules that follow:**
1. Rotating a production key is a **staging event too**. After any rotation, run
   `vercel env pull --environment=preview --git-branch=staging` and confirm the
   URL's project ref matches the keys' project.
2. Diagnose the layer first. `curl -o /dev/null -w "%{http_code}"` on the staging
   URL separates "Vercel is blocking you" (403) from "the app is broken" (200)
   in one command.
3. Avoid `vercel env rm <name> preview staging`. It removed the branch-scoped
   entry *and* stripped `Preview` + `Development` off the shared variable,
   briefly leaving every PR preview with no key. Edit in the dashboard instead.
4. Staging Auth SMTP was **not** the problem, contrary to the note in
   docs/STAGING.md's history — login goes through `/api/auth/request-otp`, so
   Supabase's mailer config is not on the critical path.

Full diagnosis and the verification commands: [docs/STAGING.md](STAGING.md).

_Recorded 30 July 2026._

---

## ✅ SHIPPED: Word export matches the preview for stacked CVs (4 August 2026)

Follow-up to the display fix below. The preview learned the stacked
role/company/dates format, but `lib/word.ts` still classified lines the old
way, so the downloaded .docx didn't match what the user saw. Line
classification now lives once in `lib/cv-lines.ts`, imported by FormattedCV,
`buildCvHtml` and `buildCvParagraphs`, so the three can't drift again. Five
tests pin the behaviour, including that an ALL-CAPS company exports as a bold
company line rather than a section heading.

[PR #43](https://github.com/osedman/cvtailor-saas/pull/43) squash-merged to
main (`ccbf77c`), production deployment READY and verified in the live bundle.
Ported to staging (`9969117`). No migrations.

---

## ✅ SHIPPED: every company renders consistently in the displayed CV (4 August 2026)

Reported by Ose with a prod screenshot: YOOX NET-A-PORTER rendered as a giant
section header while Fairmatic, BP, Optum and State Street were plain body
text, and bare date lines went bold. Cause: `FormattedCV` only understood
ALL-CAPS headings and single-line "Role | 2019–2021" rows — the three-stacked-
lines format (role title / company / dates) had no pattern. Fix: detect the
date-only line and classify upward; every company is now a bold sub-heading
with the role above and dates in muted company style.

[PR #42](https://github.com/osedman/cvtailor-saas/pull/42) squash-merged to
main (`d131653`), verified live in the prod bundle. Ported to staging
(`858a234`) same day. Follow-up owed: the Word export (`lib/word.ts`) still
uses the old line classification for this format.

---

## ✅ VERIFIED ON PREVIEW: pace lag, CORE tags, multi-document First CV upload (4 August 2026)

Three small fixes shipped with the enrichment work below (commit `117cbd4`,
Ose verified all three on the branch preview 4 Aug; ported to staging same day):

1. **Pace control was slow.** Changing hrs/week awaited the save round-trip plus
   a full path reload before the forecast moved. The forecast is computed
   client-side, so the pin now updates instantly (optimistic local state) and
   saves in the background, reverting with a toast if the save fails.
2. **CORE tag on every North Star skill.** The skill map only tagged skills the
   model judged `importance === "core"`, so most missing skills carried no tag.
   Every researched North Star skill now shows CORE — the model's core/common/edge
   split is still stored, just no longer trusted for the badge.
3. **First CV builder reads documents, plural.** The evidence uploader accepts
   multiple files in one pick (sequential extract calls, per-file errors, one
   combined toast) and all copy/errors now say "documents" rather than
   file/CV-of-it language ("Upload documents", "Reading your documents…",
   "We could not read evidence from that document.").

**Status:** verified working on the branch preview by Ose (4 Aug); ported to
staging. No production deployment until explicitly approved.

---

## 🐛 FIXED: North Star skills kept empty plan placeholders (2 August 2026)

**Symptom:** after choosing a North Star, skills appeared but their courses and
project ideas stayed empty.

**Cause:** the fast-build change saved empty placeholders and delegated plans to
one fire-and-forget `enrich-plan` request. Errors were swallowed, only the first
five gaps were attempted, there was no retry on a later visit, and model-shortened
skill names failed an exact-name merge.

**Fix on `fix/north-star-enrichment`:** the living path now retries pending plans
on load, runs every five-skill batch until all researched gaps are covered, reports
failures instead of hiding them, and aligns model output to app-owned skill names
before catalog resolution. Regression tests cover shortened names, complete-batch
fallback, duplicate prevention, multi-batch enrichment, and revisit recovery.

**Status:** shipped with `117cbd4` and verified on the branch preview 4 Aug
(plans filled in on load); ported to staging. No production deployment until
explicitly approved.

---

## 🐛 FIXED: skills showed no courses — relevance was never actually required (31 July 2026)

**Symptom:** career-path skills rendered with a project brief and **no courses at all**.

**Two wrong diagnoses first, both mine.** "The catalog is empty" (it was, and filling it
did not fix this) and then "rebuild the path". The path Ose built at 18:43 — *after* the
catalog held 4,443 courses — still produced 0 resources for 4 skills. Populating data and
re-running are the obvious moves and neither touched the real cause.

**Actual cause:** in `rankCourses` (`lib/course-catalog.ts`) relevance and fit were a
single score. A free, short Microsoft module scored **~66 on metadata alone** (quality +
provider preference + free + duration) against a threshold of **15**, so every skill
returned five results however unrelated. Production was serving:

- *"Direct line management"* → **"Build and deploy apps for Microsoft Teams"**
- *"Target Operating Model"* → **"Advanced Model-Driven Apps with Power Apps"** — matched
  on the word *"model"*

**Why that showed up as silence rather than bad courses.** `fullCoverage` (every skill
has ≥2 records) suppresses the web-search fallback in `catalogAwareRoadmapTools`. So
business and leadership skills had only irrelevant candidates *and no way to look
elsewhere*. The model correctly attached nothing — and that is what reached users. **A
false positive in matching surfaced as a missing feature.**

**Fix ([PR #39](https://github.com/osedman/cvtailor-saas/pull/39), `25bea91`):**
- Relevance is scored separately and **gates eligibility**; fit only reorders records that
  already match.
- A match needs a phrase hit, or enough distinct token hits to stop being coincidence,
  **scaled to the skill's length** — two hits is convincing for "Power BI" and meaningless
  for a nine-word skill. The Teams module cleared a flat bar of two on "team" (matching
  the tag "office teams") and "developers" (matching "developer").
- Substring matching between words needs length ≥5, so a two-letter tag like `ai` no
  longer matches `email`.

Verified against the live catalog: business skills now return nothing and re-enable web
search, while Power BI, Azure DevOps, Python, Kubernetes, Power Automate and data analysis
all still resolve. Tests were checked to fail against the old logic.

**Being strict is cheap here** — falling short of coverage turns the fallback on, which
beats a confident irrelevant answer. That is the design principle to preserve.

**Blast radius: zero real users.** All 6 course-less items belonged to Ose's own two
accounts; 9 of 62 users have built a path at all. No backfill needed. Old items do not
self-heal (already stored with empty resources) — re-locking a North Star regenerates
them, and the fallback now fires properly for business skills.

**OPEN — next session:** Ose asked for **tooltips / UI** making this legible to users:
why a skill has no course yet, and how to refresh it. Not started. Per the standing rule,
this is designed in **Figma before any UI code**.

_Recorded 31 July 2026._

---

## 🚀 SHIPPED: Faster North Star, daily course sync, real approval gate (31 July 2026)

Three merges to `main`, all live in production.

**[PR #35](https://github.com/osedman/cvtailor-saas/pull/35) — North Star build returns
in about half the time.** `set-target` now responds as soon as role research completes;
placeholder items render immediately and a follow-up `enrich-plan` call fills in course
plans behind them. Per-stage timing logs added so the remaining cost is measurable rather
than guessed at. This also closed the staging↔prod gap: the only intentional difference
left is `lib/feature-gate.ts` (staging keeps the pre-GA allowlist, main has GA).

**[PR #36](https://github.com/osedman/cvtailor-saas/pull/36) — courses.** Three things:

1. **Why courses weren't showing at all.** Prod's `course_catalog` was **empty**. The
   table shipped with the 30 Jul port but the first sync never ran — the cron only fired
   Sundays. Roadmap generation asked the catalog for URLs, got nothing, and produced
   items with project ideas and no courses.
2. **Cron is now daily at 03:00**, and Microsoft Learn's record cap went 2,000 → 5,000.
   The old ceiling was silently discarding over half of Microsoft's ~4.4k catalog, and
   *which* half depended on their ordering rather than on quality. Prod went
   **2,012 → 4,443 active courses**.
3. **The approval gate is real now.** It used to key off *source trust*: anything marked
   `trusted: true` wrote straight to users, so 4,440 records went live unreviewed and the
   queue looked permanently empty. The split is now **catalog membership** — a record
   already in the catalog is refreshed in place, anything unseen goes to review whatever
   its provider. `/admin/courses` gained exact per-provider pending counts and
   Approve/Reject-all, because gating everything only works if approving is cheap.

Link-rot sweep also went 100 → 250 rows per run in waves of 25. At the old rate a catalog
this size took **over a year** to verify once; it is now under three weeks. The waves
matter because the catalog is dominated by one host — a single large `Promise.all` risks
throttling that looks exactly like mass link rot in our own data.

**Watch tomorrow (1 Aug):** the 03:00 run is the first time YouTube actually executes in
production, so the review queue gets real candidates for the first time. Check
`/admin/courses` and the `course_sync_runs` table.

_Recorded 31 July 2026._

---

## 🚀 SHIPPED: Career path GA — gate lifted, announcement sent (30 July 2026)

[PR #34](https://github.com/osedman/cvtailor-saas/pull/34) merged to main (`e4aefd2`):
the full staging port (course catalog + YouTube sync + review queue + cron, North
Star lock fix, onboarding walkthrough, Concept B skills UI) plus the beta-gate
lift — `isCareerPathBeta` returns true for everyone. Verified on prod:
`/api/career-path/access` → `{"beta":true}` unauthenticated, `/career-path` 200,
all course routes returning correct auth refusals (no 500s), `course_catalog`
migration applied with RLS. Prod env: `COURSE_SOURCE_REGION=GB`,
`YOUTUBE_COURSES_ENABLED=1` (channel IDs deliberately unset in prod — the
in-code `DEFAULT_TRUSTED_CHANNELS` list applies).

**Announcement email sent same day: 60 of 62 delivered** (2 failures, addresses
not captured — check Resend dashboard if needed). Copy:
`email/career-path-out-of-beta.md`; send script: `scripts/send-career-path-ga.mjs`
(same safety ladder as win-back). CTA asks for a one-word reply — **watch the
hello@gettailr.com inbox for "right"/"wrong" replies**; that's the North Star
quality signal.

Note: the gate lift is on **main only** — staging still runs the allowlist
version of `lib/feature-gate.ts` until staging next syncs from main.

Open follow-ups: first course-sync cron run unverified (skim logs); perf work on
career-path generation still to do; service_role rotation ticket above now MORE
urgent (the prod key also sits in `.env.development.local` locally for the send
script).

_Recorded 30 July 2026._

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

**Progress verified 30 Jul:** production is on the new `sb_publishable_…` key and
its **legacy `anon` JWT is disabled**, so the publishable half of this is done.
The legacy secret half was not checked. Note the fallout: updating Vercel during
the rotation overwrote staging's scoped keys and locked staging out — see the
30 July entry below.

_Last updated: 30 July 2026_

## 🔧 In progress / open PRs

| Item | Type | PR | Notes |
|------|------|----|-------|
| Weekly digest 22 Aug — "The part of your CV you are afraid to write" | Content | — | Fresh Reddit pull recorded in [email/reddit-digest-2026-08-20.md](../email/reddit-digest-2026-08-20.md): 836 unique posts, 13–20 Aug, five subs, two passes each (`top/.rss?t=week` + `new/.rss`), deduped by post id. Seven of ten feeds 429'd on first request; ~40 min of escalating backoff for the set. Theme: the history people are afraid to list (61 posts, the only cluster spread across all five subs) — the mirror of the 13 Aug send about lines doing no work. Sensitive specifics (disability, sex work, immigration status) generalised out deliberately. Sent to 62 of 69 subscribed, 0 failures, all 62 confirmed `delivered` by Resend. CTA moved to `app.gettailr.com/tailor` (canonical — `www.gettailr.com/tailor` redirects there) from the `.vercel.app` link the previous four used |
| Mailer credentials: prod list is in a different project than the env file points at | Bug | — | 21–22 Aug. `send-digest.mjs` could not read the list: `.env.development.local` points `NEXT_PUBLIC_SUPABASE_URL` at **staging** (`pwonuqkpumgejqmotkwh`, 3 subscribers) and its `SUPABASE_SERVICE_ROLE_KEY` has been a `SET_…` placeholder since 25 Jul. The 13 Aug send worked only because the session environment supplied production values, which the loader prefers over files — nothing was scrubbed. Real list is **`Cv-Tailor tool` (`wgpaaafseibcqagiiavt`), 69 subscribed**. Trap avoided: dropping a *staging* key into the env file authenticates fine and silently mails 3 people instead of 62. Fix: `scripts/lib/mail-env.mjs` now reads `.env.mail.local` **first** — mailer-only, gitignored, and NOT loaded by Next.js, so prod credentials there do not repoint the dev server at the live DB. Added a placeholder guard (`eyJ`/`sb_secret`/`sbp_` prefix check) that names the problem instead of dying on an opaque Supabase 401. Note: prod has legacy `anon`/`service_role` JWTs **disabled** — the key needed is an `sb_secret_…` under Settings → API Keys → Secret keys |
| First human click-through of the agency product — 7 findings, 2 fixed | Bug + Chore | — | `staging` 14 Aug. **The standing gap is closed: the loop has now been walked by a person**, signed in, against real data (`hm-smoke-halcyon` booking→consent-ask→complete→write-up, and `rls-test-alpha` ROL-2402 submission→portal→revoke). **The revoked-token path is proven end to end** — the thing flagged as never driven by hand: minted a fresh portal link (portal format mints only, it sends no email — worth knowing, the button says "Send to client"), opened it, revoked it, re-opened and got the refusal, with **zero candidate data in the revoked response** and the other recipient untouched. Also verified by driving them, not by status code: non-shortlisted candidates never reach the portal payload; the **disclosure freeze works** (call notes toggled off did not render); **"Known gaps, stated plainly" survives** (it lives behind *See evidence*, which is why a flat text scan reports it missing); decline copy still says "never removes anyone"; portal carries `noindex` + `cache-control: private, no-store`. **Fixed here (2):** (1) **the dossier scrolled sideways by 358px** — `.ag-dossier-grid`'s stacked rule used a bare `1fr`, which floors the column at min-content, and the requirement names set `white-space: nowrap`, so the column grew past the viewport; the desktop rule already used `minmax(0, 1fr)` and the stacked one now does too. Dossier-only; the workflow screens do not overflow. (2) **sent links were indistinguishable and revocation cannot be undone** — two links to the same contact rendered as identical rows (`Test Hiring Manager · Meridian Test Ltd · opened`), so a recruiter killing a leaked link was picking blind; `listRecipientsForRole` already selected `created_at` but never returned it, so the row now carries `sentAt` and renders "Sent 14 Aug 2026 · expires/revoked/expired …", reusing the clients screen's date shape. **Still open (5), not fixed here:** the Supabase **magic-link email template is malformed** (`token_hash{…` — missing `=`), so the button cannot authenticate and only the code path works — **check production's template, this would break real sign-ins**; the sign-in modal says "6-digit code" but the mail sends 8; `saveNarrative` writes the client-facing write-up into `review.notes`, the same column the "From your screening call" callout reads, so the two collide and the text renders three times ([candidates/[candidateId]/page.tsx:86](../app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx)); **the portal has no confidentiality footer** — it exists only in the Document format ([roles/[roleId]/page.tsx:1846](../app/agencies/roles/[roleId]/page.tsx)), yet the portal is the artefact the client actually opens; and role deep links by ref 404 (`/agencies/roles/ROL-2402` → "Role not found in your agency") even though every breadcrumb and card shows the ref — routing is by uuid. Sidebar "Candidates *n*" is a counter, not a route: there is no candidates list, you reach a person only through a role. tsc clean, build clean (80/80), **495/495 tests**. **Test data left on staging:** one extra submission + recipient on ROL-2402, revoked, with its audit rows; the original fixture link is untouched. |
| Mailer env drift + sender verification (`scripts/lib/mail-env.mjs`) | Bug | — | 13 Aug: `send-digest.mjs` read `.env.local` while `send-winback.mjs` and `send-career-path-ga.mjs` read `.env.development.local`, so the digest died on "RESEND_API_KEY missing" while the other two worked. New shared `scripts/lib/mail-env.mjs` resolves shell env → `.env.local` → `.env.development.local` and owns one copy of the guards. Digest's sender check was the loose `/gettailr\.com/` (would have passed `hi@gettailr.com.attacker.net`); all three now use the anchored `/@gettailr\.com>?\s*$/` plus `assertVerifiedSender()`, which calls Resend `GET /domains` and refuses unless the From domain returns `verified` — a regex only checks the env var's spelling, not deliverability. Also fixed: subject parsing swallowed `-->` when the HTML comment closed on the same line, so this week's digest would have shipped with it in the subject. Verified: guards reject spoofed/unrelated/missing-key cases; `--list --dry` gives 65 rows → 58 after screening |
| Staging admin sign-in dead-end (`/login` + `/dashboard` 404) | Bug | — | Reproduced 10 Aug on staging: unsigned `/admin` redirected to `/login` (404); 403 path + back link used `/dashboard` (also 404). Cause: those routes were never implemented — sign-in is the modal on `/tailor`. Fix on `staging`: real `/login?next=` page reusing SignInModal, admin redirects to `/login?next=/admin` and `/tailor`, magic-link confirm stays on the current host (no yank to prod via `getAppOrigin`), OTP request forwards safe `next`. Verify: open staging `/admin` signed out → login UI → after OTP land back on `/admin` |
| Staging missing `/admin/insights` (prod-only ship) | Bug | — | 10 Aug: staging logs showed repeated `GET /admin/insights` → 404. Insights & ops (`8c2e694`) shipped to `main`/prod only and was never ported. Ported page + `/api/admin/insights` + `lib/admin-insights` onto `staging`, with `userLabel` helper and Product health → Insights link. |
| Tailor results discovery (score CTAs, job-kit tabs, auto-scroll) | UX | — | Branch `fix/tailor-results-discovery` → staging. Score bar launches Gaps/CV/Cover letter; primary tabs CV·Gaps·Letter·Prep + More; post-tailor scrolls to results (Gaps if score &lt; 75) |
| Admin product-health dashboard | Feature | — | Branch `feat/admin-product-health`. Server aggregates only; masked stuck segments; cohorts + outcome funnel + quality + feature adoption. No migration. Staging verify next |
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
| Career Arc rebuild — design of record (1–2 Aug) | Design | — | Direction: evidence bank + shareable story cards (Ledger structure × Tailr skin). Approved set: `mockups/career-arc-refined-tailr*.html` (6 screens). Staged plan locked in `docs/CAREER-ARC-REBUILD-PLAN.md` (5 stages; constrained editing only, "NOTHING INVENTED" trust language, per-claim redaction). Figma port owed when MCP quota resets — gates stages 2–5 |
| Career Arc rebuild stage 1: evidence bank backend | Feature | — | Branch `feat/arc-evidence-bank`. Migration 019 `career_evidence` (RLS four-policy). `/api/career-profile` build pass now emits evidence cards (category/claim/source/cv_line) behind a deterministic no-invention validator (figures must appear literally in the CV; rebuilds preserve pinned/rephrased rows). New `/api/career-evidence`: GET with "used in N CVs" computed from `tailor_history` at read time; PATCH constrained actions pin/hide/reorder/rephrase (Haiku, fact-guarded) /add-from-cv (server rejects text not a substring of the stored CV). 16 unit tests on the truth boundary. Migration 019 applied to tailr-staging 2 Aug (via Supabase MCP — SQL-editor paste never landed). Extraction fixed same day: dedicated parallel Sonnet evidence pass (single pass starved evidence to 5 unsourced cards); rebuilds now use the fullest CV of the last 10 runs. Real-CV E2E PASSED 2 Aug: 15 cards / 4 categories / 6 quant / 14 sourced / validator kept 14 of 14; 422 on invented add-from-cv text |
| Career Arc: redactions survive rebuilds (bug found by full-flow E2E) | Fix | — | `staging` 4 Aug (`5b34c73`). Running wizard steps 1-3 end-to-end exposed it: rebuilds reinsert non-pinned/non-rephrased rows with new ids, orphaning share claim_redactions — the public page silently un-redacted a banded claim to raw figures. `remapClaimRedactions` (pure, 6 tests, 247 total) carries the map across: surviving ids untouched, replaced rows followed by exact normalized claim match then ≥70% word overlap, unmatched dropped (never jumps to an unchosen claim), no double-mapping. Best-effort in the rebuild path. Verified live: pin + band + public page all survived a real rebuild with zero dead ids. Also verified same session: fresh-build wizard flow auto-fires the new reveal |
| Career Arc: reveal rebuilt, evidence-led | Feature | — | `staging` 4 Aug (`0e42981`). Old reveal predated the evidence bank (opened on role line, ran on stats/achievements/qualities, never mentioned proofs). New reveal argues for the ledger it opens: proofs count → span → origin (their words) → climb → one number with role/company/CV-line named → NOTHING INVENTED stamp slamming in. Six beats, each conditional on real data (lib/career-arc-reveal, 8 tests, 241 total); thin profiles get short reveals, never padded. Tap/skip/replay/dots kept; reduced-motion collapses all animation. Verified live (5 beats on Ose's data — origin correctly self-omitted). Marketing assets same day: product GIF of the real reveal (Marketing/tailr-career-arc-reveal.gif) + animated ink teaser (Marketing/career-arc-teaser.html) |
| Career Arc: all four alternate concepts as live previews | Feature | — | `staging` 3 Aug (`026821f`). Mission Control / Metro Map / One-Sheet / Ledger built as real pages at `/career-arc/preview/[concept]` rendering the user's own arc, with a switcher. Invented telemetry from the mockups (momentum 87/100, readiness 78%, skill ratings /100, named target role, P&L line) deliberately NOT rendered — no source in the product. Honest substitutes: proof counts, reuse counts, promotions from same-employer title changes, skill counts. Metro lines = evidence categories joining at first-sourced role; One-Sheet quotes = the user's own claims verbatim. 10 unit tests. Verified live on staging (all four render Ose's 6 roles / 15 cards / 188 reuses) |
| Career Arc: design fidelity pass | Feature | — | `staging` 3 Aug (`cff8880`+`8669e04`). Closes the adaptations: MASK redaction tier (fixed-width blackout bars, constant width so magnitude can't be inferred; masked claims can't source the Number card); EV·NN chips inline on tailored-CV bullets (0.5 similarity floor, one card per bullet, screen-only — copy/editor/Word export read unchanged text); evidence panel as sticky rail beside the CV on xl; chapter proof counts from span/role overlap; Promotions stat derived from same-employer title changes, omitted at zero. 233 tests. Verified live: MASK end-to-end (public HTML shows bars, `80%`/`$3M` absent), 14 unique chips on bullets, stored CV chip-free. Still open: LinkedIn OAuth, sector labels (no honest source) |
| Career Arc rebuild stage 5: tailor evidence sidebar | Feature | — | `staging` 3 Aug (`1a71155`). Gaps tab opens with EVIDENCE MATCHED panel: segmented N-of-M coverage meter over the extract pass's strengths, covered requirements traced to bank cards (EV·NN chips + snippets, 'implied' when uncarded), named gap cards → existing add-skill (origin jd). ZERO changes to /api/tailor — matching is deterministic client-side (lib/career-arc-tailor-match, stemmed keyword-weighted overlap, 7 tests); silent for non-beta users. Fixed live: plural forms not matching (automations≠automation) + normalizeForMatch moved client-safe after the Anthropic SDK leaked into the browser bundle. REBUILD COMPLETE: all 5 stages on staging |
| Career Arc rebuild stage 3: share links + public page | Feature | — | `staging` 3 Aug (`1d30dcb`). Migration 020 `career_arc_shares` applied to tailr-staging via MCP. 192-bit token capability; deterministic redaction at one tested boundary (`buildPublicArc`); FULL/BAND/HIDE per claim; identity flags (first-name default ON, break default OFF); expiry 7/30/never; revoke instant (`force-dynamic`); 404 for missing=revoked=expired; noindex + generic title; share writes rate-limited. Security sweep: no critical/high. Staging E2E 18/18 incl. anonymous redaction assertions; browser-verified. MASK + cards deferred to stage 4 |
| Career Arc rebuild stage 4: share cards | Feature | — | `staging` 3 Aug (`efebb93`). Five-card 1080×1080 set (Cover/Number/Proudest/Path/CTA) as pure models in `lib/career-arc-cards` (12 tests), SVG previews + canvas→PNG downloads, no new deps. Live redaction state applied: Number = figure on FULL, band word on BAND, skipped when no quant survives; Proudest = pinned verbatim only. Verified live: 4-card set with hide-redacted pin correctly excluded, 5-card set after valid pin, download-all toast on staging. Stage 5 (tailor sidebar) remains |
| Career Arc rebuild stage 2: private arc ledger page | Feature | — | `staging` 2 Aug (`feat/arc-evidence-bank`). `/career-arc` rebuilt to the approved Ledger × Tailr skin (screens 01+02): ledger head + NOTHING INVENTED stamp, at-a-glance (incl. reuses via `usedCvCount`), ascending path chart (milestone nodes, you-are-here, dashed open next chapter), evidence bank grid (ink pinned card, hover PIN/REPHRASE/UP/HIDE, hidden drawer, add-from-CV UI), notes, tailor bridge. Thin-CV chapter-list state under 3 roles; break chapters "recorded, not counted against you". Reveal wizard kept. Dropped per approved design: old cover/staircase/organisations/skills/projects/qualities sections. Share button = stage-3 placeholder. Verified in-browser on staging (desktop+mobile, no overflow, skin boundary held); web-interface-guidelines pass applied. Awaiting Ose's look; Figma port still owed |

| Tailr for Agencies — B2B backend (schema + full API surface) | Feature | — | `agency-b2b` → staging 5 Aug. Design agreed in [docs/AGENCIES_SCHEMA.md](AGENCIES_SCHEMA.md) (dedicated `agency` Postgres schema; audit-coupled write model — anything with an AUDIT LOGGED pill is service-role-write-only, audit row in the same operation). **All 7 migrations applied to tailr-staging via MCP + RLS-verified** (two-agency isolation, cross-tenant denial, missing⇔quote evidence constraint, identities/suppressions lockdown, retention trigger +180d, purge drill end-to-end, Art 14 notice cap 28d, opt-in bridge probe-denied; exposed schemas toggled + REST-verified). Server code: `lib/agency/{types,db,scoring,ingest,rescore}.ts` (context/tenancy/audit layer; computeScore port w/ inputsHash + 10 unit tests; ingestion pipeline w/ verbatim-quote verification — unbacked strengths downgraded to missing — objection pre-block, dedupe, notice scheduling) + routes: roles CRUD, JD parse, candidate ingest (PDF/DOCX/TXT/paste), screening review/overrides/reset (per-override audit w/ parsed-vs-human from/to), decisions (human-only, null=undecided), submission generation (scores recomputed at generation, immutable snapshot, per-recipient sha256 portal tokens raw-once), anonymous portal (hash-matched, revocable, snapshot-only, client actions never change state), cron (purge+notices, CRON_SECRET). Consumer touch: 2 opt-in columns on profiles + `recruiter_profile_snapshot()` (service-role-only) + optional `from` on sendEmail. tsc clean, 51/51 tests. **Owed:** cron wiring (vercel.json+CRON_SECRET), notice copy review, teammate invites, rights routes, UI (Figma-gated; mono-guardrail allowlist decision needed), consumer opt-in UI, staging E2E, DPA/DPIA before real CVs. Recruiter validation: meeting notes in docs/meetings/2026-08-05 |
| Agency dashboard: role stage, score movement, one clock strip | Feature | — | `staging` 6 Aug (`1d64e50`). Design review of the shipped `/agencies` dashboard (built 7 Aug as PRs #54/#55, never design-reviewed), acted on. **Role rows now carry the six step rail** — intake, parse, add, calls, compare, send — derived server-side in `/api/agency/dashboard` from data the route already loaded (requirements, candidates, reviews, decisions, submissions, active recipients), so no extra queries. Segment states: done, here, blocked (parse failure or screened-with-no-decision), waiting (sent, no client reply). Rows also show the role's **top score and its movement since parse**, from `score_breakdowns.original_overall`, a column that existed for exactly this delta and was never selected. **Seven stat tiles collapsed to one strip**: pipeline and compliance were two banks competing at equal weight, mostly reading zero; anything non-zero gets a tile, every zero folds into one line naming what is clear. Attention rows gained a **severity rail** (coral = erasure/objection/decline, amber = soon, sage = waiting) so a rights request no longer looks like a client question — urgency now has its own ladder because coral already means "strong evidence" everywhere else. Headline **names the role that needs doing first** (new `focus` field, ranked broken → stalled → waiting) instead of generalising. Role list gained Live / Needs action / Closed filters (closed roles no longer sit in the live list). Tiles deep link into the step they belong to via `?step=` on the role page, read off `window.location.search` so no Suspense boundary is needed. Design source: [mockups/agency-dashboard-v2.html](../mockups/agency-dashboard-v2.html) — HTML-mockup fallback, Figma port still owed (Starter MCP limit). tsc clean, build clean, 296/296 tests; CSS geometry measured in browser (no overflow, 73px consistent row heights, no stage-label collisions). **Superseded same day by `683d7fa`:** Ose chose the full restructure to the mockup. `/agencies` rebuilt to the three-band design — dated hero naming how many things need you and which client slips; ≤3 Needs-you-now cards, worst first, severity rails (coral/amber/sage); one Queue panel with two tenses (Still to do derived from next calls, undecided screens, chases, notices, worth-a-look; Just happened from the audit log); role rows with company mark, salary band, day count, six step rail, top score + two-point spark of movement since parse; Clients band from portal open telemetry; Desk health = brief→first shortlist, shortlist→client reply, positive-response %, each naming its breaching row, rolling 90 days. Judgment features folded in, not dropped. Route additions: caller identity, per-role last activity from audit rows, notice detail with names, client actions linked to their role, health aggregation. Keyboard: `/` search, `n` new role. **Owed unchanged:** logged-in click-through with real data, web-design-guidelines pass, Figma port. |

| Agency workflow: screening responsiveness, Fraunces headlines, handoff chrome | Fix + Feature | — | `staging` 7 Aug (`84b8d42` + `a8ffce3` + `b7423c5`). **Bugs (Ose reported the star lag):** review edits painted only after three sequential round trips — now optimistic with rollback + error banner (stars, Mark reviewed, overrides, decisions); availability/salary/notice/notes inputs were keyed by field name so switching candidates could save one candidate's text onto another's review (keyed by candidate now, save only on change); screening tile switches refired a review fetch per candidate (once per candidate now); Reset call destroys the review with no confirm — asks first now. **Font:** Ose called Geist "super AI"; five specimens rendered on the dark ground; he chose **Fraunces headlines over Geist body** (variable font + opsz via next/font). Display face = screen titles, dashboard hero, attention/role card titles only; prose stays Geist, machine data stays Geist Mono. Deliberate agencies-side fork from brand v1.0. **Handoff chrome restored (from Ose's 7 Aug prototype recording):** breadcrumb + Back/Next, coral step eyebrows, rail checkmarks on completed steps, compare legend + five weighted sub-score bars (API sent them since day one, never drawn) + delta pills + sticky decisions strip, screening CV→post-call score pair + confidence strip + labelled call fields, parse two-line title. **Knowingly not built** (needs backend): call-script probe questions (nothing generates/stores them), submission document/email/portal previews. tsc+build+296 tests green each push; geometry browser-measured. Owed: logged-in click-through, web-design-guidelines pass. |

| Agency: probe questions + submission previews | Feature | — | `staging` 7 Aug (`25a0963`). The two things previously called "needs backend". **Probe questions — no migration, no model call.** `agency.candidate_reviews.call_answers` jsonb has existed since migration 3 and the review PATCH already validated it; only UI was missing. Two question sources: (1) **gap-derived** from this candidate's own must/important requirements whose effective strength is missing, partial or transferable (exactly what a call is for), keyed by requirement ref; (2) a **12-question standard library** (`PROBE_LIBRARY`: motivation, logistics, seniority, ways of working, depth), keyed L01–L12. Both fit the API's 10-char key cap. Recruiter picks from a grouped picker into the handoff's dark call-script card, answers inline, saves optimistically; a picked-but-unanswered question is stored as `""`, which drives the "n/m answered" counter. **Submission previews — my earlier "needs backend" was wrong.** The POST already returned the full immutable snapshot and `/portal/[token]` already rendered that exact shape, so the recruiter was the only actor who could not see what the client gets. Three containers over one snapshot: client-ready **document** (summary, per-candidate narrative, strengths with verbatim quotes, gaps stated plainly, not-put-forward count), **email** (recipients, subject, body, copy-to-clipboard as plain text), **portal** (per-recipient links with copy buttons + what the client will see). Tabs switch container; the recorded format stays the one generated and the card says so. Also: candidates list route now selects `call_answers`. tsc+build+296 tests green; picker geometry browser-measured (question text 307px, was ~170px squeezed). |

| Agency workflow: full prototype parity audit | Feature | — | `staging` 7 Aug (`0f82390` + `9ecc018`). Ose called out that screens were arriving in pieces — correct, I had been reconstructing from video frames while the prototype source sat in `mockups/agency-prototype/screens/`. Audited all seven screens line by line against it. **Client submission (`0f82390`):** the missing point was **Suggested interview focus** — the handoff closes every candidate in the client doc with the probe areas; now fed by the probe questions the recruiter actually picked, via a shared `lib/agency/probes.ts` so the submission route resolves the same ids and freezes `probe_areas` into the snapshot. Document rebuilt (paper on a mat + shadow, 720px measure, 2px header rule, per-candidate rule, middot bullets, confidentiality footer naming the client); email gained Copy email + the **Strengths** and **To probe** lines; portal gained the **full portal mockup** (dark header, At a glance grid, per-candidate cards with confidence bars + three client actions, per-recipient footer) instead of a bare link list; **Not shortlisted (internal record)** card built. Role GET now returns agency name so the doc signs itself. **Remaining screens (`9ecc018`):** detail — header role/years/location + confidence signal, evidence rows with weight·category and strength pills, MISSING as a chip, nutrition score breakdown, screening-call Q&A pairs, dark probe card with answered struck through, Recruiter override labels; screening — role line + salary band, rail NOT CALLED / delta, requirement weights; compare — confidence signal on cards and **S/H/R keyboard shortcuts actually bound** (the action bar had advertised them since the first build with nothing listening); intake — evidence-first principle block in its drawn form + JD char count/autosaved. tsc+build+296 tests green on each push; rendered and measured in browser. **Owed:** logged-in click-through, web-design-guidelines pass, Figma port. |

| Agency workflow: v0 redesign + performance pass | Feature | — | `staging` 7 Aug (`e81a455` + `164aabe` + `6b3a071`). Implemented from Ose's `candidate-discovery-dashboard.zip` (v0). **Compare:** the key correction — the tint now marks where a **recruiter overrode** the parse, not where the parse said "strong" (on a board whose claim is "a human decided this", the human's fingerprints are what's worth colouring), with a RECRUITER OVERRIDE marker; evidence quotes render **inside** matrix cells (2-line clamp) so the board reads without opening anything; grid not table with sticky header, zebra rows, coral weight for musts; sort (score/must/name), must-haves-only filter, hide+restore (view-only — never removes a candidate); summary cards gain rank, reviewed badge, delta, nutrition panel, confidence, and a **Top risk** line clamped to 2 lines so decision controls align. **Screening:** 3 columns (call queue / workspace / **sticky live score** — the score moving as you override is the product's argument, so it must not scroll away); queue tiles show CALL LOGGED / NOT CALLED + delta; probes above evidence (real call order); each requirement is a card that gains a coral border + wash + "was transferable · now strong" when overridden, with the parse quote inside it; strength picker is 4 dots; soft signals a 2×2 grid of 1–5 segments; **Save and next candidate** jumps to the next uncalled person or to compare. **Candidates:** expandable profile cards (trend line, evidence snippets, overall fit, must-have coverage + delta, location, experience, evidence-mix tally); CSS expansion, no animation dependency added. **Submission:** disclosure switches for scores/evidence/probes/notes/logistics — **deliberately frozen INTO the snapshot at generation, not applied at render**, because the snapshot is immutable and audit-coupled and a view-setting would let a stored submission look different later; plus an audit-trail panel (role, requirements, calls logged, override count). **PERFORMANCE:** compare matrix was doing `evidence.find()` per cell = candidates × requirements × evidence-rows scans per render (tens of thousands per keystroke at 8 candidates); evidence now indexed into a Map once per data change. Decision totals: 4 passes → 1. Ranked lists, probe catalogue and derived lists memoised; strength helpers are stable callbacks. Rendering: interaction feedback is transform/opacity only (compositor, no layout); `content-visibility` + `contain-intrinsic-size` on matrix rows, evidence cards and dashboard role rows; single eased width transition on bars; full `prefers-reduced-motion` honouring. **Deliberately NOT built:** "Fill from transcript" (no transcript capture, storage or consent basis exists — a fake button is worse than none). v0's index-keyed `callAnswers` rejected in favour of id-keyed (index keys break when a question is added). tsc+build+296 tests green on each push. **Owed:** logged-in click-through, web-design-guidelines pass, Figma port. |

| Agency workflow: screenshot parity pass (v0 zip, round 2) | Feature | — | `staging` 7 Aug (`3b1dea6`). From Ose's five screenshots of `candidate-discovery-dashboard.zip` against staging. **Profile cards:** CV source row (real filename from `source_detail`, or "Pasted text"), comp expectation from `salary_text`, Top strengths chips derived from requirements the candidate actually evidences strong (2 + overflow), fit pill arrow; candidates route now selects `source_detail`. **Parse:** constraints footer restored ("filters, not scoring inputs"). **Screening:** probes eyebrow copy per drawing, coral field labels on soft signals/fields, legend inside Evidence after the call, **Fill from transcript as a disabled control** with an honest tooltip (no transcript capture/consent basis exists — visible intent, no faked capability). **Submission:** live **client-facing preview** above Generate — dark header, editable intro, reviewed/shortlisted/must-haves/held stats, per-candidate client view (rank, call done, confidence, score, narrative from call notes, must-have evidence with quotes, probe list, comp/location/availability); disclosure switches drive it live, and **on generate the intro + switches freeze into the immutable snapshot** (document render uses frozen intro as summary, frozen availability + comp per entry). Audit trail gains Recruiter/Held rows. tsc+build+296 green. |

| Agency submission: two-column layout to the screenshot | Feature | — | `staging` 7 Aug (`0889f56`). Ose: "everything is expanded" — correct, the screen had become one long column of stacked cards. Rebuilt to the drawn layout: **preview left, controls as a sticky rail right** (what the client sees / held back / recipients / audit trail / close role). Header matches the screenshot (`N candidates, with the reasoning attached.`, Back to compare, single **Send to client** that generates in the selected container then reads ✓ Submission sent). **Document/Email/Portal toggle kept and made meaningful:** all three now render from ONE normalised row set, so it genuinely is the same content in a different container. Rows come from live state before sending and are **read back out of the frozen snapshot after sending** — the preview stops being a projection and becomes what the client received; a frozen banner names format + time, the intro goes read-only, and the disclosure switches lock (they were written into the submission, so they must not look editable). Recipients moved into the rail beside the portal option; held-back candidates listed with scores; the duplicated post-generation preview removed now one preview serves both states. tsc+build+296 green, rendered against the screenshot. |

| Agency workflow: self-audit and repair | Fix | — | `staging` 7 Aug (`ae5415f`). Reviewed the flow against itself rather than a design. **Regression I introduced in `0889f56`:** rebuilding the submission around Ose's screenshot dropped the client document's closing matter — the **confidentiality footer** and the **Known gaps** section. The footer is the worst loss: it is the paragraph telling a hiring manager the scores trace to source content and nobody was auto-rejected, i.e. the whole evidence-first claim, in the one artefact that leaves the building. Both restored (gaps in amber per the handoff). **Two dark headers on portal:** the document's dark cover was rendering above every format, so portal stacked it on the portal mock's own dark header and email showed a cover it doesn't need — the cover is now document-only; email/portal get a light introduction strip so the greeting stays editable everywhere. **Held listed twice** (rail "Held back" + "Not shortlisted (internal record)") — the internal record now covers rejected + undecided only. **Dead CSS:** 72 rules / 56 classes left by the dashboard, matrix, screening, candidate and submission rebuilds, removed after checking every class against every agency/portal/rights page; stylesheet 687 → 617 lines. **Verified and unchanged:** no unused state or locals under `--noUnusedLocals`, every class referenced by a page is still defined, compare keyboard handler + probe id resolution + frozen-snapshot path all behave. tsc+build+296 green. |

| Agency workflow: the seventh step | Fix | — | `staging` 7 Aug (`45f01be`). Ose caught it: the handoff rail has **seven** steps and the build showed six since the first UI commit, with Client submission mislabelled 06 and **Candidate detail missing from the rail entirely**. Cause worth recording: the rail was built from the *panes the workflow page renders* rather than from the workflow — step 06 is per-candidate and lives on its own route (`/candidates/[candidateId]`) so it should be deep-linkable, and it fell straight out of a pane-derived list. New `lib/agency/steps.ts` is now the single source of truth (`WORKFLOW_STEPS`, `stepNumber()`), imported by both pages so they cannot disagree again. Workflow rail renders all seven; Candidate detail routes to the active candidate's evidence map, ticks once any candidate exists, locks with a plain reason before that. **Detail page gains the same rail with 06 active**, a Viewing card, breadcrumb, step eyebrow and Compare/Submission buttons — it stops being an orphan with one Back button. Numbering flows from the shared list so Client submission reads 07 in rail badge, breadcrumb and eyebrow. tsc+build+296 green. **Also updated `~/.claude/skills/tailr-b2b`** (400→262 lines): stale build-plan/surface-inventory replaced with current state, the seven-step table, design lineage (prototype source is in-repo at `mockups/agency-prototype/screens/`), embedded product decisions, performance invariants, and the deliberately-not-built list. |

| Candidate detail (step 06) rebuilt to the prototype | Feature | — | `staging` 7 Aug (`01e662f`). Ose: "yours is scattered, the screenshot is organised" — and named three whole sections that were absent. **Built:** **Recruiter narrative** card at the top (Call done + score delta in the head, editable write-up that saves to `candidate_reviews.notes` — the same field the client submission narrative reads, so what you type is what the hiring manager gets, plus the *From your screening call* box on a coral rule); **Strengths** and **Risks and gaps** as two counted cards side by side, derived from actual evidence strengths; **Call answers** at the bottom (every scripted question + its answer, unanswered ones named, still-unevidenced refs listed after); **Soft signals** and **Logistics** as separate rail cards (call vs CV); **Prev / Next / Add to submission** in the header. **Reworked:** *Evidence by requirement* is now one compact row per requirement (dot · ref · text · weight · scoring multiplier +3.0/+2.0/+1.0 · chevron) opening to the verbatim quote and source, with overridden rows coral-bordered and tagged "Your call" — was nine stacked blocks; score breakdown gains the confidence signal and "Score moved up N points after your screening call."; Your decision states "Decisions are yours and reversible. Tailr never rejects a candidate." Layout is now `1fr / 320px` with a sticky rail, matching the drawing. tsc+build+296 green. |

| Tailr for Agencies — hiring-manager loop concept (Figma) | Design | — | Figma concept 12 Aug: [Tailr — Hiring Manager Concept](https://www.figma.com/design/AWRRbEOX6rLsltutFDL3zs), 8 frames / 5 pages, **awaiting Ose sign-off — no schema, routes or UI code started.** Decisions locked in session: HM posts the brief → recruiter owns the role and holds the **Push to job board** gate (publication is a recruiter action, never automatic); the board publishes into the consumer app — candidate-initiated per-role consent (applying shares the tailored CV + evidence map for that role only, never a searchable pool — resolves the parked sourcing thread through the agreed door); applicant pool shows **all** applicants ranked-not-cut (no-auto-rejection survives volume). Interview loop: Tailr-generated link is the capture mechanism (consent collected at slot-booking; candidate-declines falls back to a structured HM debrief, marked by source); transcript evidence passes the **existing** verbatim-quote gate (unbacked → MISSING); recordings deleted after transcript verification; per-round enrichment gates progression. Frames: concept map (four-actor swimlane), HM dashboard (dark `agd` theme: needs-you-now severity cards, role step rails BRIEF→DECIDE, availability chips), pre-round briefing (gap-derived focus + consent state + structured-debrief fallback), brief-received intake + publish rail, applicant pool (214 ranked, EVIDENCE MAP badges), close-out (references w/ referee notices, handover-pack doc w/ confidentiality footer, "when the hire is made, Tailr forgets" retention rail), consumer job board (**"what they'll score you on — same list the recruiter uses"** transparency panel; Geist only, Fraunces stays agency-side), and the two heroes: **evidence stratigraphy** (per-requirement strata CV→SCREEN→R1→R2 with verbatim quotes + timestamps, contradiction rail resolved-in-R2, MISSING explicit, "1 of 11 still unknown" inverse panel, advance/hold/decline strip with "declining never hides a candidate") and **round delta** ("what 45 minutes added": added/resolved/changed/still-open columns, R3-ready strip). Compliance carried in-design: Art 13 at application, AI-Act posture stated on-screen ("prompts questions, never scores the person"). Next: Ose reviews frames → workshop the client-actor auth model (`client_contacts` → optional auth) before any migration. **13 Aug:** Ose called stratigraphy v1 out — "just a board" — correct: it listed strata without drawing depth. **v2 built alongside** (same page, right of v1): a **time-machine scrubber** (view the dossier as it stood after any round), a **provenance colour ramp** (sand → amber → coral → ink, the deeper the colour the more recent the proof) applied to every mark on the page, the **core sample** (11 requirement blocks coloured by the round that proved them, the open one dashed), a **score waterfall** (87 = 66 CV + 9 screening + 7 R1 + 5 R2 — "no round ever subtracts"), per-requirement **certainty step-charts** (the on-call row reads flat-flat-flat-SPIKE; NHS reads flat-and-still-open), the contradiction row rebuilt so **both quotes survive side by side** before the resolving quote, ▸ tap-to-hear timestamps on every quote, and the "**if you only ask one thing in R3**" handoff card. Ose picked v2 same day: v1 deleted, ramp propagated to the round-delta frame (R2 ink rails + ▸ tap-to-hear on every quote, round-dot tags on prior values, amber dropped from the CHANGED column header because it collided with screening's ramp colour, ramp legend in the footer). |

| Client-actor auth model — workshopped and decided | Decision | — | 13 Aug, [docs/AGENCIES_SCHEMA.md](AGENCIES_SCHEMA.md) **§5.4**. The one schema decision the HM concept hangs off. **One auth pool** (auth.users = the person; consumer/recruiter/HM are orthogonal hats, post-login routing by hat lookup); **linkage** = nullable `client_contacts.user_id → auth.users on delete set null`, **invite-only** (audited grant, no email-matching self-claim), multi-agency = N per-agency contact rows per user, each independently revocable; **zero RLS grants for HMs** — API-only via service-role routes shaped by disclosure rules, extending the portal's anonymous-to-Postgres precedent (live tables hold recruiter-private material; a read policy is one mistake from showing a client the recruiter's notes); **client_actions not widened** — the interview loop gets its own audit-coupled tables keyed by (agency_id, contact_id), DDL is the next workshop; **magic-link-only** sign-in v1; **portal tokens coexist permanently** (revocation UI gets built as part of this); **same app, own route group**. No migration written yet — that gate is the loop-tables DDL workshop. |

| Interview-loop DDL — workshopped and decided | Decision | — | 13 Aug, [docs/AGENCIES_SCHEMA.md](AGENCIES_SCHEMA.md) **§5.5**. Nine-table set for invites + the loop, all agency-schema, recruiter-read RLS, service-role-write + same-op audit, HM zero policies per §5.4: `client_invites` (raw-once token, binds `client_contacts.user_id`), `role_briefs` (**pre-role object; recruiter converts** — ROL ref minted at accept, declining a brief is allowed and audited), `availability_slots` (booked = a round references it, unique index not a status column), `interview_rounds` (candidate-cascade — a round is candidate PII; per-round **candidate consent columns with their own token trail**), `round_artifacts` (kind transcript/**debrief** so declined consent is a kind not a missing row; **transcript jsonb in Postgres**, recording in Storage deleted after verification via cron sweep; `purge_candidate()` extended to return recording paths), evidence **reused not rebuilt** (origin widened + round_id — `evidence_quote_iff_present` polices transcript claims for free), `round_decisions` (**append-only**, latest wins, never touches visibility), `candidate_references` (referee `notice_sent_at` — referees are data subjects), `handover_packs` (immutable snapshot, **in-app delivery to the contact only** v1). Job board / applicant-pool DDL deliberately excluded — own workshop (consumer schema + Art 13). Next: write the migration files (linkage+invites first, then loop), staging only, Ose runs SQL per the standing rule. **Same day:** both files written — `supabase/migrations/20260813120000_agency_client_auth.sql` (user_id linkage + client_invites + audit entity types widened once for the whole build) and `20260813121000_agency_interview_loop.sql` (7 loop tables + evidence origin/round_id + purge). Three as-built deltas recorded in §4.1: **purge zero-breakage design** (purge_candidate untouched; new `candidate_recording_paths()` collector + `purge_expired()` recreated with an *added* recording_paths column, so deployed cron survives the apply-to-deploy window), **evidence.round_id CASCADE not set-null** (set null would trip the new `evidence_round_iff_interview` constraint), **booking = partial unique index on rounds.slot_id**, no status column to drift. **Applied to staging 13 Aug (pwonuqkpumgejqmotkwh) — production untouched.** Pre-flight confirmed both live constraint names matched what the files assume (so the widened checks replaced the old ones rather than coexisting). **Verification: 24/24 passed, fixture cleaned up, zero residue.** Structure: 8 new tables RLS-on, one SELECT policy each, zero authenticated write paths. Behaviour (17/17): slot double-booking rejected by the partial unique index; duplicate round_number rejected; interview evidence without a round rejected; **a transcript claim with no quote rejected — the existing quote⇔present constraint policing the new origin exactly as designed**; debrief-with-recording rejected; `capture_consent_status='assumed'` rejected; the recording collector returned the fixture path; purge cascaded rounds/artifacts/interview-evidence/decisions/references to zero while the handover pack survived with candidate_id nulled + ref intact, the audit `erased` row was written, and no suppression row was created for a non-erasure reason. RLS (7/7): alpha member sees own briefs, **0** beta briefs/rounds/invites; member's direct INSERT into round_decisions denied `42501`; **non-member (the HM case) sees 0 rows across all 8 loop tables**. Structural proof of §5.4: **0 of 38** agency policies reference `client_contacts` — linkage grants no DB access at all. Advisors: no new findings, new functions absent from the anon/authenticated SECURITY-DEFINER lists. Consent copy + DPIA update remain gates before any real interview is captured. |

| Agency settings: retention + notice delay | Feature | — | `staging` 14 Aug (`1689775`). Figma frame designed first. **`retention_days` and `notice_delay_days` have existed since migration 1 with no UI** — every agency was frozen on Tailr's defaults rather than its own policy, despite the migration comment saying "only owners may rename or change retention". `/agencies/settings`, owners only (a recruiter can run the desk without deciding how long the agency keeps third-party data; the screen reads `canEdit` from the server rather than assuming). Writes go through the service role with an audit row carrying **from → to**, so "who shortened retention, and from what" is answerable. **Known gap recorded in the module:** `agency.agencies` is still authenticated-writable by owners under RLS, so a determined member could PATCH via PostgREST and skip the audit row — closing it needs a one-line migration revoking authenticated UPDATE, which is what the audit-coupling rule asks for everywhere else. Copy carries the weight: each field says what it does *to a person*, retention names why 180 is the default (Equality Act tribunal window), and the notice field states the 28-day cap is not adjustable and that **zero is a legitimate choice**. **Build trap worth remembering:** the page first imported its limits from `lib/agency/settings`, which imports `agencyAdmin` → `next/headers` + service-role key → whole server chain into the browser bundle, failing the build. Bounds now live in `settings-limits.ts` with no server imports. *Types are erased and travel fine; constants are not, and do not* — the same trap `round-delta` was written to avoid. tsc clean, build clean (80/80), **495/495 tests** (8 new). |

| Audit log viewer + web-guidelines pass + a delta fix | Feature + Fix | — | `staging` 14 Aug (`47ce5dd`, `2fb8ec1`, `9b3102f`). **Audit viewer** (`/agencies/audit`, Figma frame designed first): every AUDIT LOGGED pill wrote a row nobody could read — the same shape of gap as the missing revocation control. **The care is in "who":** `actor_id` is nullable and its absence is *meaningful* — a candidate answering a consent link and a referee replying have no account and never will, so a null actor on those actions IS them; they read as "The candidate"/"The referee" in coral, because the colour carries whose data it is. Rendering them "unknown" would misattribute the most consequential rows in the log. A teammate stays "A teammate" (the log doesn't need a colleague's name, and fetching one would put addresses on a screen opened for other reasons). Reads use the **user-scoped client** — the log's own RLS does the tenancy work and the service role would only widen blast radius; writing stays impossible for anyone (no insert/update/delete policy at all). Unknown filter → 400, because unfiltered results read as "nothing matched". **Delta fix found by seeding real data:** ingestion writes an evidence row for *every* requirement including untouched ones (`missing`, no quote) — counting those as a prior layer made ADDED unreachable; a layer now counts as prior only if it says something (quote, strength above missing, or a recruiter's override). **Web-guidelines pass** (owed since 7 Aug) across the ~10 screens shipped this session: close-out's three referee inputs were **placeholder-only — unnamed text boxes to a screen reader** (now labelled, `type="email"`, spellcheck off); `hiring.css` and `consent.css` honoured no `prefers-reduced-motion`; tabular numerals added where digits sit in columns. Verified clean on the rest (icon-only controls have aria-labels, aria-live on async, destructive actions confirm, ellipsis character throughout). tsc clean, build clean (78/78), **487/487 tests**. |

| The two hero screens: living dossier + round delta | Feature | — | `staging` 14 Aug (`9217c58`, `9cd92c5`). **Living dossier** (`/agencies/roles/[roleId]/candidates/[candidateId]/dossier`) built to the stratigraphy v2 frame: every layer is a real row — CV evidence with its quote, `review_overrides` carrying from→to and the recruiter's reason, and debrief answers **keyed by requirement ref** (which is what makes the strata non-empty before enrichment). Core sample, score waterfall, and the **still-unknown inverse counter**. **Round delta** on the same page: a **pure function** over the built dossier (no server imports), so its logic has 10 real unit tests rather than mocked-query assertions. **Two refusals worth keeping:** the frame's CONTRADICTION lane is built as **REVISITED** — deciding two statements conflict is a judgement about meaning, and judgements belong to people, so both layers show together with no verdict (a test asserts "contradict" appears nowhere on the item); and a **debrief answer is never dressed up as a strength change** — CHANGED fills only from a real transition where both sides carry a strength, so it stays empty today and fills itself when enrichment ships. Per-round score movement deliberately absent: `score_breakdowns` holds original + current, not a value per round, so any per-round number would be invented. **Both screens say on-screen that they are shallow today**, driven by whether any interview-origin evidence exists rather than by a flag — the banner disappears on its own when capture ships. **Built recruiter-side despite the frames being drawn client-side:** a dossier contains the parse, the overrides and the reasons — the recruiter's working. The client sees the submission snapshot, the disclosed subset. An HM-facing version needs a "was this candidate actually submitted to you" gate first. tsc clean, build clean (76/76), **474/474 tests**. |

| References, handover pack, close-out screen, referee page | Feature | — | `staging` 14 Aug (`69803e3`, `31a9f64`). The last loop tables that had schema and no code, plus the last signed-off frame. **References:** a referee is a third party whose details reach us from the candidate, so **the request and the fair-processing notice are the same email** — a separate "by the way, we hold your data" would arrive after the ask. `notice_sent_at` stamps in the same operation and a chase deliberately does not re-stamp it (a reminder is not a new notice). A refusal is a recorded state, not silence — those mean different things to a recruiter. Reply token is spent on use; words stored verbatim. **Handover pack:** frozen snapshot, never re-derived; **gaps stated plainly** and outstanding references left visibly outstanding (an employer inheriting this person is entitled to both); confidentiality footer carried and tested, since it was dropped once before on the client document. **Close-out screen** (`/agencies/roles/[roleId]/close-out`) built to the 13 Aug frame: pick the hire, collect references, freeze and hand over; outstanding references do not block — the pack says so instead of hiding it. **Referee page shipped WITH it, not after** — the reference email links to `/reference/[token]`, so shipping the sender without the destination would have pointed third parties at a dead link. "I'd prefer not to" is the same size and shape as the primary button, not a footnote. tsc clean, build clean (76/76), **464/464 tests**. |

| Consent flow, debrief fallback, deletion sweeps, and the last wiring | Feature | — | `staging` 14 Aug (`85c112a`, `f8dfbd4`, `cf289f5`). **Consent** (`lib/agency/consent.ts`, `/consent/[token]`): `recordDecision` takes a raw token and *nothing else* — no AgencyContext, no HiringContext — so there is no code path by which a recruiter could consent on someone's behalf; that is an absence in the type signature, not a rule to remember. Requesting is separate from booking and leaves the status untouched: asking is not answering. **Withdrawal is a cascade** — deletes the artifact, returns the recording path for blob deletion, deletes every evidence row sourced from that round, flags a rescore. Both consent options render with identical weight and no pre-selection (a default *is* an answer, and it would not be theirs); the email's buttons pre-select nothing either, because a click in an email client may be a prefetcher and must never become a consent record; withdrawal sits at equal prominence per Art 7(3). **Debrief fallback** (`lib/agency/artifacts.ts`): `kind='debrief'` is what makes declining free — the round still produces an artifact, so the process can require a record without requiring consent. Structured, keyed by requirement ref not array index; records who wrote it. **No function creates a `transcript`** — that needs capture, which needs copy a lawyer has not read. **Two deletion sweeps in the cron**: the `recording_paths` column migration 11 added to `purge_expired` finally has a consumer, and a verified-transcript sweep keeps "the audio is deleted as soon as the transcript is checked" true — **blob first, stamp only what storage confirmed**, since stamping first would leave audio on disk the product believes it destroyed. Recordings get their own bucket (`agency-recordings`, created when capture ships) — a CV is a document someone handed over, a recording is their voice. **Wiring**: consent request on the booking screen; write-up + decision on the HM dashboard, ordered so the decision buttons only appear after something is written (§5.5 "no artifact, no progression" made visible). **Copy fix:** the consent copy said "your recruiter writes up their own notes" — the person who ran the interview is usually the HM, so all three places now read "the people you meet write up their notes". tsc clean, build clean (76/76), **451/451 tests** (35 new). **NOT CLEARED FOR A REAL CANDIDATE** — lawyer review + DPIA outstanding; see [docs/CONSENT-COPY-DRAFT.md](CONSENT-COPY-DRAFT.md). |

| Recruiter booking screen | Feature | — | `staging` 14 Aug (`92ca867`). Figma frame designed and signed off first (page 02 → `Recruiter · Book an interview`), then built. `/agencies/roles/[roleId]/interviews` — two live pickers (who is on the role · the windows the client offered), joining link + duration, confirm bar naming the derived round number, and a "Booked" list with mark-done / cancel (cancelling frees the slot, since the open-slot query ignores cancelled rounds). **Deliberately NOT an eighth workflow step** — `lib/agency/steps.ts` stays the single source of truth for the seven; this is an adjunct reached from the role crumbbar, same shape as `/agencies/clients` and `/agencies/briefs`. **The amber note is load-bearing, and is a deliberate departure from the approved concept:** the concept promised Tailr generates the meeting link and *"joins, captures and transcribes"*. None of that is built and none of it can be until the candidate-facing consent copy clears the DPIA gate, so the screen states plainly that Tailr does not host or record the call, that transcripts and per-round enrichment do not exist, and that **no candidate has been asked to consent to any of it** — the recruiter pastes their own link. Rendering a Tailr-generated link would have been exactly the faked capability the project forbids. **Delete that note the day capture ships, and not before.** `listRoundsForRole` added to back the booked list. tsc clean, build clean (75/75), **426/426 tests**. |

| Availability + interview rounds (steps 4–6 of the loop) | Feature | — | `staging` 14 Aug (`bfac706`). The read side already existed (the HM dashboard has rendered these tables since the shell shipped); this is the write half. **Division of labour is a product decision:** the **HM** offers/withdraws availability (times belong to the person whose diary they are), the **recruiter** schedules a round (they own the process and hold both sides), the **HM** decides the outcome (append-only — a reversal is a new decision, not an edit). **⚠️ CAPTURE CONSENT IS DELIBERATELY NOT SET.** Rounds are created leaving `capture_consent_status` at `'pending'`: consent is the candidate's to give against copy they read, and that copy is still behind the DPIA/notice sign-off gate. **There is no function in the module that can assert it on a candidate's behalf**, and a test asserts the insert never carries those columns. **Round numbers are derived** from the candidate's existing rounds, never supplied — a caller cannot skip, duplicate or back-date one. **The partial unique index on `slot_id` is the booking mechanism**: a race surfaces as `23505` and is translated to "someone was booked into that time a moment ago" rather than two people in one slot. **Withdrawing a booked slot is refused** and points at cancelling the interview — somebody is expecting that call, and a round pointing at an unoffered time is worse than making the client choose. `'decline'` remains a state for the ROUND: it writes a decision row and touches nothing about the candidate (a test asserts `candidates` is only ever read). Routes: `/api/hiring/availability` (POST/DELETE), `/api/agency/roles/[roleId]/rounds` (GET open slots, POST book, PATCH complete/cancel), `/api/hiring/rounds` (POST decision). UI: the HM availability band is now interactive — offer a window, withdraw an unbooked one inline. tsc clean, build clean (75/75), **426/426 tests** (11 new). **Owed:** the recruiter-side booking UI (backend is live, no screen yet — needs a Figma frame), and `round_artifacts`/enrichment, which is the DPIA-gated half. |

| Recipient revocation — a leaked shortlist link can be killed | Feature | — | `staging` 14 Aug (`e1f8662`). **Closes the gap flagged 7 Aug as the highest-value one left.** `submission_recipients.revoked_at` has existed since migration 4 and `app/api/portal/[token]` has always refused a row carrying it (`if (data.revoked_at) return null`) — but **nothing in the product could set it**, so a shortlist forwarded to the wrong inbox could not be withdrawn from inside Tailr, while the submission screen told recruiters each link was *"revocable on its own"*. Enforcement already existed; this is the missing half. `lib/agency/recipients.ts`: `listRecipientsForRole` + `revokeRecipient`, audit-coupled (service role, audit row in the same operation, `action:'recipient_revoked'`, ids only — no email, and the raw token never existed anywhere loggable). The update is **conditional on `revoked_at is null`** so two clicks cannot log two revocations; re-revoking is a no-op, not an error. **Revocation is deliberately not deletion** — the row is the attribution trail for whatever that recipient already did (`client_actions` point at it, `contact_id` is RESTRICT), so killing the link must not erase who was sent what. The list's **`live` flag is computed from the same two conditions the portal enforces**, so the screen cannot tell a recruiter a link is dead while it still opens; tests assert that correspondence directly, plus cross-tenant refusal being indistinguishable from not-found, viewers refused before any DB call, and no email/token in the audit row. UI: a "Links you have sent" card in the submission rail (who holds it, opened or not, confirm-before-revoke). tsc clean, build clean (73/73), **415/415 tests** (10 new). **Not yet proven end-to-end:** raw tokens are stored hashed only, so the portal-refuses-a-revoked-token path has not been driven by hand — the 4 live fixture links in `rls-test-alpha` are the way to do it. |

| Agency identity in the chrome + switcher | Fix + Feature | — | `staging` 14 Aug (`acbe307`). Setting up the HM demo put one account in two agencies and exposed a real gap: `requireAgencyContext()` took the oldest active membership **silently**, so the second agency was unreachable — and **nothing in the recruiter chrome named the current agency either**, so every role, candidate and client on screen came from an agency the product never identified. Now: the resolver reads an optional `ag_agency` cookie and returns every active membership on the context; the sidebar names the current agency (a **label** with one membership, a select with two — a dropdown with a single option invites a choice that does not exist); `/api/agency/session` GET/POST switches. **The cookie is a preference, not a permission** — re-validated against the caller's own memberships on every request, so it can only select between agencies they already belong to; a forged or junk value falls back to the default, and POST refuses an unknown id outright rather than silently doing nothing (a switch that quietly fails is how someone edits the wrong agency's role). Additive on `AgencyContext`, so all 52 call sites are untouched. 7 new tests cover the cannot-widen-access property specifically. tsc clean, build clean (73/73), **405/405 tests**. |

| Brief flow UI + **the first real logged-in click-through** | Feature | — | `staging` 14 Aug (`efe888a`, `3d701dd`). Both signed-off screens built. **`/hiring/briefs/new`** (dark workspace): fields map 1:1 to `role_briefs`; the three product rules sit at the point of use — the subhead ("every line becomes a requirement they screen against"), the nice-to-haves hint ("Scored, but they never rule anyone out"), and the never-posted-publicly / company-not-named lines. **`/agencies/briefs`** (light workflow surface): Decline sits beside Accept at equal weight and always asks for a reason — a brief comes from a person the recruiter has a relationship with, and burying the decline would make saying no feel like a failure state; Accept confirms first because it mints a reference that cannot be un-minted, and the confirm *names* that consequence rather than hiding it in a tooltip; declined briefs stay in the list. The dashboard's disabled "Post a brief" control is now real, and **the empty-state copy claiming briefs weren't built yet was corrected — leaving it would have been the honesty rule pointing the wrong way.** Both pages reuse the existing `ag-*`/`agd-*` primitives; new CSS only where those genuinely lacked something, each rule documented with why. **Bug caught during browser verification, not by tests:** the recruiter page rendered "Nothing waiting on you" directly above an "Unauthorised" banner — a refused request reading identically to an empty inbox, the same shape as the `200 {enabled:false}` lesson in CLAUDE.md. On error the headline stays neutral and the empty card is suppressed (`3d701dd`). tsc clean, build clean (72/72), 398/398 tests. **⭐ THE STANDING GAP IS CLOSED:** the authenticated accept click was done by Ose on staging 13 Aug 22:29 — `client_contacts.user_id` bound for the first time through the real flow, audit row verified as `client_invite/accepted`, `entity_ref` = the company (not the email), actor attributed, `to_value` carrying uuids only (no raw token, no address). Every claim about the HM surface up to this point had been "builds, tests pass, rendered in a harness"; this one is a human session. **Demo state on staging:** agency `hm-smoke-halcyon` ("Halcyon Search") with Ose as owner (backdated so it wins the membership race) and a linked Meridian Health contact. **v1 gap this exposed:** `requireAgencyContext()` takes the first active membership by `created_at`, so a person in two agencies silently sees only their oldest — no switcher, no indication another exists. |

| Brief flow backend: HM submits, recruiter converts to a role | Feature | — | `staging` 14 Aug. Step 1 of the interview loop, server + API only (screens designed and signed off, UI not built yet). **`lib/agency/briefs.ts`** — `submitBrief` (agency_id derived from the caller's own link, never from input; unlinked contact → `AgencyAccessError` *before* title validation, so probing a foreign contact id can't be distinguished by error type), `listBriefsForHiringManager` (returns `[]` without querying when there are no links; filters on contact_id AND agency_id because the service role bypasses RLS, so both are load-bearing), `listBriefsForAgency`, `declineBrief`, `acceptBrief`. **The conversion is the interesting part.** No multi-statement transaction exists through supabase-js, so `acceptBrief` is: read agency-scoped → if already accepted *with* a role_id, return that role (the idempotent path — a double-click cannot mint two roles) → **claim** via conditional update on `status='submitted'` → only then request the ref from `next_role_ref` → insert the job_role as `draft` → stamp role_id → two audit rows. Losing the claim re-reads and answers with the winner's result. The one accepted failure mode is documented in-code: a brief can sit `accepted` with a null role_id if the process dies mid-flight, and the next call finishes it — the ref is only ever requested *after* the claim succeeds, so no duplicate is minted. A declined brief throws rather than converting, so an accept can never overturn a decline; declines never delete the row. Client-facing and recruiter-facing column projections are deliberately separate constants (`BRIEF_LIST_COLUMNS` is mirrored by `getHiringDashboard`, so widening it would widen client disclosure). Routes: `/api/hiring/briefs` (GET/POST) and `/api/agency/briefs` + `/[briefId]` (POST accept/decline, returns roleId+ref). tsc clean, build clean (70/70 pages), **398/398 tests** (31 new). **Process note:** the first workflow attempt failed outright (foundation agent stalled, zero agents completed); the rerun split the module across two sequential agents, constrained reading to three named files, and specified the claim-then-mint design up front instead of asking an agent to derive it. Three agents in the rerun still errored, but had written their files first — everything was verified by hand before this commit rather than trusted from the gate report. **Owed: the UI for both screens, and the `/hiring` dashboard's disabled "write a brief" control becomes real once it lands.** |

| Brief flow design: HM writes a brief, recruiter converts it | Design | — | Figma 14 Aug, [Tailr — Hiring Manager Concept](https://www.figma.com/design/AWRRbEOX6rLsltutFDL3zs) — **signed off by Ose; backend in progress, no UI code yet.** Two frames for step 1 of the loop. **`HM · Write a brief`** (dark workspace surface, page 01): fields map 1:1 to `role_briefs` columns so nothing on screen lacks a home in the schema; rail = what happens next (3 steps, ending "evidence attached to every name"), your recruiter, and **"What this form is not"**. The copy carries three product rules at the point of use rather than in a policy page — *"every line becomes a requirement they screen against, and you will see the scores trace back to it"*; *"One per line. Scored, but they never rule anyone out"* under nice-to-haves (no-auto-rejection at the input); and *"Tailr never posts your role publicly, and your company name is not shown to candidates unless your recruiter chooses to name it"* (the §5 don't-name-the-client rule, told to the client). **`Recruiter · Client briefs inbox`** (light workflow surface, page 02): one expanded brief in the client's own words, **Accept — create the role** (note spells out that it mints the next ref and drops into 01 · Intake pre-filled) beside an equal-weight **Decline with a reason**; collapsed rows show awaiting / accepted→ROL-2399 / declined; footer states the consequence — *a declined brief is kept, with its reason — the client sees what you told them*. **Two file hygiene fixes found while building:** (1) a DUPLICATE `HM · Write a brief` frame existed at identical coordinates from an interrupted turn — its microcopy was better in three places, so those lines were grafted into the approved frame and the orphan deleted; one frame per screen now. (2) A **systemic Figma authoring bug**: `textAutoResize` was being set BEFORE `resize()`, which silently resets sizing back to fixed — 15 nodes on the new frame and **12 on already-approved frames** (dashboard hero, three pre-round briefing cards) stored `height: 10` while rendering up to five lines, so text overflowed without reserving space and collided with whatever sat below. All re-flowed. Correct order is resize, then autoresize. |

| HM client-invite flow + `/hiring` shell (the first real HM code) | Feature | — | `staging` 13 Aug. §5.4 made real: the interview loop stops being data-only at the doorway. **Server layer** `lib/agency/client-auth.ts` — `requireHiringContext()` (hat detection: session `auth.uid()` → service-role lookup of `client_contacts.user_id`, because a user-scoped read returns nothing for an HM by design), `createClientInvite/revoke/unlink`, `listClientAccess`, `peekInvite`, `acceptInvite`, `getHiringDashboard`. **Security decisions worth keeping:** invites are looked up BY HASH in SQL (length-guarded first), never fetched-and-compared; `acceptInvite` **claims the invite via a conditional update (`.is('accepted_at', null)`) before binding `user_id`**, so two tabs cannot both bind; email match is trim+lowercase ONLY (no plus-address stripping or dot-folding — provider-specific guesses, and guessing wrong grants the wrong mailbox); a **failed claim is audited too** (`action:'rejected'`, `reason:'email_mismatch'`) because a wrong-account attempt on a live link is exactly what a recruiter should see; `unlinkClientContact` also revokes any live invite, or "remove access" could be undone by an old email in an inbox. **Disclosure:** every dashboard query is double-scoped (contact_id AND agency_id), columns are enumerated not `*`, `candidate_id` is read ONLY to resolve `candidate_ref` and never returned, `job_roles` gives up `title` alone (not `recruiter_notes`/`jd_raw`/`company_context`), and `capture_consent_*` is deliberately withheld — the candidate's recording consent is between them and the recruiter. **Routes:** `/api/agency/clients` (+`[contactId]/invite`, `/link`) recruiter-side; `/api/hiring/{me,accept,invite,dashboard}` HM-side, with `/api/hiring/invite` the only unauthenticated one (rate-limited, masked email, and invalid/expired/revoked/used all answer identically). **UI:** `/hiring` dark dashboard reusing the `agd-*` system + `/hiring/invite/[token]` accept page (light — a doorway, not the workspace) + `/agencies/clients` for granting and revoking. The loop behind it is still unbuilt, so **every band is an honest empty state and every unbacked control is disabled with a tooltip saying what to do instead** ("send the brief to your recruiter the way you do today"). **Post-login hat routing** (`lib/hat-routing.ts`, `/api/auth/landing`): explicit `next` always wins; otherwise a linked contact who is NOT a member lands on `/hiring` — recruiters and consumers keep `/tailor` untouched, so the only behaviour that changed belongs to people who could not use where they were landing. The PKCE callback rewrites the `Location` header rather than building a fresh response, because session cookies are written onto that object during the exchange. **Security fix, pre-existing and unrelated to the feature:** `safeNextPath` accepted `/\evil.com` — browsers normalise backslashes, so that resolved off-origin *immediately after a session was minted*. Now rejected, one shared implementation, and a source-scan test fails the build if any auth entry point re-derives the guard by hand (it had already drifted once). Built by a 23-agent workflow (3-lens review, every finding adversarially refuted before action). tsc clean, build clean, **367/367 tests** (48 on the invite logic alone). Local build needs placeholder Supabase env or `/_not-found` prerender fails — pre-existing, not a regression. **Owed: the authenticated accept click has not been done by a human yet** (it is the moment `client_contacts.user_id` binds for the first time), and the loop screens behind the shell. |

| HM concept revision: job board cut, quiet matching instead | Decision | — | 13 Aug, Ose's call. **Candidates never get a job board.** When a recruiter publishes a role, Tailr scans each consumer user's own evidence **consumer-side** and recommends the role **to candidates only** ("a role found you") — the agency sees nothing and nobody until an application lands (matched-but-didn't-apply ≡ never existed, same invariant as `recruiter_profile_snapshot`); recommended applicants then join the recruiter's pool alongside direct adds, badged by channel. This RESOLVES §5.3's parked thread B in the originally-agreed inverted direction, stronger than a board — recorded in [docs/AGENCIES_SCHEMA.md](AGENCIES_SCHEMA.md) §5.3 + §5.5 scope note. Figma reworked to match: concept map ("Publish for matching" / "Gets a match nudge", hero copy), recruiter publish rail (MATCHING OFF status, "you see nobody until someone applies"), applicant pool chips (VIA MATCH / DIRECT), and the consumer frame rebuilt from a board into a **match-recommendation surface** ("While you were working your path — a role found you": match card w/ why-you evidence lines, Not-interested that shares nothing, how-matching-works card; role detail gains "Only you can see this — a recommendation, not a listing"). During the rebuild the role-detail panel was accidentally deleted by a loose selector and rebuilt in full — screenshot-verified after. No DDL impact (matching was already excluded from migrations 10–11). |

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

---

## 🧹 Landing page: "How Tailr works" removed entirely (12 Aug 2026)

**What changed.** The scroll-pinned 3D card scene is gone, and so is the section
it belonged to. The landing page now runs Hero → Stats → Features.

Removed in four steps, because the ask sharpened as it went:
1. `scroll-story.tsx` → `how-it-works.tsx`: the animation deleted, the static
   four-step layout (already shipped to mobile + `prefers-reduced-motion`)
   promoted to everyone. 539 lines → 149.
2. Ose clarified: remove it **completely**, not just de-animate it. Section and
   component deleted.
3. Header and footer nav links removed (they had briefly been repointed at
   `/walkthrough` to avoid dead anchors).
4. `/walkthrough` itself deleted, with the hero's "See how it works" secondary
   CTA and the win-back email's "See how it works first" line.

**The redirect, and why.** `next.config.js` now permanently redirects
`/walkthrough → /`. Win-back emails already sitting in real inboxes link to that
URL and cannot be edited after sending; without the redirect every one of those
clicks would 404. The page is deleted either way — the redirect only decides
where an old email lands.

**Gotcha worth remembering:** the redirect had to go in `next.config.js`, NOT
`next.config.mjs`. Both files exist and **Next loads the `.js`** (that file's own
header comment says so). The first attempt put it in the `.mjs` and
`/walkthrough` kept returning 404 — caught only because the *behaviour* was
checked, not the diff. Verified after: 308 → `/` → 200.

**Also of note:** `winBackEmailHtml()` lost its now-unused `walkthroughUrl`
first parameter. Nothing calls it positionally (checked), so no silent argument
shift.

---

## 🚪 Product split, phase A: separate doors for consumer and B2B (14 Aug 2026)

**Why.** With real users, one shared front door has costs: a hiring manager who
is privately a job-seeker signs in through a consumer-branded page, B2B sales
sits on a consumer domain, and one careless post-auth redirect crosses products.
Decided 14 Aug: separate doors and separate domains, **one auth engine**
underneath (one `auth.users` pool, so every FK, the invite binding and the
consumer bridge are untouched), **one Vercel project** (one env-var set — the
28 Jul scoped-env burn stays un-repeated), **one Supabase project**.

This amends §5.4.1 (shared hat-routing) and §5.4.7 (single deployment).

**Shipped in this pass — staging only, and inert until `DOMAIN_SPLIT_ENABLED`:**

| Area | Change |
|---|---|
| `lib/site-url.ts` | Third origin: `getBusinessOrigin()` / `businessPath()` / `getBusinessHost()`, env-configured (`NEXT_PUBLIC_BUSINESS_URL`) so a bought domain is config + DNS, not code. `BUSINESS_PATH_PREFIXES` + `isBusinessPath()`. |
| `lib/site-url.ts` | The token doorways (`/portal`, `/rights`, `/consent`, `/reference`) added to `APP_PATH_PREFIXES` — they were in **neither** list, which is why `www` happily served them. They stay on the consumer app: a candidate exercising a right should not be sent to a domain branded for the agency they are answering. |
| `proxy.ts` | Host routing both ways, plus `/` on the business host → `/agencies`. |
| `lib/auth-paths.ts` (new) | `safeNextPath` + the landing constants, extracted into a module with **no server imports**. |
| `app/agencies/sign-in/` (new) | The business door. Same OTP engine, agency design system, light paper. |
| `lib/hat-routing.ts` | `resolveLandingPath` takes a **door**: from the business door a recruiter lands `/agencies` (was `/tailor`); the consumer door is unchanged. |
| Link minting | `/hiring/invite` → business origin; `/rights` and `/portal` → app origin. Four sites that bypassed `site-url.ts` now use it. |

**Two bugs found and fixed on the way, both live before this work:**

1. **Open redirect in the consumer door.** `app/login/page.tsx` carried a
   *fourth* copy of `safeNextPath` that checked the leading slash and the
   scheme but **not backslashes** — the identical bug the guardrail test was
   written for after `/auth/confirm` shipped it. It could not import the shared
   guard because that guard sat in a module importing `agencyAdmin`, so a
   client component pulling it in would drag `next/headers` + the service-role
   key into the browser bundle and fail the build. **Extracting the guard is
   what made "one guard, not four" actually available.** Both doors are now in
   the source-scan's `ENTRY_POINTS` (4 files, was 3).

2. **A 500 on the one path an auth error travels.** `getAppOrigin()` returned
   whatever was configured, unvalidated, and the proxy uses it as a `new URL()`
   base — a scheme-less value (`localhost:3000`) threw `ERR_INVALID_URL`, so a
   user whose magic link failed got a server error instead of the toast
   explaining why. Origins are now normalised and validated, falling through to
   the default when unusable. **Found by curling the route with a `Host`
   header, not by reading the diff** — the unit test stubbed a valid env and
   was perfectly happy.

**Verified:** 523 tests (was 495), build clean, `/agencies/sign-in` renders and
prerenders. Proxy rules exercised through the real `proxy()` with real
`NextRequest`s — including the rollback story, that with the flag off the
business rules are inert. Live: `Host: app.gettailr.com` redirects check out and
auth params survive.

**Not done:** DNS, the Vercel env vars, and Supabase's redirect allowlist —
`/auth/confirm` and `/auth/callback` must be registered for the business host
before the flag is flipped. Analytics still fires on both products (A6).
Production still has **zero** agency code.

---

## 🔒 Product split, phase A finished: session scope, and who gets measured (15 Aug 2026)

**A4 — the business host keeps its own session.** `authCookieOptions()` now
takes a host. The business domain is a `gettailr.com` subdomain today, so the
`.gettailr.com` parent-domain cookie would have handed the agency product the
consumer login through nothing but a DNS coincidence — the two products sharing
a session by accident, which is precisely what the split exists to stop.
Business hosts are host-only, always: one auth pool underneath, two sessions
above it. The check deliberately runs **before** the
`NEXT_PUBLIC_AUTH_COOKIE_DOMAIN` override, because that override exists to
*widen* the consumer session and widening it onto the business product is the
one thing it must never do. The host comes from `x-forwarded-host` first
(behind Vercel, `host` is the internal one) on the server, and
`window.location` in the browser. Unknown host → consumer default: an unknown
host must not silently widen scope onto the business product, but must also not
break the consumer session it is probably serving.

Consumer hosts are untouched — `app` / `www` / apex still share, and a test
pins that.

**A4 — `ag_agency` no longer outlives its owner.** The preference cookie is
httpOnly with a year on it and `supabase.auth.signOut()` does not touch it, so
one recruiter's working context sat in the next account's browser on a shared
machine. It granted nothing — `requireAgencyContext` re-validates against real
memberships, and the resolution tests prove a stale id is ignored — but the
selected agency's **name** shows in the switcher, and that is somebody else's
client list. `DELETE /api/agency/session` expires it and `signOut()` calls it.
The handler deliberately requires no session: clearing state when the session
is already gone is the whole point.

**A6 — the token doorways are no longer measured.** `<Analytics />` fired on
every route, including `/consent`, `/reference`, `/rights`, `/portal` and the
consumer `/arc` share. Two problems, and the second is the sharper one: the
people opening those pages are candidates, referees and clients exercising a
right or answering a request, not product users; and **every one of those paths
carries a live secret in the URL**, so measuring them risks writing a working
token into a record we cannot purge. `components/analytics.tsx` drops them at
render *and* inside `beforeSend` — render alone loses the race with a
client-side navigation, and "usually caught" is not a property worth having
when the thing not caught is a token.

Splitting consumer from business needed nothing extra: the products are on
different hosts and events carry the full URL, so the domain already separates
them. (The first draft of this passed two props — `beforeSendUrl` and
`data-product` — that do not exist on `AnalyticsProps`. Checked against the
installed types rather than shipped.)

**Verified by effect, not status code:** `DELETE` returns a real
`set-cookie: ag_agency=; Max-Age=0`. Analytics checked in a **production
build** (it renders only in production, so dev proves nothing) by reading the
live DOM: `/tailor` and `/agencies/sign-in` load `_vercel/insights/script.js`
with `window.va` defined; `/consent/faketoken` has neither. 535 tests (was
523), build clean.

**Phase A is done.** Still not done and still blocking the flag: DNS, the
Vercel env vars, and Supabase's redirect allowlist for the business host.
Production has zero agency code.

---

## 🔎 Migrations 12 + 13 applied to staging — and the guard that never fired (15 Aug 2026)

**Migration 12 (quiet matching) is applied to `tailr-staging`.** All eight
structural checks pass. Then the behavioural tests — run as a genuine
`authenticated` role, not as `postgres` — found a real hole.

**What passed.** With a live published role sitting in the table:

| | published roles visible | recommendations visible |
|---|---|---|
| user with **no** recommendation | **0** | **0** |
| user **with** a recommendation | 1 | 1 |

"There is no job board" is structural, not a rule anyone has to remember.
Rewriting your own `score` or `evidence`: blocked by the column grant.
Inserting your own opt-in directly: blocked, no write policy exists.

**What failed.** A client could set their own recommendation to `applied`.

`public.guard_recommendation_state()` shipped as `SECURITY DEFINER`, **which
rewrites `current_user` to the function's owner**. Proven on staging in one
query, same session, same JWT:

```
inside SECURITY DEFINER : current_user=postgres      auth.role=authenticated
inside a normal function: current_user=authenticated auth.role=authenticated
```

So `current_user not in ('service_role','postgres')` was permanently false and
the exception never fired. **That clause had been added for robustness**, after
noticing `auth.role()` returns null on a direct connection — the hardening is
what opened the hole. `auth.role()` alone had been correct.

Nothing could cross the wall (only the apply route sends anything to an agency,
and it does not exist yet), but `applied` is terminal by design, so a client
could permanently strand their own recommendation claiming a bundle was sent.

**Migration 13** drops `SECURITY DEFINER` — the trigger reads and writes only
`NEW`/`OLD` and never needed elevated rights. Applied. Re-verified in both
directions, which matters: a guard that blocks the client but also blocks the
service role would have "passed" a one-sided test while breaking the feature.

| as `authenticated` | as `service_role` |
|---|---|
| seen ✅ · dismissed ✅ · applied **refused** · score **refused** · evidence **refused** | applied **succeeds** · un-applying **refused** |

Migration 12 is left as it was applied rather than edited in place, with a
pointer at the top so nobody applies it to production without 13.

Test fixtures and probe functions removed; deleting the published role
cascaded its recommendations, which incidentally proved the cascade.

---

## 🎯 Quiet matching: the scan's decision layer (15 Aug 2026)

`lib/matching/scan-core.ts` — stage 2 as pure functions, with the I/O still to
come. Everything that decides anything lives here so its tests are worth
something.

**What the threshold means, settled and enforced.** Matching runs the SAME
`extractAssessment` and the SAME `computeScore` as candidates a recruiter
uploads by hand, with `overrides` and `softSignals` forced empty and
`reviewed` false — they are not parameters, because there is no recruiter here
to have formed a view. Precisely: *"would score at least N at the moment their
CV landed, before anyone looked at them."* A test asserts byte-equality with
the recruiter-side engine on the same inputs; if those ever diverge, the number
a recruiter sets stops describing what they think it does. **The
recruiter-facing copy must say so** — a reviewed candidate's score legitimately
drifts upward, and if the threshold silently meant the post-review number that
drift would read as a bug.

**What gets assessed.** There is no CV for a consumer user, so the assessor
reads their evidence bank rendered as text — their own claims, their own
rephrasing where they wrote one. Which is why every quote in a recommendation
is something the person themselves wrote. Hidden cards are excluded: hiding a
claim is the person saying "not this one", and honouring that only in the UI
would make it decorative.

**MISSING is enforced in code, not just constrained in the database.** A
strength arriving without a quote is demoted to `missing` rather than shown as
evidence that does not exist; a quote on a `missing` strength is dropped.

Verified against the deployed constraint rather than assumed — fed the exact
jsonb the code emits into `public.matching_evidence_is_well_formed()`:

| case | DB | code |
|---|---|---|
| `missing` with a quote | reject | cannot emit — drops the quote |
| real strength, no quote | reject | cannot emit — demotes to `missing` |
| quote over 1000 chars | reject | cannot emit — slices to 1000 |
| unknown strength | reject | cannot emit — only the four |
| exactly 1000 chars | accept | accepted |

Every rejection case is one the code structurally cannot produce, which is the
right relationship: database as backstop, code as enforcement point.

**Hashes are of rendered text, not row ids.** Reordering a bank or re-saving a
card without changing a word must not trigger a rescan; editing one claim must.

`selectMatches` is the one place the recruiter's number is applied, and it is
applied to a score, never to a person: everyone else is simply not
recommended — not rejected, not recorded as having failed, and told nothing,
because they were never told a scan was running.

572 tests, build clean. Still to come: the I/O layer, the publish control, and
the `/found` screen.

---

## 🎚 The consumer opt-in surface, and a correction about Figma (15 Aug 2026)

**Correction first: the Figma frames were always there.** `get_metadata` with no
node id returns only the FIRST page, so this session twice reported that the
file held one page and the consumer frames were unreachable. It has five, and
`use_figma` lists them all. Page `03 · Consumer job board` already held a
finished `Consumer · Match recommendation` frame — which was nearly redesigned
from scratch. **Use `use_figma` to enumerate pages; do not trust
`get_metadata` without a node id.**

Reading that frame changed the build. The opt-in was about to go on
`/career-arc` beside the evidence bank; the frame's own copy says *"Pause
recommendations any time in settings."* It also gave the real tokens —
consumer headlines are **Geist SemiBold 28, not Fraunces**, consistent with
Fraunces being agency-side only.

**New frame, signed off:** `Consumer · Settings — matching opt-in` (node
`109:2`, page 03), built to those tokens and placed beside the screen it leads
to.

**Built:** `/settings`, `GET|POST /api/matching/preferences`,
`lib/matching/preferences.ts`, and an `ns-switch` added to the design system
(a real `role="switch"` button — the state has to be announced, and this one
governs whether a person can be found by employers).

**Migration 14 — because the signed-off frame promised something the schema
could not keep.** The frame says *"Every time you change **either** switch we
keep the date and the exact wording you agreed to."* Two things broke that:
`matching_consent_events` could not say WHICH switch, and
`profiles.recruiter_visibility` was **directly writable** — `authenticated`
held UPDATE on every profiles column under an `auth.uid() = id` policy, so the
enrichment flag could be flipped with no record at all. That is the exact
weakness that justified giving matching its own opt-in, still live on the
older flag.

Migration 14 adds `subject` (`matching` | `enrichment`) and revokes column
UPDATE on the two enrichment columns. **Column-level revoke, not a policy
change** — name, country, cv_template and the digest preference stay
user-writable exactly as before. Nothing in the app ever wrote
`recruiter_visibility`, so this revokes a capability only reachable by hand.

**Order of writes is deliberate:** the consent event is written BEFORE the
flag. If the second write fails we hold a record of an intention that did not
take effect — recoverable and visible. The other order risks a changed flag
with no record of why, which is the failure the module exists to prevent.
`setConsent(userId, subject, granted)` takes no context object, the same shape
`recordDecision` uses on the agency side, so no code path lets one person
consent for another.

**Copy is load-bearing and tested.** "a rounded count, never who" is
`matched_bucket`; "does not un-send an application" is the terminal `applied`
state Postgres refuses to reverse; "shown only to you" is `published_roles`'
RLS policy. Tests assert each line stays, because if the schema changes the
copy becomes a lie.

**Deviation from the frame, stated not hidden:** Settings is in the account
menu rather than a nav tab. The real header's nav is already conditional
(Career Path, Career Arc, Admin) and a fifth item crowds mobile widths.

**Verified:** signed-out state renders on the `ns-` system, no console errors,
`GET` and `POST` both 401 unauthenticated — and auth is checked *before* body
validation, so a malformed body leaks nothing to an anonymous caller. 590
tests, build clean. **The signed-in screen cannot be verified locally** — it
needs a session and migration 14 on staging.

---

## 🔐 Migration 14's revoke was a silent no-op; 15 fixed it, verified (15 Aug 2026)

Migration 14's `revoke update (recruiter_visibility, …) on public.profiles`
ran without error and changed nothing. The grant it targeted is TABLE-level
(`authenticated=arwdDxtm/postgres`, zero column ACLs), and **in Postgres a
column-level REVOKE cannot subtract from a table-wide privilege**. Correct
syntax, real columns, no error, no effect — the worst kind of failure. Caught
only because the post-apply check reads the ACLs instead of trusting "applied
cleanly". Note `information_schema.column_privileges` misleads here: it
expands table grants into per-column rows, so it *listed* per-column UPDATE
that never existed as such. Read `pg_class.relacl` / `pg_attribute.attacl`.

**Migration 15** drops the table-wide UPDATE and re-grants an explicit column
list (everything but the two consent columns). Applied to staging. Verified
behaviourally, both directions, as real roles:

| as `authenticated` | as service role |
|---|---|
| `recruiter_visibility` direct update **refused** · `cv_template` still writable · forging a consent event **refused** · forging match_preferences **refused** · own history + own flag readable · another user sees zero events | setConsent's exact writes succeed, in its order (event first, then flag) |

Verification writes cleaned up (flag reset, probe event deleted, marked
`surface='verification'` so it could never be mistaken for a person's).

**Separate finding, deliberately not folded in:** `plan` and `tailors_used`
remain client-writable under `auth.uid() = id` — a signed-in user can
self-grant a paid tier or reset their usage counter with one PostgREST call.
Stripe writes via service role, so locking them should be safe, but that is a
billing decision for Ose, raised as its own task rather than smuggled into a
consent migration.

Staging now carries migrations 1–15. Production: still zero agency code.

---

## 📡 The scan runs: publish control, job pipeline, and an audit regression (15 Aug 2026)

**Migration 16** (`match_scan_support`, NOT yet applied) does two things:

1. **Repairs a live audit regression found in passing.** Migration 8 added
   `'member'` to `audit_log`'s entity-type constraint; migration 10 rebuilt
   the same constraint for the client-actor values — starting from migration
   1's list — and silently dropped it. Since 13 Aug, adding a recruiter to a
   team inserts the member row then **throws at the audit step**: the route
   500s, the invite email never sends, the member exists anyway. The rebuilt
   constraint carries the full list plus `'matching'`. A new test
   (`audit-entity-types.test.ts`) parses the union out of `types.ts` and
   requires every value in the newest constraint migration — the "keep the
   two in step" comment is now enforcement, not advice.
2. **`match_scan_marks`** — skip-on-unchanged bookkeeping. Records WHAT WAS
   ASSESSED, deliberately not what was concluded: no score column (a stored
   score for a non-match is a judgement kept where the person cannot see it),
   zero policies, zero grants.

**The scan** (`lib/matching/scan.ts`): pool → marks filter → prefilter cap →
shared assessment (with the role prefix prompt-cached — 200 assessments of
one role in a burst re-pay the role block otherwise) → shared scorer → write
recommendations → bucket. Dismissed and applied recommendations are never
rewritten: a dismissal stands, an application is terminal. People below the
prefilter cut get **no mark** — marking the un-assessed would convert a cost
cap into a rejection.

**The prompt-cache split is byte-identical.** `extractAssessment` now sends
two text blocks split exactly at the `<cv>` boundary; their concatenation is
the same string it has always sent, and only the role prefix carries
`cache_control` — a cached CV block would leak one candidate's CV into the
next call's context. A test pins both.

**Publish control** (`lib/agency/matching.ts` +
`POST /api/agency/roles/[roleId]/matching`): freezes the snapshot (re-publish
refreshes it in place, same row id so recommendations' FK holds), audit row in
the same operation (`matching_published` / `matching_updated` /
`matching_paused`), refuses a role with no requirements, and honours the
cooldown — a min-score change inside the window updates what the next scan
means, it does not buy an extra scan.

**A scan cannot be silently lost or doubly run.** Publish queues an
`ingestion_jobs` row BEFORE the response, hands execution to `after()`, and
the agency cron sweeps anything still queued. The runner claims the row with
`update … where status='queued'`, so when `after()` and the cron race, the
second finds nothing and stands down.

607 tests, build clean.

### Migration 16 applied and verified against real staging data (15 Aug)

Structure: `member` restored, `matching` added, client-actor values intact,
`match_scan_marks` present with RLS, no grants, and no score column.

**The audit regression is provably gone.** The exact insert that had been
throwing since 13 Aug — `entity_type = 'member'` — now succeeds; `'matching'`
succeeds; an invented value is still refused. Team invites work again.

**The full matching loop, walked on real data** — ROL-2403 (12 real parsed
requirements), the one staging user who actually has an evidence bank (16
visible cards), published at min score 70:

| scenario | published roles visible | recommendations |
|---|---|---|
| opted-in user, **live** role, no recommendation yet | **0** | 0 |
| after a role found them | 1 (ROL-2403, score + evidence map) | 1 |
| a **different** user, same live role | **0** | 0 |

The first row is the one that matters: the person is *in the pool* and the
role *is live*, and they still see nothing. "There is no job board" is not a
rule anyone maintains — it is a query that returns nothing.

`match_scan_marks` refused `authenticated` outright (`permission denied`),
which is the designed answer: scan bookkeeping belongs to the scan.

Closing the role expired the snapshot **and left the recommendation standing**
— a person's record of what they were shown is theirs, not the recruiter's to
revoke.

Staging restored exactly: role back to `open`, every verification row removed,
zero strays.

**Not yet exercised: the model call.** `extractAssessment` inside a real scan
needs the app running with credentials; everything either side of it is
verified. Recruiter publish UI and `/found` still to build (Figma first).

---

## 🎛 The publish control, built into step 01 (15 Aug 2026)

**The frame already existed.** `10:2 · Recruiter · Brief received → publish for
matching` had the whole card. Twice this session a finished design was nearly
reinvented because `get_metadata` without a node id returns only the first
page — **enumerate with `use_figma`**. What was genuinely missing were the
other states, now designed as `118:2 · Publish control — the missing states`.

**Built into `app/agencies/roles/[roleId]/page.tsx`**, third card in the
intake rail, exactly where the frame puts it. Four states:

| state | why |
|---|---|
| **Not yet** | A role has no requirements until step 02 and the scan refuses without them. The frame shows an enabled button at step 01, which could only ever error — this disables it and says why. |
| **Matching off** | Never published. "Or keep it direct-sourced." |
| **Matching live** | Minimum score, last scan, next scan, and the cooldown stated: changing the score applies to the next scan, it does not buy an extra one. |
| **Paused** | Stops new nudges; people already reached keep what they were shown and can still apply. |

**No count anywhere in the card**, per the 15 Aug decision. Scan liveness is
shown instead — without it, "found nobody", "found people who haven't applied"
and "the scan is broken" are indistinguishable.

The minimum-score field is labelled *"as scored on arrival — before review or
overrides"*, because that is literally what the threshold compares against
(`scoreForMatching` forces overrides and soft signals empty). Without that
line, a reviewed candidate's legitimate upward drift reads as a bug.

**Verified locally:** typecheck, 609 tests, build clean; every `ag-` class used
exists in agencies.css; `GET`/`POST` both 401 unauthenticated with auth checked
*before* body validation; the role page's new matching fetch fails safely —
only 401 network logs, no exceptions.

**Not verified: the card itself.** It needs an authenticated agency session,
so it must be looked at on staging. That walk-through is also the first time
the model call inside a real scan gets exercised.

---

## 🚪 "Clicking a role takes me to the recruiter screen" — you were never on the client side (15 Aug 2026)

Reported as a leak from `/hiring` into `/agencies`. It was not one. There is
**no link from the hiring surface into the recruiter product at all** — grepped,
zero. What actually happened:

1. Ose holds **both** hats: 2 recruiter memberships and 1 linked client contact.
2. `resolveLandingPath` checks membership **first**, so sign-in lands `/agencies`.
3. The recruiter dashboard and `/hiring` are **both dark and share the `agd-`
   chrome** — a deliberate decision ("the HM surface is the agencies product
   seen from the client's side, not a second product") that made them
   indistinguishable.
4. Clicking a role went to the recruiter workflow, correctly, because that is
   where he had been the whole time.
5. And nothing in the recruiter surface linked to `/hiring`, so the impression
   could never be corrected.

§5.4.1 had already decided the fix — *"switcher for multi-hat users"* — and it
was never built. Now it is:

- **`getHatsHeld()`** resolves both agency-side hats in one lookup. Never
  throws (chrome must not break a page), selects ids only (a name in chrome
  would be a leak), and excludes the consumer hat since everyone has one.
- **A persistent band on `/hiring`**: *"You are on the client side. This is
  what {agency} shows you — their working on candidates is not here."* Sticky
  under the topbar; goes static under 700px, because two stacked sticky bars
  eat a phone screen. Ready-screen only: over a signed-out screen it would
  assert a relationship the server has not confirmed.
- **A "Client view →" link** on the recruiter topbar, and **"Back to your
  agency →"** in the band — each shown **only** to someone who genuinely holds
  both hats. A recruiter who is not a client contact anywhere must not be
  offered a client view; a hiring manager must never see a door into the
  recruiter product.

Both flags default false, so the failure mode is a missing link rather than an
offered door. 618 tests, build clean.

---

## 🔎 /found — "a role found you" (16 Aug 2026)

Built to Figma `13:2` on the `ns-` system. The first real recommendation
(ROL-2403, 56.97, 6/6 must-haves, nine verbatim quotes) existed in the
database before the screen did, so it was built against real data.

**The RLS design is the data access.** Every read and write on this surface
runs on the USER-SCOPED client — SELECT-own recommendations, published roles
visible only-if-recommended, state transitions via column grant + trigger. If
a policy regresses, this page breaks visibly rather than a service-role read
papering over it.

**`'applied'` cannot pass through this surface, three layers deep:** the lib
type is `"seen" | "dismissed"`, the route whitelists the same two, and the DB
trigger refuses it from a client session anyway. A state string on a PATCH
must never be able to claim a bundle crossed the wall.

**Copy is the frame's, and tested line by line** — "a recommendation, not a
listing", "nothing is shared unless you apply", "dismissing shares nothing",
"same list the recruiter uses", MISSING rendered explicitly. Tailor/Apply
render DISABLED with the reason (the apply route does not exist yet), per the
"Fill from transcript" precedent. A closed role loses the apply path and says
"your record of it stays yours".

**Header pill** ("A role found you") renders only when an open recommendation
exists, fed by `/api/found/summary` which returns counts and never content.

Verified locally: signed-out state renders, no console errors, summary returns
zeros signed-out (a normal state, not an error), `/api/found` and PATCH 401,
no horizontal scroll at 375px. 662 tests, build clean. **The signed-in screen
needs Ose's staging session — the real recommendation is waiting on it.**

Next: the integration test (publish → scan → assert rows), then the apply
route.

---

## 🧪 The matching integration suite — and what its guard caught first (16 Aug 2026)

Six bugs shipped in quiet matching and every one was found by Ose clicking,
because every one lived where mocked tests cannot see: missing grants, a
stale schema cache, a SECURITY DEFINER guard that never fired, a no-op
column revoke, a one-way threshold, a half-publish across two schemas.

`lib/__tests__/matching-loop.integration.test.ts` runs the loop against the
REAL staging database — publish → snapshot/matching/audit/queued-job → scan →
recommendation + mark → skip-on-unchanged → cooldown → threshold-change
re-assessment (the migration-18 regression, permanently pinned) → pause. The
model call is the only mock; it was proven live and burning tokens per run
buys nothing. ZZ-prefixed fixtures, torn down in afterAll. Gated behind
`INTEGRATION=1`; the ordinary suite skips it offline.

**Its first act was refusing to run** — and the refusal was correct:

> **`.env.development.local` points local dev at PRODUCTION.**
> `NEXT_PUBLIC_SUPABASE_URL` there is `wgpaaafseibcqagiiavt` — "Cv-Tailor
> tool", the production project — with its service-role key beside it. So
> `npm run dev` on this machine reads and writes the production database.
> Possibly a leftover from the 30 Jul key-rotation lockout. Nothing in this
> session wrote through it (only signed-out pages and 401s locally), but it
> is a standing footgun and its own task chip. Repointing it is Ose's call —
> it changes his local sessions and needs keys only he can copy.

Consequently the suite takes **explicit** credentials
(`INTEGRATION_SUPABASE_URL` / `INTEGRATION_SUPABASE_SERVICE_ROLE_KEY`) and
refuses anything that is not the staging ref — it will never inherit the
app's env, because the app's env is exactly what was wrong. Both gates
verified by running them.

**Not yet run green**: it needs the staging service key, which only Ose can
supply. Run command is in the file header.

---

## 📮 Applying — the bundle crosses the wall, atomically (16 Aug 2026)

The last unbuilt piece of the matching loop. Migration 19 (applied to
staging, structurally verified, behaviourally proven with a rolled-back
probe): `public.apply_matched_recommendation()` — ONE transaction in the
spirit of `purge_candidate()`, the single path by which a matched person
becomes a candidate. Claim first (the concurrency lock: a double-click aborts
whole, and the rollback erases the consent event too — a consent record for
an application that did not happen would itself be wrong), then consent event
with the manifest, candidate (`source='matched'`), identities + duplicate
detection, evidence (`origin='matched'`), score breakdown with a
recomputed-by-construction inputs_hash, audit.

Deliberate absences and divergences, each pinned by a test:
- **No `candidate_notices` row.** Art 13 at the moment of applying — the
  manifest IS the notice. (Probe: notices=0.)
- **No model call.** What they confirmed is what crosses.
- **No candidate limit.** MAX_CANDIDATES_PER_ROLE on this path would be
  auto-rejection by arithmetic.
- **Suppression is an audited override, not a block** — the person who once
  objected is choosing to apply.
- **Stale requirements refuse.** Live requirements drifted from the snapshot
  → 409, nothing shared; the recruiter's republish (which rescans) is the fix.

The route: GET `/api/found/[id]/apply` returns the manifest; POST executes
with an EMPTY body — the server recomputes the payload, so the sheet and the
share cannot be two different things. `/found` gained the consent sheet
("Send this to {agency}", never "Apply"), the shown-once rights link on
success, and APPLIED state. The recruiter's candidate list badges
`Matched · applied themselves`. Tailor-first remains disabled with its
reason — its own integration, next.

RPC probe on staging (all fixtures rolled back): CAN-01 minted, candidate=1,
evidence=2 origin matched, notices=0, consent=1 with manifest, state=applied,
duplicate apply REFUSED. Integration suite extended with the apply chapter
(fixture fix: `agencies.slug` is NOT NULL). 679 tests, build clean.

## 🕳 The invisible-bytes 409 — caught by hexdump, not by the debug toast (16 Aug 2026)

The "stale requirements" 409 that blocked the first real apply is fixed, and
the cause explains why three independent SQL recomputations kept "confirming"
a hash the runtime refused: **the two copies of the requirements hash differed
only in invisible bytes.** `scan-core.requirementsHash` — the one apply calls —
separated ref/weight/text with literal NUL (0x00) and joined entries on literal
SOH (0x01), raw control characters sitting inside its template strings. The
publisher's copy (`hashRequirements` in `lib/agency/matching.ts`) used ordinary
spaces and an empty join. Every editor, every diff, every Read of the two
functions rendered them character-for-character identical; only a hexdump told
them apart. So publish stored the space-version hash, apply recomputed the
NUL-version, and the freshness gate could never pass — while every SQL
emulation, naturally typed with visible spaces, reproduced the *stored* value
and pointed the finger at the runtime.

Found by running the real imported function over the real staging rows in one
process next to the inline algorithm (`fn.toString()` betrayed the `\0`s after
esbuild re-printed them as escapes) — the deployed debug toast was never
needed, and it turned out its `debug` payload was dropped at the lib boundary
anyway. The person's click was replaced by a hexdump.

The fix (680bc51): scan-core rewritten with real spaces — the canonical form
is the one the database already holds, so no stored hash moves; the
publisher's duplicate deleted in favour of importing the shared function (one
canonicalisation, structurally); the temporary 409 diagnostic stripped from
lib and route. Two guardrails so this stays dead: a pinned-digest test on
`requirementsHash` (its output lives in `published_roles` and `role_matching`;
changing the canonical form silently strands every live snapshot), and a new
source-scan test that fails the build on any raw control byte in `app/`,
`components/`, `lib/` or `supabase/` — a control character in source is either
mangling or an invisible behaviour difference, and both deserve a red build.
682 tests, build clean. Verified against ROL-2403: the fixed function over the
live rows now equals the stored `39c22a22…`. Ose's real apply is next.

## 🎭 Behind the 409, a second bug: the sheet that could never open (16 Aug 2026)

With the hash fixed, Ose clicked apply and *nothing happened* — no sheet, no
toast. Supabase edge logs showed why that "nothing" was new information: at
13:51:42 the manifest GET ran its full query sequence (recommendation →
snapshot → requirements → **then profiles/career_evidence/agencies**, the
triple that only fires after the hash gate passes — proof the fix was live and
the server returned a manifest), and no RPC ever followed. The click died in
the browser after a successful response.

Cause (6f50371): the consent sheet and the sent-confirmation panel were
rendered **inside the `!user` early return** — the signed-out branch, the one
place `manifest` can never be set. A signed-in user's click fetched the
manifest and had nowhere to show it. Both overlays now live in an `overlays`
fragment rendered by the signed-in return. The stale-409 had been masking this
one all along: every prior click failed at the gate before reaching the sheet,
so the sheet's absence was unobservable until the first bug died.

## ✅ The first real apply crossed the wall (16 Aug 2026, 14:22 UTC)

Ose applied to ROL-2403 from /found — the first real quiet-matching
application end to end, on his own data. Verified by effect in SQL, every
write the RPC promises: rec `state='applied'`; ONE consent event
`subject='application'` carrying the full manifest (evidenceMap included);
candidate **CAN-04** `source='matched'`; 12 evidence rows `origin='matched'`
(9 backed with his own verbatim quotes, 3 explicit MISSING — exactly what the
consent sheet showed); one score_breakdowns row; **zero candidate_notices**
(Art 13 at apply — the manifest is the notice); audit row
`created/candidate/CAN-04`. Rights link issued and saved.

Both human checks passed: the recruiter side shows CAN-04 with the
"Matched · applied themselves" badge (RLS Test Alpha → ROL-2403 → step 03),
and the rights doorway opens from the issued link. **The quiet-matching loop
has now been walked end to end by a human on real data** — opt-in → scan →
recommendation → consent sheet → apply → recruiter pipeline → rights.
Known nit: the consent sheet shows "name and email" as the email twice when
the profile has no full_name.

## ✂️ Tailor-first apply — the promised CV finally crosses (16 Aug 2026)

The 13 Aug decision said "applying shares the tailored CV + evidence map";
the first build sent the evidence-bank render as a stand-in. Now built and on
staging (e959b03), designed in Figma first ("Tailor-first apply — the changed
surfaces", page 03, signed off by Ose):

- **/found's band makes tailoring primary** (as frame 13:2 always drew it) and
  opens `/tailor?rec=…` in **role mode**: the JD is rendered server-side from
  the frozen snapshot (`renderSnapshotJd`, deterministic so re-runs hit the
  tailor cache free) and the paste box locks read-only — "tailored against
  the role as it found you" is true by construction, not by trusting a
  textarea. The tailor route ignores the client JD when a recommendation id
  rides the request. Exit role mode = ordinary free tailoring.
- **Migration 20** (applied to tailr-staging): `tailor_history_id` +
  `tailored_against_hash` on `role_recommendations`, `on delete set null`,
  deliberately NOT in the authenticated UPDATE column grant — the link is
  service-role-written by the tailor route with the user in the predicate,
  because RLS checks the recommendation's owner, not the target row's.
- **Apply sends the tailored CV** — the person's last-saved version, edits
  included — instead of the bank render, ONLY while the hash it was tailored
  against equals the snapshot's current hash. A republish with changed
  requirements silently retires it and the band honestly reverts to "Tailor
  my CV to this role". Ownership of the history row is re-proven at apply.
  Replace, never both (signed off). No model call at apply, unchanged.
- **The sheet names what crosses** ("Your tailored CV for this role — exactly
  as you last saved it"), so CONSENT_COPY_VERSION bumped to
  matching-2026-08-16.

697 tests (new: matching-tailor-first — brief determinism, the tailored flag's
hash guard, and source scans pinning the frozen-brief override, the
double-owned link write, replace-not-both, and the read-only brief route),
build clean.

**Walked by Ose same day, verified by effect.** He minted ROL-2411 (same BA
JD), published for matching, the scan recommended him (64.72), and the full
tailor-first path ran: role mode → tailor → band flipped → apply. SQL proof:
manifest `cvSource: "tailored"`, manifest sha256 = sha of his tailored CV
(6,457 chars) = sha of the `cv_text` now sitting in the agency pipeline as
CAN-01. The agency received exactly the document he last saved. 10 evidence
rows origin matched, one score row, zero notices. Also proof-by-use of the
match floor: ROL-2402 (Backend Payments) scanned his BA-shaped bank and
correctly recommended nothing.

## 🧹 Task chips cleared, and the consent sheet that was a modal in name only (16 Aug 2026)

**Local dev is off production.** `.env.development.local` is a symlink to
`~/.config/tailr/tailr.env`; it pointed at `wgpaaafseibcqagiiavt` (prod) with a
live prod service-role key in it. Repointed to tailr-staging and the service
key replaced with a loud placeholder. Verified by effect, not by reading the
file: the running dev server's client bundle carries the staging ref and
**zero** production references. **Ose still needs to rotate the production
service-role key** — it sat in a local dev file, so treat it as exposed. There
is no MCP tool for rotation; it is a dashboard action.

**`String(error)` swept out** (f9d6bf0): 85 call sites across 51 files now use
`errorMessage()`. Supabase errors are plain objects, so the old idiom rendered
them as "[object Object]" — the exact failure that hid a stale schema cache
from a recruiter. `app/api/hiring/me/route.ts` is deliberately untouched (its
field-limited logger exists because Postgres messages can quote a row value,
which on this schema can be an email). A guardrail test now fails the build on
the banned fallback, and it earned its keep immediately by catching three
stragglers the sweep's regex missed.

**web-design-guidelines pass on the consumer surfaces** (52581e4), verified in
a real browser rather than by reading. The one that mattered: both `/found`
dialogs declared `role="dialog" aria-modal="true"` while the page behind them
stayed tabbable, Escape did nothing, focus never entered, and closing dropped
focus to the top of the document. One `useDialog` hook (`lib/use-dialog.ts`)
now carries focus trap, Escape, focus restore, scroll lock and overscroll
containment for both — except that the sent-panel deliberately does **not**
dismiss on scrim click, because its rights link is shown once.

Also fixed: every control in the tailor workspace has a real `<label>` (the JD
box's only accessible name was a placeholder, which role mode then hid);
focus rings replacing bare `focus:outline-none`; 16px inputs on mobile so iOS
stops zooming; 44px hit areas on the consent switch, Exit role mode and Fetch;
an `<h2>` lifted out of a card `<button>` where it folded into the button's
accessible name; long emails/agency names wrap; clipboard copy reports success
or failure instead of silently no-opping.

**Consent-record dates now render in UTC** via `lib/format-date.ts`. A consent
stamped at 23:40 UTC displayed a different day depending on where it was read
— from the same row, on the surface whose entire purpose is answering "when
did I agree, and to what?".

**Lesson (in the skill):** Turbopack served a stale `globals.css` through an
HMR reload, a `touch`, a server restart and `rm -rf .next/cache`. Only
`rm -rf .next` fixed it, and the chunk name and byte count were identical
throughout — verify CSS by curling the chunk, never by reading the file.

700 tests, build clean.

## 🌗 Light/dark on the agency surface — a mode, not a screen (17 Aug 2026)

Ose: the dashboard is too dark, and no cream dashboard either. We looked at
two re-themed variants in Figma (dim graphite at #2f2a26 and a stronger lift
at #3b352f, both on page 01 beside the original) plus a type pass moving 32
chrome labels off Geist Mono. He took neither — **"just implement a
light/dark mode"** — so the variants stay in Figma as a record and the mono
pass is dropped.

The mechanism was already half-built: the base `.ag-app` tokens ARE a light
theme, and the `:has(.agd-main)` block was a complete dark one. So this was a
scoping change, not a new palette. Dark is now driven by `data-ag-theme` on
`<html>` (next-themes, written pre-paint — no flash), with a light / system /
dark control fixed to the shell, defaulting to system.

**Scoped to `.ag-themed`, which /portal and /rights deliberately lack.** A
candidate opening a rights link has never touched the toggle and must not
inherit a recruiter's preference. Verified in the browser: with the attribute
set to dark, the doorway still resolves light tokens and the control does not
render there.

The control lives in the **layout**, not in the ten pages that each hand-roll
a sidebar — the same duplication that lost step 06 for four days.

**Widening dark from one screen to all of them exposed three latent bugs**,
every one invisible while the dashboard was the only dark surface:
`--ag-coral-text` and `--ag-warn-mark` had **no dark values at all** (both are
deliberately dark-on-light hues, so the dossier provenance ramp and the
round-delta lanes would have rendered muddy on the dark ground), and
`--ag-sage` **never existed**, so `var(--ag-sage, #5d6e50)` silently resolved
to its hardcoded fallback forever. Eight hardcoded hexes moved onto tokens.

Guardrail (`agency-theme-tokens.test.ts`) fails the build if a colour token
lacks a dark value, if an agency component hardcodes a hex, or if it names a
token the stylesheet does not define. `suppressHydrationWarning` added to
`<html>` per next-themes' documented requirement.

705 tests, build clean. **Not yet seen authenticated:** the workflow screens
in dark are token-correct and hardcode-free, but no signed-in human has looked
at them — that wants a pass through /agencies in dark.

## 🎙 Interview capture, part 1: the bucket and the way in (17 Aug 2026)

Built **behind the gate**, against synthetic audio. Nothing here may point at
a real candidate until the lawyer has read `CONSENT-COPY-DRAFT` §2/§3 and the
DPIA is done — the point is that the day the gate clears is a day something is
switched on, not started.

**Migration 21 — `agency-recordings`** (applied to tailr-staging): private,
audio only, 200MB, and with **no storage policies at all**. `storage.objects`
has RLS on, so `authenticated` can neither read, write nor list it. Every byte
moves through a service-role signed URL minted by a route that has already
checked membership, writer role and capture consent — the audit-coupling rule
applied to a blob: if the UI can reach it directly, the check can be skipped.

**Audio only, deliberately.** Conference tools export video, and video of a
candidate's face is a materially larger privacy footprint than their voice —
indefensible for a feature whose entire argument is verbatim quotes mapped to
requirements with no inference about the person. A recruiter with an mp4
extracts the audio; the friction is the point. *(Flagged for Ose: this is a
product decision, reversible by widening the bucket's mime list.)*

**Upload is two steps**, because tens of megabytes do not fit through a
serverless route body: `POST` mints a short-lived ticket and writes nothing,
the browser PUTs straight to storage, `PUT` confirms. The artifact row is
written **only after the blob is proven present** — a row pointing at nothing
would put a phantom in the deletion sweep's sights, and that sweep's silence
is a promise being kept.

**THE gate is `capture_consent_status = 'granted'`**, applied through one
shared function so mint and confirm cannot drift. A recruiter cannot grant it
on a candidate's behalf: `recordDecision` takes a raw token and nothing else.

**A latent bug this activated, now fixed:** `recordDebrief`'s update filtered
on `kind='debrief'`, so against a transcript artifact it matched no rows,
changed nothing, and still returned success. Unreachable until transcripts
could exist. A recorded round now refuses a debrief outright.

**Drilled on staging, rolled back:** unverified audio is invisible to the
sweep (0), verified audio is claimed by it (1), and
`artifact_recording_iff_transcript` holds. 721 tests, build clean.

**Next in this chain:** transcription (provider, async job, verify → the
existing sweep deletes the audio on its own), then per-round enrichment
(transcript → evidence, `origin='round'`, rescore) — the part that turns the
dossier from two layers into five. Still unbuilt, still gated. No UI for
upload yet either: the route exists, the control does not.

## 📝 Interview capture, part 2: transcription (17 Aug 2026)

Still behind the gate. **Migration 22** reuses `agency.ingestion_jobs` — the
queue already carrying jd_parse, cv_parse, score and match_scan — rather than
growing a second job system with its own retry semantics to get subtly wrong.
It gains `round_id`, because candidate_id + role_id cannot say *which*
interview when a candidate sits in several rounds. A partial unique index
allows one live transcribe job per round.

**NO REAL VENDOR IS WIRED IN, and that is the design.** Sending a candidate's
voice to a third party makes that party a **sub-processor** — a decision for
Ose and the lawyer, named in the DPA, not one this module gets to make. So
`TranscriptionProvider` is an interface with a synthetic implementation, and
an unrecognised `TRANSCRIPTION_PROVIDER` **throws** rather than falling back,
because the failure mode of guessing here is audio leaving the building
unannounced. The whole pipeline is built and drillable today; the day a vendor
is named it is one adapter.

**Diarization is not optional**, and it is a fairness property, not a feature:
only the CANDIDATE's words may become the candidate's evidence. Attributing an
interviewer's question ("so you led the migration?") to the candidate would be
a fairness bug wearing a data-modelling costume. Any vendor that cannot return
speaker-labelled segments is not a candidate vendor.

**Which speaker IS the candidate is a human's answer.** Diarization returns
numbers; picking one by longest-talker would be inference about a person by
the back door. So verification is not a rubber stamp — a recruiter confirms
the transcript reads correctly AND names the candidate's speaker, and that
single act stamps `verified_at`, which is exactly what releases the audio to
the deletion sweep. **"The recording is deleted once the transcript is
checked" and the act of checking it are deliberately the same event.**
Transcribing never stamps it, and a failed run leaves the audio alone —
deleting on failure would destroy the only copy of something the candidate
agreed to have transcribed once.

Drilled on staging, rolled back: a second live job per round is refused
(`unique_violation`); **0 sweepable after transcription, 1 after a human
verifies**. 738 tests, build clean.

**Left in this chain:** per-round enrichment (transcript → evidence rows,
`origin='round'`, rescore) — the part that turns the dossier from two layers
into five, and the one that has to honour `evidence_quote_iff_present` and the
withdrawal cascade. Plus: still no UI anywhere for upload, transcribe or
verify — three routes, no controls. And a vendor still has to be chosen.

## 🎛 Interview capture, part 3: the panel (17 Aug 2026)

Built to Figma **"Recruiter · Interview capture — the five states"** (page 02,
signed off). One panel per round on `/agencies/roles/[roleId]/interviews`,
except cancelled rounds. `GET .../capture` resolves which state a round is in
**server-side**, so one place decides "is this transcribed yet" instead of
every renderer inferring it from nullable columns — and it returns neither the
recording path nor the transcript text, because the path is not the UI's
business and the transcript is read through the dossier as quotes mapped to
requirements, never as a raw tape.

Two decisions from the frame, both kept:

1. **Without consent there is no upload control — absent, not disabled.** A
   greyed-out button beside "they have not agreed" invites the recruiter to
   wonder how to enable it; absence says the question is not theirs. A
   deliberate departure from the Fill-from-transcript precedent, which is
   about features *we* have not built rather than a decision someone else
   has made.
2. **Naming the speaker IS the verification, and verification is what deletes
   the audio.** One click, and the copy says so before it happens.

**Transcription now runs on the response** via `after()`, with cron as the
backstop — the same shape publish uses for match scans. The job row is written
before the response returns, and `runTranscription` only acts on a job still
`queued`, so the two runners cannot transcribe the same audio twice. Without
this the walk was unwalkable: a queued job would sit until 03:30.

**Test lesson, third time paid:** source-scan assertions must strip comments.
"never a path or a byte of content" contains the word `path`; the scan found
its own documentation and failed. Same trap hit the "no tone/sentiment" and
"verified_at" assertions. `codeOnly()` now strips comments before scanning.

738 tests, build clean.

### ⚠ The walk is blocked, and deliberately not shortcut

All three rounds on ROL-2401 are `completed`, hold a **debrief** artifact, and
sit at `capture_consent_status = 'pending'` — so every one renders state 01 and
cannot progress (a debriefed round cannot take audio: one artifact per round,
and a debrief means "this was not recorded"). There are also **no free
availability slots** left on that role.

So capture needs a **fresh round**, and consent must come from the candidate's
own click on `/consent/{token}`. Granting it by SQL would fake the single thing
this feature exists to protect, so it has not been done. The path is: offer
availability as the HM → book a round as the recruiter → "Ask about recording"
→ open the returned consent link and grant → the panel goes live. That is also
the recruiter-loop walk-through outstanding since 14 Aug.

## 📥 Intake simplified: the brief carries the JD (20 Aug 2026)

Ose's call, after two rounds of confirm-loop design: **too complex**. The
client-confirmation flow (HM re-weighting screen + recruiter four-state card,
designed 17 Aug) is **parked, not built** — both frames renamed PARKED in
Figma as a record. What shipped instead (3620985) is one hop:

**The hiring manager pastes the JD with the brief → accepting mints the role
with that JD already in intake → the recruiter parses.** Nobody retypes a
document that already exists.

- Migration 23: `role_briefs.jd_raw` (applied to tailr-staging).
- Brief form gains an optional JD box; hint says the fields below add what
  the JD leaves out. `composeJdRaw` leads with the pasted document,
  unlabelled — it IS the document — with the structured fields following as
  parser context.
- Inbox rows say "JD attached — accepting carries it into intake" (presence
  only; the text rides into the role, never the list).
- Intake shows provenance when the JD came from the brief, and a "Use the JD
  from the client's brief" button when the box has drifted — the way back to
  the client's exact text. RLS verified live (role_briefs SELECT + membership
  policy), not assumed.

**Fixed in passing:** `saveIntake` destructured stale state — a save fired in
the same tick as a `patchRole` stored one JD while showing another. The fix
grew the signature, and TypeScript then caught seven blur handlers that would
have fed FocusEvents in as overrides.

741 tests, build clean.

## 🧾 The brief states the process; the recruiter records the facts (20 Aug 2026)

Second half of the intake refinement (9ae8433, migration 24 applied):

**The brief now carries the client's process** — expected interview rounds
(1–6, toggleable pick) and "when do you want someone in seat", in their words.
Accept copies both onto the role, and the interviews screen shows them where
booking happens, framed as *their plan, not a gate*: round numbers stay
derived from real rounds, nothing enforces the plan, the recruiter owns the
process (§5.5). Role requirements were already on the brief (must-haves /
nice-to-haves) and ride the parse via composeJdRaw.

**Right-to-work capture** — `agency.candidate_compliance`, its own table
rather than columns on candidates, because candidates carries a table-level
authenticated UPDATE grant and "I verified this person's right to work" must
not be writable without its audit row. Zero authenticated write grants
(verified by query); the service-role route writes row + audit in one
operation. The card sits on candidate detail with the AUDIT LOGGED pill.

Three lines held, each pinned by a test:
- **Statuses are facts** — unverified / verified / needs_sponsorship, and
  deliberately no `not_eligible`: that is a conclusion about a person. A
  guardrail scans every agency source for `rtw_status` ever filtering a list.
- **A checked status requires a note saying how** (share code + date) — the
  note is the assertion, the status its summary. The audit row records
  `has_note`, never the note's content.
- **No document storage.** Identity documents are their own compliance
  surface with their own retention rules.

Test lesson, now four times paid: **source scans must strip comments** —
the migration documenting "deliberately no not_eligible" failed its own scan.
748 tests, build clean.

## 💷 Placements — the event the business is paid for (20 Aug 2026)

Built (785036c, migration 25 applied). The loop ended at decision →
references → handover with **no record of who got the job**, so fill rate,
time-to-fill, fee value and rebate exposure were all uncomputable from the
product's own data.

`agency.placements`, one row per (role, candidate) — a role may fill several
seats, a candidate is placed on it once, and the unique index is the whole
mechanism against a double-recorded fee. Fee lives on the placement rather
than the client, because it is agreed per placement even where terms are
standing.

- **Fall-off is first class** and refuses to save without a reason. The most
  expensive thing that happens to an agency should teach it something.
- **The rebate window is derived**, never stored — `start_date +
  rebate_weeks` — so a corrected start date cannot strand a stale window.
  Tested on values: 1 Sep + 12 weeks = 24 Nov, open before, closed after.
- **Timestamps stamp once on arrival.** Re-saving an accepted placement does
  not move the day it was accepted.
- **Status is an outcome, never a judgement.** A scan proves no source
  filters or ranks on `declined` — the same rule as `rtw_status` and client
  declines.
- **Recording a placement never closes the role.** Closing starts the
  retention clock and stays deliberate; a role can also place more than one
  person, so auto-closing would be wrong as often as right.

Audit-coupled like `candidate_compliance`: no authenticated write grants
(verified by query), service-role route, audit row in the same operation.
Money and dates ARE in the audit trail deliberately — a fee is the agency's
own commercial fact, unlike a compliance note which is the candidate's.

**Left open beside it:** terms of business still have no home, because there
is no clients table — only `client_contacts`, a person with a company string.
Fee defaults there would model a company on a person row. Needs a decision.

759 tests, build clean.

## 🔌 The interview tidy, client and candidate side (22 Aug 2026)

The recruiter half landed in 655ad76. This is the other two.

**The hiring manager's write-up gate did not survive a reload.** `RoundActions`
held `written` in component state and `HiringRound` carried no artifact field,
so a client who saved their write-up and came back later got an empty box —
and no route to their decision without writing a second one. The gate that
enforces "no artifact, no progression" only worked while the tab stayed open.

The fix adds `has_debrief` to the payload, and the interesting part is how
narrow it had to be. `round_artifacts.kind` is `('transcript','debrief')`, and
a transcript exists **only where the candidate consented to a recording** — so
a general `has_artifact` flag would have told the client what the candidate
chose, which is precisely what the consent copy promises never happens. It is
pinned to `kind = 'debrief'`, and a new guardrail scans `getHiringDashboard`
for that `eq()`. The scan was **mutation-tested**: remove the filter and it
fails. The cost is that a recorded round with no debrief still asks the client
to write one up — the right price.

Also on `/hiring`: decisions were rendering as raw machine values ("advance")
in the client's own pill; a decided round collapsed to that pill and the record
it rested on vanished; rounds rendered flat, giving a decision that is holding
up five people the same weight as finished history; and **"Offer times" posted
silently to `links[0]`**, so a person with two recruiters offered their diary to
whichever sorted first. Ranked now, named now, and it asks when there is a real
choice.

**The consent email's buttons did nothing.** The ask sends `?a=yes` / `?a=no`
and the page never read the parameter — while its own header comment claimed it
did. Same class of defect as the amber note 655ad76 just corrected: code
documenting behaviour it does not have. A candidate who pressed "Record it" in
their inbox landed on an untouched screen with no sign the click registered.

It is now acknowledged in words — *"You pressed record it. Nothing has been
saved yet."* — and the choice is scrolled into view. It sets an `intent`, never
the radio: a link in an email is followed by prefetchers, corporate scanners and
spam filters, so `?a=yes` reaching the consent record would let a link scanner
consent to recording someone's interview. `lib/agency/consent-intent.ts` keeps
`Intent` and the decision vocabulary in separate types.

**A guardrail that could not fail, caught.** The first version of that test
asserted no `setChoice` call mentioned "intent" or "search". A deliberate
mutation walked through it by naming the variable `i`. Rewritten structurally —
`setChoice` exists exactly twice, takes a string **literal**, and each call is
the whole body of a radio's `onChange` — and re-mutated twice to prove it fails.
**A guard that only catches the careless version of a mistake is decoration.**

**What was deliberately NOT done.** The plan called for moving the choice above
the explanation, on the grounds that the decision sits below five paragraphs.
`CONSENT-COPY-DRAFT.md` §3 fixes that order ("the four short paragraphs above,
verbatim"), §2/§3 are awaiting legal review, and reading before choosing is what
makes the consent informed. Dropped, and the reason is now in the file so the
next person does not re-tidy it.

Focus moves to the heading when an answer saves — across a full tree swap a live
region is announced only as reliably as the browser feels like.

768 tests, build clean. **Not browser-verified in its signed-in states**: the
local service-role key is a placeholder, so `/hiring` and a live `/consent`
token cannot be reached from this machine. Pages render, CSS confirmed in the
served chunk by curl rather than by reading the file.

---

---

---

---

---

---

---

## 🖊 Right-to-represent framed + the non-compete drafted (22 Aug 2026)

The last two 20 Aug gaps, both sign-off-gated deliverables rather than code.

**Right-to-represent** — frame drawn, no code, per the rule:
[`Candidate · Right to represent`](https://www.figma.com/design/AWRRbEOX6rLsltutFDL3zs/Tailr-%E2%80%94-Hiring-Manager-Concept?node-id=209-2)
on page `05 · Candidate doorways`. A candidate who APPLIED consented
explicitly (the manifest is the record); an UPLOADED candidate never agreed to
anything — the agency notices them (Art 14) and represents them anyway. When
two agencies claim one placement, the one holding the candidate's dated
agreement wins the contingent fee.

The shape it proposes, for argument at sign-off: the ask lives on the RIGHTS
doorway the notice email already links to (no new token, no new email);
agreement is per role, never blanket; **unanswered is not yes** — an
unanswered candidate is visible on the submission screen as not-yet-agreed,
and including them in a client submission carries a loud, audited,
per-submission override rather than a block. Decline is a dated fact, not a
deletion; a yes is withdrawable from the same page, and withdrawal stops
future submissions without unsending past ones. Never filters or ranks on
the answer.

**Non-compete commitment** — `docs/NON-COMPETE-DRAFT.md`, drafted under one
rule: every sentence checkable against the codebase today. Six claims, each
naming its mechanism (schema separation, candidate-side matching, the apply
transaction, host-only cookies) — and claim 5 states the unflattering truth
plainly: one database, schema-separated, and physically separate storage is a
thing to price rather than promise. NOT PUBLISHED; it is a public promise, so
it waits for Ose and ideally the same lawyer session as the consent copy.

**That closes the 20 Aug gap list.** Notifications ✅ · candidate booking ✅ ·
right-to-represent (framed, awaiting sign-off) · closing the loop ✅ · role
ownership ✅ · non-compete (drafted, awaiting sign-off).


---

## 🕊 Closing the loop: a closed role tells its candidates (22 Aug 2026)

The 20 Aug gap named as ghosting: "nothing tells the other four people a role
was filled — which a product arguing for candidate dignity should not
facilitate." Now closing a role emails the candidates who were in the process,
and the close response tells the recruiter how many were told.

**WHO is the decision that carries it: only people the loop was OPENED with.**
Their considered-notice was sent, or they were interviewed. A candidate whose
notice was suppressed has never heard from Tailr about this role, and a
closure email would be the FIRST contact — worse than none. The placed
candidate is excluded (their news arrived differently), as is anyone holding a
live offer; a declined or fallen-through placement puts the person back in the
set, because the role ended for them too.

**WHAT it says:** the role ended, no reasons, no winner, no
encouragement-shaped padding — and the one genuinely useful thing: their
deletion date. The considered-notice promised "if nothing comes of this role,
your data is deleted after N days"; this email is that promise being kept out
loud, with the rights link when a token exists.

**Mechanics.** Migration 33: one column, `candidates.closure_notified_at` —
not a table, because candidate_notices is the Art 14 machinery with its own
cron, and closure fires once at close. The stamp is the idempotency: close,
reopen, close again emails nobody twice, and a FAILED send is deliberately
not stamped so a re-close retries it. Suppression is re-checked at send time
(an objection recorded after the interview wins). Every skip is audited.
Hooked into the status→closed transition in the role PATCH, awaited so the
UI can report the count, guarded so a mail failure cannot make the close
look failed.

**Template needs sign-off** — added to the templates artifact with an amber
badge, alongside booking_answered which also postdates the original sign-off.

860 tests. Mutations caught: eligibility dropped (everyone emailed), failure
stamped anyway (burying the retry), live placements not excluded.


---

## 👤 Roles get an owner (22 Aug 2026)

The 20 Aug gap: "members exist, roles have no owner, and real desks are
commission-driven." Migration 32 adds `job_roles.owner_id`, backfilled from
`created_by` — the guess the product was already making, now explicit.
Verified on staging: 11 of 13 roles backfilled, the 2 with null `created_by`
correctly left to the owners fallback.

**Reassignment is audit-coupled** (`owner_changed`, with the before value):
moving a role between desks is a commission event someone will ask about
later. The new owner must be an active, non-viewer member — a viewer-owned
role is a desk nobody can work. `setRoleOwner` lives in its own module
(`role-owner.ts`), because a function inside db.ts calls the module's own
`agencyAdmin` binding and no test mock can reach it — the same reason consent
and briefs are their own files.

**Notifications now resolve to the owner first**, `created_by` dropping to the
fallback it always was. The role screen's Active-role block gains an OWNER
select (viewers see the name); Figma `AMENDMENT 22 Aug · Role owner` (208:2).

Two things the tests caught: reading the before-value off the row object
AFTER the update (a use-after-update the detached Supabase client happens to
mask), and a fixture that forgot the agency owner is also a member. One noted
follow-up: authenticated holds table-wide UPDATE on job_roles by design, so a
crafted client could write owner_id unaudited — narrowing that means dropping
the table-wide grant for an explicit column list (migration 15's lesson), not
a column-level REVOKE, which is a silent no-op.

851 tests. Mutations caught: membership check dropped, audit dropped.


---

## 📎 The brief takes a JD file — and a silent truncation bug it uncovered (22 Aug 2026)

Asked for by Ose: the hiring manager should be able to upload the job
description, not only paste it.

**It was an asymmetry, not a missing feature.** A recruiter has had three ways
to supply a JD since intake was built — paste, upload a file, or hand over a
link (`parse/route.ts`: "upload beats link beats stored paste"). The hiring
manager, who is the person actually holding the document, could only paste.
Most JDs live as a .docx in somebody's drive, so the one person with the file
was the one asked to retype it.

**The bug found on the way in, which is the more valuable half.** The server
caps `jd_raw` at 30,000 characters and says why in a comment — "a full job
description, not a form field". The FORM kept its own copy of the constants and
applied its 4,000 general field cap to every box except the title. So a pasted
JD was cut at 4,000 characters **in the browser**, before the server ever saw
it, with no warning and no visible boundary. Typical JDs run three to eight
thousand characters, so this was quietly losing the end of real briefs —
usually the requirements at the bottom, which is precisely what the recruiter
then parses.

**A test already guarded this and did not catch it**, because it asserted the
server constant only. That is the shape of the whole thing: the cap was correct
everywhere it was tested and wrong where it was not.

Both sides now import `lib/agency/brief-limits.ts` (no server imports, same
reason `settings-limits.ts` exists), and `brief-limits.test.ts` fails if either
end redeclares a cap or stops special-casing the JD.

**The upload itself.** `POST /api/hiring/briefs/extract` takes a PDF, DOCX or
TXT up to 10 MB, extracts the text with the extractor the recruiter side
already uses, and returns it. **The file is never stored** — read in memory,
converted, dropped — so there is no bucket, no retention question and nothing
extra to delete when the role closes. Only the text is kept, in the same
`jd_raw` column a paste already fills, so there is no schema change and no new
path through the product.

The extracted text **fills the textarea rather than submitting**, so what gets
sent is always something the hiring manager has seen and can correct. A scanned
PDF with no text layer says so specifically rather than "could not read the
file". The control is a real `<input type="file">` with its label styled as the
button, and `:focus-within` puts a visible ring on that label — without it a
keyboard user tabs onto a control they cannot see.

**Figma:** [`AMENDMENT 22 Aug · JD upload`](https://www.figma.com/design/AWRRbEOX6rLsltutFDL3zs/Tailr-%E2%80%94-Hiring-Manager-Concept?node-id=204-2)
on page `01 · Hiring manager`, following the format of the 20 Aug JD field
amendment rather than redrawing the brief screen.

823 tests. Not browser-verified in its signed-in state: `/hiring/briefs/new`
serves 200 and the extract route refuses unauthenticated callers with 401 (not
500), and the new CSS is in the served bundle, but the upload has not been
exercised through a real session.


---

## 📅 Candidate-side booking — frame drawn, awaiting sign-off (22 Aug 2026)

Next in the 20 Aug gap list after notifications. Today `scheduleRound()` writes
the round and its audit row and **tells the candidate nothing** — no `.ics`
exists anywhere in the codebase, and `sendEmail` has no attachment support. The
recruiter books a time off the client's diary and the candidate finds out by
phone, text, or not at all. Tailr holds the round and tells the one person
whose day it is least.

**Frame:** [`Candidate · Interview invitation — the booking doorway`](https://www.figma.com/design/AWRRbEOX6rLsltutFDL3zs/Tailr-%E2%80%94-Hiring-Manager-Concept?node-id=201-3)
on a **new page, `05 · Candidate doorways`** — because Tailr has four live
candidate- and referee-facing doorways (consent, rights, reference, portal) and
until now **not one of them had a frame**. They were built from the copy
outward, which is why they read well and look like nothing in particular.

**The design decision that shaped it.** The recruiter keeps picking the time.
The existing `Recruiter · Book an interview` frame promises that booking takes
the slot off the client's board and cancelling gives it back — so offering the
candidate a menu would mean holding three of the client's windows hostage while
somebody thinks about it. The candidate therefore gets **confirm or decline a
booked time**, and declining returns the slot, which is the mirror of the
promise already made to the client.

**Two departures worth arguing about at sign-off:**

- **It names the client company.** The data-protection notice deliberately does
  not (`noticeHtml` says so in its own comment). You cannot ask somebody to give
  up a morning without telling them who they are meeting, so this is a
  considered exception rather than an oversight — but it IS an exception.
- **The joining link is withheld until confirmation.** A live meeting URL
  sitting in an unconfirmed inbox is a call somebody can walk into unannounced.

**And one thing it refuses:** declining asks for no reason and offers no
free-text box. A candidate explaining a hospital appointment to their
recruiter's software is a worse product than one that simply asks when suits.

**Approved and built (22 Aug).** Migrations 30 and 31, both applied to
`tailr-staging`.

**Migration 30** adds `booking_token_hash` (SHA-256, never in the clear, beside
`consent_token_hash`), plus `candidate_response` and `candidate_responded_at`.
`candidate_response` is deliberately its OWN column rather than a `status`
value, so the trail can tell "they said no to Thursday" from "we called it
off" — and so nothing can read a decline as leaving the role. Verified by
effect: columns present, default `pending` (nobody agreed by omission), the
list closed, `withdrawn` refused, token index present.

**Declining releases the slot in the same write that cancels the round.**
`slot_id` is cleared because the index preventing double-booking is
`(slot_id) WHERE slot_id IS NOT NULL` and is status-agnostic — a cancelled
round keeping its `slot_id` holds that client window forever, which
`setRoundStatus()` documents because it has already happened once. The token is
spent at the same time so a declined link cannot be replayed.

**`lib/ics.ts`** is hand-rolled, and the tests are about the parts that break
clients rather than the happy path: CRLF everywhere (Outlook silently ignores
bare newlines rather than complaining), folding at 75 **octets** without
splitting a multi-byte character, TEXT escaping, and `METHOD:PUBLISH` rather
than `REQUEST` — an email client's Decline button cannot give the client's slot
back, and a candidate whose "no" went nowhere is worse than no button.
`sendEmail` gained attachment support for it.

**The recruiter is told** via a new `booking_answered` notification, because
otherwise this rebuilds the exact polling problem notifications were added to
fix two hours earlier. Adding that kind was a controlled operation, as designed:
TypeScript refused the union, the classification test refused an unclassified
kind, and the constraint test refused the missing migration. Migration 31
rebuilds the `event_kind` list from the complete deployed set.

**One flaw found in my own test while doing it.** The constraint test named
migration 29's file directly, so it would have kept asserting against a stale
list the moment the constraint moved — exactly the trap
`audit-entity-types.test.ts` was written to close. It now finds the NEWEST
migration defining the list.

Three behaviours mutation-tested: keeping the slot on decline, exposing the
joining link before confirmation, and dropping the recruiter notification each
redden a test.

844 tests. **Not verified through a real session** — `/booking/<token>` serves
200 and the API returns the generic 404 for an unknown token, but no invitation
has been sent or answered end to end.


---

## 🌐 The agencies host, documented and configured (22 Aug 2026)

**Decision: stay on a subdomain — `agencies.gettailr.com`** — which is what
`lib/site-url.ts` already defaulted to.

**The code was already done.** `proxy.ts` routes all three hosts,
`site-url.ts` has `getBusinessOrigin()` / `doorFromHost()` / the path-prefix
lists, business paths are subtracted from app paths so `/api/agency` cannot be
claimed by the `/api` rule, and `lib/__tests__/proxy-routing.test.ts` already
covered the business host in both directions AND asserted the rules are inert
while the split is off. Nothing in this change touched routing.

**Two gaps, both outside the code:**

1. `NEXT_PUBLIC_BUSINESS_URL` was missing from `.env.example` while the other
   two origins were there — so the one variable a cutover needs was the one
   nobody would find.
2. `docs/DOMAINS.md` documented only www + app. The agencies host appeared
   nowhere in it, **including in the Supabase auth section** — and its
   redirect URLs are not optional. `/auth` is host-neutral so a recruiter
   signing in at `agencies.gettailr.com` completes there; if that host is
   missing from Supabase's allow-list, B2B sign-in breaks while the consumer
   side looks perfectly fine. That is the kind of failure that gets diagnosed
   as "the agency product is broken" rather than "a URL is missing from a
   list".

Both fixed. DOMAINS.md now carries the agencies DNS step, the full redirect
map, the Supabase entries, and six added smoke-test lines including "one
sign-in works across app and agencies without a second magic link".

**Also recorded: `DOMAIN_SPLIT_ENABLED` is ONE flag for all three hosts.**
There is no way to stage the agencies host separately — flipping it cuts
marketing, app and agencies over together, so all three DNS records must be
valid first.

**Why a subdomain still separates the two sides properly:** the shared
`.gettailr.com` cookie means one sign-in covers both, but separation happens at
the product level, not the cookie level — `doorFromHost()` reads the Host
header, never a query parameter (which would be a claim the visitor makes about
themselves), and it grants nothing. Every hat is re-checked against the
database.

**And what a separate domain would cost, written down before it is needed.**
Moving B2B to its own brand answers the "your vendor also runs a candidate
platform" objection in a way a subdomain cannot, and is a config change in this
repo — but two things outside it break: a session cookie cannot span two
registrable domains, and the Magic Link template hardcodes `{{ .SiteURL }}`, a
single value per Supabase project, so a recruiter signing in on the B2B domain
would get a link pointing at the consumer domain. Neither blocks the subdomain
plan; both block that one.

**Nothing is live.** This is documentation and one env-example line. DNS,
Vercel domains, the Supabase allow-list and `DOMAIN_SPLIT_ENABLED` are all
Ose's to do, in that order.


---

## 📬 Notifications: the silent return leg of every doorway (22 Aug 2026)

**Status: on staging, migration 28 applied and verified there. Templates
signed off by Ose 22 Aug — notifications are cleared to send.** Branch
`staging`. Named as the top gap on 20 Aug: "every cross-wall
event requires the other side to poll the app — briefs sat invisible for days,
which is an adoption risk more than a bug."

**The shape of it, which was not what I assumed.** Briefs flow hiring manager →
recruiter, not the other way, so "briefs sat invisible" means the RECRUITER
never knew one arrived. Reading the routes turned a vague gap into a precise
one: Tailr already mails four ASKS (consent, reference request, client invite,
team invite) and mailed none of the ANSWERS. Every doorway had a mailed ask and
a silent return. That is the whole diagnosis, and the fix is one file.

`lib/agency/notify.ts` — seven events across six kinds:

| Event | Faces | Was |
|---|---|---|
| `brief_filed` | recruiter | silent (the named pain) |
| `brief_answered` accept/decline | hiring manager | silent |
| `invite_accepted` | recruiter | silent |
| `debrief_recorded` | recruiter | silent |
| `consent_answered` | recruiter | silent |
| `reference_submitted` | recruiter | silent |

**Three rules, each one a test.**

1. **A notification carries a pointer, never the payload.** No candidate names,
   no brief bodies, no write-up text, no consent answers — only the refs and
   titles the audit log already uses. Email is an insecure, un-revocable
   channel that gets forwarded to people who were never on the thread, and
   getting the reader into the app is the point of sending at all. This is the
   audit log's own rule (counts, not content) applied to the outbox.
2. **`facesClient()` is a whitelist of one.** Only `brief_answered` reaches a
   hiring manager. Everything else defaults to the agency side, so a new event
   cannot leak to the panel unless somebody edits that function deliberately.
   The consent promise depends on it: the people interviewing someone are never
   told what that person chose. `agency-notify.test.ts` parses the union out of
   the source and fails until every new kind is classified — the same mechanism
   as `audit-entity-types.test.ts`, for the same reason.
3. **The actor is never told about their own action**, and nothing throws: a
   failed notification must never fail the write it followed.

**Where the calls live.** Beside `writeAudit` inside `lib/agency/*`, never in
the route handlers — routes here are thin and the same lib function serves both
the recruiter and the hiring manager, so hooking the lib layer is what stops a
future caller silently skipping a notification.

**Recipients, given roles still have no owner.** Provenance is the proxy:
`job_roles.created_by`, or `client_contacts.created_by` for contact events.
Both are nullable by design (set null on account deletion), so it falls back to
the agency's owners — an unheard event is the bug this file exists to fix.
Viewers are never mailed; they cannot act on it.

**Migration 28** (`20260822110000_notification_audit.sql`) adds `notification`
to `audit_log`'s entity_type check. Copied from the DEPLOYED constraint read
out of staging, not from migration 1's list — which is exactly the slip
migration 10 made and `audit-entity-types.test.ts` now guards.

**Applied to `tailr-staging` 22 Aug, and verified by effect rather than by a
success code.** A rolled-back probe inserted as each case: a `notification` row
is accepted; a bogus entity_type is still REFUSED (which is what distinguishes
a widened constraint from a dropped one — both would accept the first row); and
`member` still validates, so the rebuild did not repeat migration 10's silent
drop. Zero probe rows left behind, confirmed by count.

**There is no "port to production" for B2B** (clarified by Ose, 22 Aug). Tailr
for Agencies is not going into the consumer production deployment at all — it
gets its own production domain when it is ready. So **staging is the home for
this product for now**, and every agency migration lands there and only there.
Earlier entries in this file that say "run it in both environments" or "prod
needs it at the port" were written on the wrong assumption; the rule for
agency-schema migrations is: staging now, the B2B production environment when
one exists.

**Two things the tests caught that are worth keeping.** The full suite went red
in eight places on files I had not touched logically — every one an audit-count
assertion shifting because notifications now file their own row. Rather than
loosening them, the trail assertions were scoped to a new `mutations()`
accessor while the PII scans deliberately kept covering ALL rows, so
`expect(log).not.toContain("@")` now proves the notification rows carry no
address either. And the first version of `agency-notify.test.ts` passed while
being wrong: the mocked `profiles` client ignored its own `.in(ids)` filter and
returned every member for any query, so "only the role's creator is mailed"
would have passed no matter what the code did. That is the third time on this
project a mock has agreed with wrong code.

**Not built, deliberately:** no in-app notification centre and no preferences
UI — both are new surfaces and would need a Figma frame first. There is
therefore no off switch yet, which is the obvious follow-up.

**Templates signed off 22 Aug.** All seven rendered for review before any
send; approved as written.

**The off switch — frame drawn 22 Aug, awaiting sign-off.**
[`Recruiter · Notification preferences`](https://www.figma.com/design/AWRRbEOX6rLsltutFDL3zs/Tailr-%E2%80%94-Hiring-Manager-Concept?node-id=194-2)
on page `02 · Recruiter`. Built to the existing screen shell (`Recruiter ·
Agency settings`, 94:2) and the existing toggle-row pattern from the consumer
settings frame (110:3), so it reuses rather than invents.

The design decision it encodes, and the reason it is NOT a row on the agency
settings screen: **notification preferences are personal, not agency-level.**
`Recruiter · Agency settings` is owners-only and is about candidate rights —
its own title is "How long you keep people, and when you tell them". Putting
notifications there would let an owner silence a colleague's inbox, and the
person who needs to know a brief arrived is the person holding that client.
Five switches, all defaulting to On, because an unheard event is the problem
this feature exists to solve.

Two things the frame deliberately refuses. The email telling a hiring manager
their brief was accepted or declined is not on the list — it is a message to a
client, not a notification to a recruiter, and not theirs to switch off. And
switching one off silences an inbox only: the event still happens, still writes
its audit row, and still reaches colleagues. Turning one off is itself audit
logged, because "nobody told me" and "I turned that off in March" are different
conversations and only one is answerable.

**Ose chose agency default + personal override (22 Aug), so both frames were
updated and the backend is built.** The personal frame gained a third switch
state — a dashed toggle labelled "Agency", meaning "following the default,
nobody has overridden it", because inheriting is a real state and not the same
as being off. `Recruiter · Agency settings` (94:2) gained a **Notification
defaults** card, and its title copy was corrected: it said "Two numbers with
real consequences" while showing three cards.

**Migration 29** (`20260822140000_notification_prefs.sql`) — ONE table, not
two. `user_id IS NULL` is the agency default; a row with a user_id is that
person's own choice. Two tables would have duplicated the event_kind check and
the audit shape for nothing. The cost is that NULL carries meaning, so two
PARTIAL unique indexes make it an enforced invariant instead of a convention:
exactly one default per (agency, event), exactly one override per (agency,
person, event).

Resolution lives in exactly one place, `resolvePreference()` in notify.ts:
your row, else the agency's, else ON. **Absent means on** — an unheard event is
the problem the feature exists to solve, so silence is chosen, never inherited
by omission. Defaults are deliberately not seeded, so a new event kind cannot
default to whatever a seeder last wrote.

`brief_answered` is **absent from the check constraint**, not merely unused. It
is a message to somebody's client about their own brief, so a recruiter must
not be able to mute it, and the database refuses to store it as a preference.
A test asserts the constraint and `facesClient()` agree, in both directions.

**Applied to `tailr-staging` and verified by effect**, seven checks: service_role
can write (the exact check missing from `candidate_compliance` and `placements`
this morning); a second agency default is refused; a personal override
coexists with the default; a second override for the same person is refused;
`brief_answered` is refused by the check constraint; `authenticated` holds no
write grants at all; service_role holds all four. Probe rows deleted, table
verified empty.

**The three preference rules were mutation-tested**, because passing tests mean
nothing until they can fail: ignoring the personal override reddened 4 tests,
flipping absent-means-on reddened 5, and letting client-facing events consult
the table reddened 1.

**The screens are built (22 Aug).** `/agencies/notifications` (personal, to
frame 194:2) and a **Notification defaults** card on `/agencies/settings` (to
94:2), behind one route — `GET/PATCH /api/agency/notifications` — so the two
screens cannot resolve preferences differently from each other or from the
mailer.

`lib/agency/notification-kinds.ts` holds the five kinds and their copy with NO
server imports. This is not tidiness: `notify.ts` imports `sendEmail` and
`createAdminClient`, so a client component taking a runtime value from it drags
the service-role key into the browser bundle and fails the build. It is the
same reason `settings-limits.ts` exists, and the settings page already carries
a comment saying so.

**The switch is a real `role="switch"` button**, built to the same standard as
the consumer `ns-switch`: `aria-checked` carries the EFFECTIVE value (what will
actually happen), the 26px track gets a 44px hit area, animation is
transform-only, and reduced-motion is honoured. The inherited state is dashed
with an "Agency" label, and `aria-label` spells out "following the agency
default, currently on/off" — the visual says whose decision it is, the label
says it out loud.

**"Follow the agency again" is a DELETE, not a write.** Storing the resolved
value would look identical on screen and be a different feature: the owner
later changes the default and this person, who explicitly asked to follow the
agency, silently would not. That is the single easiest bug to ship here, and it
is mutation-tested along with the owners-only check and the rule that setting a
default never touches anybody's own row — all three reddened a test when
broken.

**Not browser-verified.** The dev server runs and loads its env correctly
(`Environments: .env.development.local, .env.local` — which also confirms the
build diagnosis above), but a stale `accounts.google.com` popup in the browser
pane blocks all navigation, and an agent may not close a page-opened popup.
Typecheck and 815 tests are green; the rendered page has not been looked at.

**Build:** compiles clean. `npm run build` does fail locally at prerendering
`/auth/confirm`, but that is pre-existing and environmental, not this change —
proven by building the parent commit `b362904` in the same tree and getting the
identical failure. Cause: the Supabase keys live in `.env.development.local`
(a symlink to `~/.config/tailr/tailr.env`), and **`next build` runs in
production mode, where Next deliberately does not load
`.env.development.local`** — the build's own banner says `Environments:
.env.local`, and `.env.local` holds only `VERCEL_OIDC_TOKEN`. Vercel is
unaffected because it injects real env vars. To build locally, those keys need
to be in `.env.local` (or `.env.production.local`).


---

## 🛂 Right to work is two questions — and two tables nobody could write (22 Aug 2026)

Prompted by *Tailr-Right-to-Work-UX-Proposals.docx*. Most of that brief's
safeguards were already held (RTW renders on one screen, a guardrail fails the
build if it ever filters a list, `not_eligible` cannot exist, no documents are
stored), and its candidate journey presumes an application flow this product
does not have. Two things in it were worth taking, and looking for them turned
up something worse.

### 🚨 The service role could not write two tables (migration 26)

`agency.candidate_compliance` (24) and `agency.placements` (25) are
audit-coupled: no authenticated write grants, on purpose. **They had no
service-role grants either** — so `setCandidateCompliance` and `setPlacement`
failed `42501 permission denied` on deployed staging. Both features have been
shipped and non-functional since the day they landed. Of the **32 tables in
the agency schema, these two were the only ones** the service role could not
touch.

`20260805120000_agency_core.sql:425` says `grant all on all tables in schema
agency to service_role`. That reads like a rule for the schema. It is a
**point-in-time snapshot**, and `pg_default_acl` holds nothing for this schema,
so a table created later inherits nothing. Nine later migrations re-granted
explicitly. Two forgot.

**Why every test was green.** `agency-compliance.test.ts` asserted the table
grants `authenticated` SELECT and no authenticated writes. True, passing, and
*half the invariant* — nothing asserted that the role which does write it can.
The unit tests mock Supabase, so they agree with the code rather than with
Postgres. "RLS policies are meaningless without GRANTS" was already in
CLAUDE.md; this is the same mistake from the other direction.

A new guardrail walks every migration, finds every `create table ... agency.X`
postdating the blanket grant, and fails if it never got its own. Mutation-tested
by adding a fresh ungranted table — it fails.

### The model: two axes, not one (migration 27)

`rtw_status in ('unverified','verified','needs_sponsorship')` forced two
independent facts into one column, making them mutually exclusive. Someone on
time-limited permission who **needs sponsorship to continue** and **whose
current permission you checked this morning** could not be recorded truthfully.

    rtw_evidence     not_checked | seen
    rtw_expires_on   date, null = none recorded
    rtw_sponsorship  not_asked | not_required | required | unsure

**`verified` had to go, and that is the point, not cosmetics.** For permanent
placement the agency is not the employer: the statutory excuse and the civil
penalty belong to the client, and nothing recorded here confers it. The old
label invited a recruiter to tell a client the check was done. `EMPLOYER_CHECK_
NOTICE` now renders in the card — a test fails if it is moved into a `title=`.

`rtw_expires_on` exists because the note could not be asked questions. A DB
constraint refuses an expiry without evidence behind it; so does the writer.
The audit row records `has_expiry`, never the date — an expiry IS somebody's
immigration position, the same reasoning that keeps the note's text out.

**The deadline is derived, not configured.** The brief wanted a "trigger stage"
setting; we already have the event. A placement row is the offer and carries
`start_date`, so `requiredBy` derives from it the way the rebate window does.
Advisory only — a test asserts it cannot gate a save and never ranks anyone.

**No data-migration clause, deliberately** — 0 rows and 0 `compliance_recorded`
audit rows, both counted. A backfill would have passed vacuously anyway.

### The drift that caused the drift

The card re-declared `type RtwStatus` locally, because importing the real one
from `compliance.ts` would drag `agencyAdmin` into the browser bundle and fail
the build. So when the server vocabulary changed, the card kept sending the old
value **and TypeScript said nothing** — two copies have no relationship to
check. `lib/agency/compliance-vocab.ts` is now the single definition, server-
import-free (the `settings-limits.ts` pattern), and a test forbids re-declaring
either union anywhere.

### Verified by effect, in a rolled-back probe

Not by grant tables — by actually attempting the writes as each role, then
rolling back (table still 0 rows afterwards):

    [1 service_role INSERT = OK]                    ← the bug, fixed
    [2 expiry-without-evidence = REFUSED]
    [3 old word 'verified' = REFUSED]
    [4 'not_eligible' = REFUSED]
    [5 authenticated WRITE = DENIED]                ← audit coupling intact

779 tests, build clean. Migrations 26 and 27 applied to tailr-staging.
**Production still has zero agency code.**

### Open

No Figma frame existed for this card — or for the recruiter's candidate-detail
screen at all, which now carries three cards and has never been designed. Swept
every frame and text-layer name across all five pages for right-to-work,
compliance, sponsorship, visa, eligibility, share code: zero hits.

**Frame drawn 22 Aug** — [`Recruiter · Right to work — two questions`](https://www.figma.com/design/AWRRbEOX6rLsltutFDL3zs/Tailr-%E2%80%94-Hiring-Manager-Concept?node-id=181-2)
on page `02 · Recruiter`, five states, built to the `Interview capture` frame's
tokens exactly (Fraunces SemiBold 30 / Geist 12.5 / cards `#fffdfa` on
`#eee6da` r14, amber callout `#fdf8ee` on `#a5560b`). Status is in the frame
NAME, per this file's PARKED/ARCHIVE convention — `FRAME` has no `description`
property, that is components only. **Awaiting Ose's sign-off before further UI
work.** The candidate-detail screen underneath it still has no frame.

_Last updated: 22 August 2026_
