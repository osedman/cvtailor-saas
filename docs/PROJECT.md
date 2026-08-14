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

_Last updated: 12 August 2026_
