# Renaming the seven-step flow — survey and plan

**Status: DECIDED 22 Aug 2026. The FLOW was named; the unit noun was NOT
renamed.** Sections 3–6 are kept because they remain the correct inventory,
locked list and verification recipe *if the unit noun is ever revisited* —
they are not a description of what shipped.

## THE DECISION

**The seven-step flow is "the shortlist workflow". The unit stays "role".**

Ose proposed "shortlist flow" against the two candidates below. It splits into
two readings, and only one of them survives:

- **"Shortlist" as the unit noun — REJECTED.** `shortlist` is already
  load-bearing and precise in this codebase: it is one of the three values of
  the per-candidate decision enum (`["shortlist","hold","reject"]`,
  `app/api/agency/candidates/[candidateId]/decision/route.ts:39`) and the
  client-facing name of the deliverable (`app/portal/layout.tsx:15` titles the
  page "Shortlist"). The container and the verb you press on a person would be
  the same word — a worse collision than *Searches* vs the search box, because
  it is inside the domain rather than in the UI chrome. It also fails the
  minute-one test: the unit is created at step 01 with nobody on it, so "Live
  shortlists" and "+ New shortlist" would name a thing that is not one yet.
  The shortlist is the flow's OUTPUT, not its container.

- **"Shortlist workflow" as the flow name — ADOPTED.** The decisive evidence
  is that the product already named this exact span itself:
  `app/api/agency/dashboard/route.ts:445` measures **`brief_to_shortlist`** —
  *"Brief to first shortlist: role created -> first submission."* That is the
  seven steps end to end, already called brief→shortlist in code. The rail now
  surfaces a name the system was already using rather than coining one.

### Why naming the FLOW beat renaming the UNIT

The survey's premise was that the *unit* needed a new noun because "Roles" was
ambiguous in the nav. Commit `815a91b` had already removed "Roles" from the
nav rail. What was left ambiguous was the *process* — "Role workflow" reads as
a workflow about roles rather than the work of filling one.

Naming the flow dissolves the problem instead of trading it:

- no new noun has to coexist with "role", so the recruiter and the hiring
  manager never say two words for one object across the wall;
- no `ROL-` seam to explain, ever;
- the dashboard search-box collision that sank *Searches* never arises;
- **6 strings instead of ~60**, with zero exposure to the three
  silent-failure boundaries in §6 (the 56 ARIA `role="…"` attributes, the
  frozen consent/notice/closure strings, and `roleId`/`role_id`/`job_roles`).

### The honest argument against what shipped

It does **not** fix "role" meaning two things in body copy. "No candidates on
this role yet", "Held candidates stay in the role", "Close this role" all
still use the job's word for the agency's piece of work on it. If that
ambiguity is what actually bites, §3 below is the inventory that fixes it and
the two live candidates are recorded under "What was considered".

### What shipped

| File:line | From | To |
|---|---|---|
| `app/agencies/roles/[roleId]/page.tsx:730` | `Role workflow` | `Shortlist workflow` |
| `…/candidates/[candidateId]/page.tsx:143` | `Role workflow` | `Shortlist workflow` |
| `…/candidates/[candidateId]/page.tsx:183` | crumb fallback `"Role workflow"` | `"Shortlist workflow"` |
| `lib/agency/steps.ts:2` | comment "The role workflow rail" | "The shortlist workflow rail" |
| `app/agencies/clients/page.tsx:20,140` | comments "the role workflow" | "the shortlist workflow" |
| `app/agencies/roles/[roleId]/page.tsx:4` | comment "all six steps" listing six | "all seven steps", listing seven |

Not touched, deliberately: `role.company || "Role"` on the same crumb line is
a **company-name** fallback, not the flow; and `steps.ts`'s `"Role intake"`
label stays, because that step really is intake of the role.

**Also fixed in the same pass** (it was queued with the rename and is
independent of the name): `app/agencies/roles/[roleId]/page.tsx:195,200`
`"Could not reassign the role."` → **`"Could not change the owner."`** —
"reassign" already means changing the role owner (`lib/agency/role-owner.ts`,
`owner_changed` audit event), so the word was doing two jobs.

### Verified

Wall diff empty; `git diff -U0` over `app lib components` contains no line
touching `roleId|role_id|job_roles|ROL-|StepKey|agd-roles|role="`; ARIA counts
still **33** (agency surface) and **23** (frozen surfaces); 906 tests green;
build clean. Rail fit measured rather than eyeballed against the real
stylesheet: `SHORTLIST WORKFLOW` is 18 chars at `--t-micro` 10px mono with
`--track-label` 0.08em ≈ **122px** inside a 232px sidebar's **184px** of
available label width (~33% headroom), rendered on one line.

## What was considered and NOT chosen

- **"Assignments" — RULED OUT.** The survey recommended it, and its own
  honest-argument-against turned out to be decisive: Ose confirmed on 22 Aug
  that **Tailr is meant for contract roles too**. Under AWR 2010 "assignment"
  is the statutory term for the *worker's* engagement — the 12-week qualifying
  clock and the Key Information Document are written around it — so on a
  contract desk the word belongs to the candidate, not to the agency's piece
  of work.
- **"Searches"** — the strongest unit-noun candidate. No statutory meaning,
  idiomatic on perm and contract desks, a genuinely different object from the
  role, and "search ROL-2402" is literally correct. Sunk by the collision with
  the universal UI verb sitting directly above the list: the dashboard box is
  placeholder "Search roles" with a `/` keybind and `app/agencies/page.tsx:697`
  reads "No role matches that search." Agency names in this trade also end in
  the word — the staging fixture is literally "Halcyon Search", so the sidebar
  would have read "Halcyon Search · 5 searches".
- **"Vacancies"** — the survey's runner-up. Zero code collisions, but it is a
  synonym for the role rather than a different object, "step 04 of the
  vacancy" is not a sentence, it implies an advert register in a product that
  says "There is no job board" on three surfaces, and it leaves a permanent
  `VAC`-in-nav / `ROL-`-on-card seam.
- **"Mandates"** — no statutory meaning and no collisions, but a *contingent*
  agency has no mandate, only permission to compete, so it is semantically
  wrong for most of the market.

## The governing rule, unchanged and still in force

**"role" = the job** — its title, its JD, its requirements: the thing the
hiring manager, the candidate and the referee emails all name. It is frozen.
Any future noun for **the agency's piece of work on that job** must be a
different object, not a synonym. Sections 3–6 below are written to that rule.

---

# SUPERSEDED — the survey's original recommendation: **Assignments**

_Kept verbatim for the reasoning only. Ruled out; see "What was considered
and NOT chosen" above. Do NOT implement._

Nav rail item: **Dashboard** (Ose's instruction, `/agencies` unchanged). The unit the seven steps run on, and every list, crumb and empty state that names it: **assignment**. The flow itself: **the assignment workflow** (seven steps, 01–07).

Governing rule that makes the whole inventory decidable, applied everywhere below:
**"role" = the job** (its title, its JD, its requirements — the thing the HM, the candidate and the ref emails all name). **"assignment" = the agency's piece of work on that job** (the reference, the owner, the seven steps, the open/closed state).

### Strongest argument for it

It is the only candidate that is a **different object** from "role" rather than a synonym for it — and the boundary is the constraint that actually binds here. `/found`, `/rights`, `/consent`, `lib/agency/notices.ts`, `lib/agency/closure.ts` and the whole `/hiring` surface are frozen on the word "role" (`lib/__tests__/matching-found.test.ts:174` asserts one sentence verbatim; `app/settings/page.tsx:50-53` is stored consent wording, so editing it is a consent-versioning event, not copy). Any synonym — Vacancies, Jobs, Requisitions — makes the recruiter and the hiring manager say two different words for one object across a wall neither can cross. "Assignment" does not: the role exists in the world, the assignment is what this agency took on when it accepted the brief, and both sentences stay true on their own side.

That distinction pays a second time on the frozen reference prefix. `'ROL-' || v_next` at `supabase/migrations/20260805120000_agency_core.sql:128` cannot be re-minted — it is stamped into `audit_log.entity_ref`, frozen inside `submissions.snapshot` jsonb, and copied across the schema wall into `public.published_roles.role_ref` where jobseekers read it. Under "Vacancies", `VAC` in the nav and `ROL-2402` on the card is a permanent seam that looks like a bug. Under "Assignments", **"assignment ROL-2402" is literally correct** — the assignment is against role 2402. The rename ships with no ref mismatch to explain.

And it carries process, which is what is being named: "step 04 of the assignment" is idiomatic; "step 04 of the vacancy" is not a sentence.

### Honest argument against it

**AWR 2010.** In UK temp and contract staffing, "assignment" is the statutory term for the *worker's* engagement — the 12-week qualifying clock runs on the assignment and the Key Information Document is written around it. An agency with a temp desk will read the word as belonging to the candidate, not to the work, and this product's own retention copy cites the Equality Act, so the compliance-literate reader is exactly the reader you have. It also sits one word from the reserved noun `placement` (`lib/agency/placements.ts`), which is the *outcome*.

Mitigation, not dismissal: the flow is perm-shaped end to end — submission, rounds, offer, placement, retention clock on close, no timesheet, rate or extension concept anywhere — so the temp reading has nothing to attach to. Say it once in copy ("the client's brief, accepted — the work is yours") and never write "assigned to". Second, live and real: **"reassign" already means changing the role owner** (`app/agencies/roles/[roleId]/page.tsx:182,194,199`; `lib/agency/role-owner.ts:11`; `owner_changed` audit event). "Reassign this assignment" is clumsy — reword those two error strings to "change the owner" in the same pass. Three strings, no migration.

---

## 2. Runner-up: **Vacancies** / vacancy

The deciding sentence: **Ose has already taken the name out of the nav rail — the rail item is "Dashboard" — so the name never has to work as a scent label, only inside the seven steps and alongside the frozen "role" vocabulary, and "step 04 of the vacancy" fails the first test while a recruiter reading "Vacancies" beside the hiring manager's untouchable "Your roles" fails the second.**

(Everything that made Vacancies score highest — first-letter uniqueness in a six-item rail, the count pill, the *Client briefs → Vacancies* two-step story, prediction-before-click — was a rail argument. The rail now says "Dashboard". Its remaining assets are one supporting SQL comment at `20260805120000_agency_core.sql:136` and zero code collisions; its remaining liabilities are the advert register in a product that says "There is no job board" on three surfaces, and permanent `ROL-` mismatch.)

---

## 3. Rename inventory (LOCKED items excluded)

### (a) Nav labels

| File:line | From | To |
|---|---|---|
| `components/agency/agency-nav.tsx:41` | `label: "Roles"` | `label: "Dashboard"` |
| `app/agencies/page.tsx:461` | `{ id: "agd-roles", label: "Roles", … }` | `label: "Assignments"` (id unchanged) |
| `lib/agency/steps.ts:21` | `{ key: "intake", label: "Role intake" }` | `label: "Intake"` (key unchanged) |
| `app/agencies/roles/[roleId]/page.tsx:729` | `Role workflow` | `Assignment workflow` |
| `app/agencies/roles/[roleId]/page.tsx:760` | `Active role` | `Active assignment` |
| `app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx:142` | `Role workflow` | `Assignment workflow` |
| `…/candidates/[candidateId]/page.tsx:161` | `Active role` | `Active assignment` |
| `app/agencies/roles/[roleId]/interviews/page.tsx:251` | `ag-step` "Roles" | `Dashboard` |
| `app/agencies/roles/[roleId]/interviews/page.tsx:253` | `This role` | `This assignment` |
| `app/agencies/roles/[roleId]/close-out/page.tsx:207` | `ag-step` "Roles" | `Dashboard` |
| `…/candidates/[candidateId]/dossier/page.tsx:114` | `ag-step` "Roles" | `Dashboard` |

### (b) Headings and breadcrumbs

Ten crumb buttons labelled "Roles" that `router.push("/agencies")` — all become **Dashboard**, because that is now the destination's name:
`app/agencies/briefs/page.tsx:163` · `app/agencies/clients/page.tsx:291` · `app/agencies/settings/page.tsx:180` · `app/agencies/notifications/page.tsx:117` · `app/agencies/audit/page.tsx:123` · `app/agencies/roles/[roleId]/page.tsx:806` · `…/interviews/page.tsx:273` · `…/close-out/page.tsx:225` · `…/candidates/[candidateId]/page.tsx:178` · `…/candidates/[candidateId]/dossier/page.tsx:131`

Crumb fallbacks "Role" → **"Assignment"**:
`…/interviews/page.tsx:276` · `…/close-out/page.tsx:228` · `…/dossier/page.tsx:134` · `…/candidates/[candidateId]/page.tsx:181` (`"Role"` → `"Assignment"`, `"Role workflow"` → `"Assignment workflow"`)

Headings and buttons:
- `app/agencies/page.tsx:678` `<h2 className="agd-eyebrow">Live roles</h2>` → **Live assignments**
- `app/agencies/page.tsx:500` `"+ New role"` → **"+ New assignment"**
- `app/agencies/roles/[roleId]/page.tsx:2313` `Close this role` → **Close this assignment**
- `app/agencies/roles/[roleId]/page.tsx:2325` `Reopen role` → **Reopen assignment**
- `app/agencies/roles/[roleId]/page.tsx:2327` `Close role and start retention` → **Close assignment and start retention**
- `app/agencies/roles/[roleId]/interviews/page.tsx:286` `← Back to role` → **← Back to assignment**
- `app/agencies/clients/page.tsx:374` `Go to your roles` → **Go to your dashboard** (it pushes `/agencies`)

### (c) Body copy and empty states

`app/agencies/page.tsx` — :494 placeholder `Search roles` → `Search assignments`; :497 `aria-label="Search roles"` → `"Search assignments"`; :686 `aria-label="Filter roles"` → `"Filter assignments"` (the `role="group"` on the same line is ARIA — do not touch); :430 `…no blocked roles.` → `…no blocked assignments.`; :586 `accepting one starts the role in intake` → `accepting one starts the assignment at step 01`; :694–699 all six empty states (`No roles yet. Create one and paste the client brief.` / `No role matches that search.` / `No role is blocked…` / `None of the live roles were created by you.` / `No closed roles yet.` / `No live roles.`) → assignment/assignments; :808 `Average across roles that shipped a shortlist.` → `…across assignments…`

`app/agencies/briefs/page.tsx` — :154 `Accepting turns it into a role;` → `…into an assignment;`; :183 `Accepting turns it into a role with its own reference and opens step 01` → `…into an assignment…`; :267 `It mints your next role reference` → `…your next assignment reference`; :275 `Yes, create the role` → `Yes, create the assignment`; :317 `Accept — create the role` → `Accept — create the assignment`; :335 `Open {row.roleRef || "the role"} →` → `"the assignment"`

`app/agencies/roles/[roleId]/page.tsx` — :194 and :199 `Could not reassign the role.` → **`Could not change the owner.`** (kills the reassign/assignment clash); :1489 `No candidates on this role yet.` → `…on this assignment yet.`; :2255 `Held candidates stay in the role, visible to you only.` → `stay on the assignment`; :2306 `Every score, override and decision on this role is logged against your name.` → `on this assignment`

`app/agencies/roles/[roleId]/interviews/page.tsx` — :126 `Could not load this role's interviews.` → `this assignment's`; :326 `No candidates on this role yet. Add them in step 03 — anyone on the role can…` → assignment ×2; :357 `Anyone on the role can be met…` → `Anyone on the assignment…`

`app/agencies/roles/[roleId]/close-out/page.tsx` — :97 `Could not load this role.` → `…this assignment.`; :257 `No candidates on this role yet.` → `…on this assignment yet.`

`components/agency/candidate-placement.tsx` — :108 toast `Recorded. The role stays open until you close it.` → `The assignment stays open…`; :223 `Recording this does not close the role — closing starts the retention clock…` → `does not close the assignment`

`app/agencies/settings/page.tsx` — :171 `Both settings apply to every role from the moment you change them` → `every assignment`; :193 `every role the moment you change them` → `every assignment`

`app/agencies/clients/page.tsx` — :371 `Contacts are created on the Submission step of a role` → `…step of an assignment`

`app/agencies/audit/page.tsx` — :164 `The first role, candidate or client action will appear here.` → `The first assignment, candidate or client action…`

`lib/agency/notify.ts:320` — recruiter-addressed (`your brief inbox`): `…you can accept it into a role or decline it with a note back to them.` → **`accept it into an assignment`**. (The survey cited this at :201; it is at **:320**.) This is the *only* string outside `app/agencies/**` + `components/agency/**` that changes.

**Deliberately NOT changed inside the recruiter surface** (the "role = the job" half of the rule — flag these to Ose so they don't read as misses):
`app/agencies/roles/[roleId]/page.tsx:936` "Role & client", :938 "Role title", :1367 "Motivation for this role", :2379 "…against this role's requirements", :2461 "the role has stopped being shown to anyone new" (that is the published role candidates see); `app/agencies/page.tsx:151` `"Untitled role"` (default job title); `app/agencies/clients/page.tsx:478` "a brief for a role they want you to fill"; `app/agencies/settings/page.tsx:217,238` retention wording ("after a role closes") — kept **verbatim identical** to the candidate-facing sentence on `/rights` and in `lib/agency/notices.ts`; `…/page.tsx:214` submission intro (the client reads it), :352–353 close toasts (they report what candidates were told, and `lib/agency/closure.ts` says "role").

### (d) Comments and docs

- `lib/agency/steps.ts:2` "The role workflow rail" → "The assignment workflow rail"
- `app/agencies/roles/[roleId]/page.tsx:4` "The role workflow, all six steps…" → assignment workflow, **and it says six; there are seven**
- `app/agencies/page.tsx:9` ("Live roles  every role with its six step rail"), :448–450 (the one-nav comment quoting "Roles"/"Clients")
- `components/agency/agency-nav.tsx` header comment (two lines quoting "Roles")
- `app/agencies/agencies.css:1235-1237` "Active-role block… Reassignment is audit logged server-side (owner_changed)" — comment only; class names `.agd-role*`, `.ag-active-role` stay
- `lib/__tests__/agency-nav.test.ts` header comments quoting "Roles" (assertions key off `"roles"`/`agd-roles` and must not move)
- `docs/PROJECT.md` — new row (CLAUDE.md requires it) + a glossary line stating the role/assignment rule; note the existing `docs/PROJECT.md:546` ref-deep-link 404 gap is untouched
- `docs/AGENCIES_SCHEMA.md` — one line: UI says "assignment", schema stays `agency.job_roles`, refs stay `ROL-`
- `.claude/skills/tailr-b2b/SKILL.md` — the seven-step block (:192 area) and the reserved-noun list gain "assignment"
- `mockups/agency-screens/01-role-intake.html` … `08-dashboard.html` — regenerate labels; `01-role-intake.html`'s step title becomes "Intake"
- Notion card, data source `4dd8b2b7-23f0-48a5-92a3-4ffdfbb32fa6`

---

## 4. What must NOT change

**Route paths.** `/agencies/roles/[roleId]/**` and `/api/agency/roles/**` stay. The `[roleId]` folder name is the key Next.js hands to 17 files destructuring `params: Promise<{ roleId: string }>` — renaming the folder yields `undefined` **silently**, no compile error. `lib/agency/notify.ts` builds four `ctaUrl`s on this path in emails already sent and uneditable. `lib/site-url.ts:120` keys the host split on the `/agencies` prefix. `lib/__tests__/matching-scan-guards.test.ts` reads the literal path.

**DB identifiers.** `agency.job_roles` (14 FK references across 9 migrations), `role_id` on all of them, `agencies.role_seq`, `agency.next_role_ref()` / `next_candidate_ref(p_role)` / `purge_candidate` / `purge_expired` (called by literal name from `lib/agency/db.ts:256`, `lib/agency/briefs.ts:588`, routes), the `job_roles_status_retention` trigger and `on_role_status_change()`, every index and policy name, and the schema name `"agency"`. Reason beyond cost: **every agency migration is idempotent with `if not exists` / `duplicate_object then null`, so a renamed object is ADDED ALONGSIDE the old one rather than replacing it** — a rename here silently doubles the schema. And the name is invisible to users, so there is no benefit to buy.

**The `ROL-` prefix.** Do not mint `ASG-`, and do not run two prefixes. Already-issued refs cannot be regenerated; they are frozen in `audit_log.entity_ref`, inside persisted `submissions.snapshot` jsonb, and in `public.published_roles.role_ref` on the jobseeker's side of the wall. Under this name it costs nothing: assignment ROL-2402 is against role 2402.

**API field names.** The agency API returns DB rows unchanged, so `JobRole`'s snake_case keys are simultaneously columns and JSON — a rename is a two-sided change with nothing catching drift (`AgencyClient` is `SupabaseClient<any,…>`; no generated types; `RoleRow` at `app/agencies/page.tsx:24` is hand-duplicated over an untyped fetch). Includes `caller_role`, `role_title`, `from_role_id`/`to_role_id`, and the camelCase `roleId`/`roleRef` in `lib/agency/briefs.ts`.

**The other actors' vocabulary — the wall.** `/found`, `/settings` (PROMISES at :50-53 are the *stored* consent wording, and :262 tells the user so), `/rights`, `/consent`, `/reference`, `/portal`, all of `/hiring` including "Your roles" and `app/hiring/briefs/new/page.tsx:435` ("turns it into a role" — it chains into :439 "The role appears on your workspace" and the HM's band, so it cannot move alone), `lib/agency/notices.ts`, `lib/agency/closure.ts`. Legal sign-off, verbatim test assertions, and a consent-versioning event if touched.

**Also frozen, and the usual casualties of a regex:** 33 ARIA `role="…"` attributes in `app/agencies/**` + `components/agency/**` and 23 more in the other-actor files (`matching-consent.test.ts:133,138` assert `role="alert"` and `role="switch"` as literal source text); `StepKey` values (they are `?step=` URL values behind 8 dashboard deep links, and `stepNumber()` derives every visible badge from array position); the `agd-roles` anchor id and `current="roles"` / `AgencyNavKey` `"roles"` (pinned by `lib/__tests__/agency-nav.test.ts`); the 16 `.agd-role*` / `.ag-active-role` / `.ag-portal-role` CSS classes; `hm-role-chip` in `app/hiring/hiring.css` (that "role" is the person's hat).

---

## 5. Standalone list page: **no — point at the existing surface**

`app/agencies/roles/` contains only `[roleId]/`; there is no `page.tsx`, so `/agencies/roles` 404s today. Nothing needs building:

- The nav item keeps `href: "/agencies"` and is relabelled **Dashboard**. `agency-nav.test.ts`'s "points every item at a route that exists" check resolves `/agencies` → `app/agencies/page.tsx` and keeps passing.
- The list already exists as the dashboard band `#agd-roles` (`app/agencies/page.tsx:676`), heading **Live assignments**, with search, the four-way All/Mine/Urgent/Closed filter and a per-card stage rail. Under Ose's instruction that band *is* the assignments list, reached from the in-page section nav now labelled "Assignments".
- One cheap add worth doing in the same commit: a permanent redirect in `next.config.js` (which already has the `/walkthrough` precedent) for `/agencies/roles` **and** `/agencies/assignments` → `/agencies`. Both are URLs a recruiter will type; both 404 today.
- Out of scope, but do not let it get blamed on the rename: `docs/PROJECT.md:546` records that ref deep links (`/agencies/roles/ROL-2402`) 404 because routing is by uuid.

---

## 6. Riskiest part, and how to verify

**The risk is a global find/replace on "role" leaking across three boundaries — and two of the three fail silently.** (i) The 56 ARIA `role="…"` attributes: a regex breaks accessibility *and* `matching-consent.test.ts`. (ii) The frozen consent/notice/closure/`/found` strings: `matching-found.test.ts:174` catches one of them, nothing catches the rest, and `app/settings/page.tsx:50-53` is stored consent wording where a silent edit is a compliance event. (iii) `roleId` / `role_id` / `job_roles`: renaming the `[roleId]` segment produces `undefined` in 17 files with no compile error, and `typescript.ignoreBuildErrors: true` in `next.config.js` means the build will not save you.

**Do it by hand, file by file. No `sed -i`, no editor-wide replace, on any file in this list.**

Verification, in order:

1. **The wall check — the single strongest one.** `git diff --stat -- app/found app/settings app/rights app/consent app/reference app/portal app/hiring lib/agency/notices.ts lib/agency/closure.ts` must be **empty**. `lib/agency/notify.ts` must show exactly one changed line (:320).
2. **The identifier check.** `git diff -- supabase/ app/api/ lib/agency/db.ts lib/agency/types.ts` empty; `git diff -U0 | grep -E 'roleId|role_id|job_roles|ROL-|StepKey|agd-roles|role="'` returns **nothing**.
3. **The ARIA count.** `grep -rno 'role="' app/agencies components/agency | wc -l` must still be **33**, and `grep -rno 'role="' app/found app/settings app/rights app/consent app/reference app/portal app/hiring | wc -l` must still be **23**.
4. **Targeted suites, then the whole thing:** `npx vitest run lib/__tests__/agency-nav.test.ts lib/__tests__/matching-consent.test.ts lib/__tests__/matching-found.test.ts lib/__tests__/matching-scan-guards.test.ts lib/__tests__/agency-role-owner.test.ts lib/__tests__/typography-consistency.test.ts` → then `npx vitest run` → then `npm run build`.
5. **Verify the effect, not the status code** (CLAUDE.md), on staging in a browser: accept a brief on `/agencies/briefs` → confirm the button read "Accept — create the assignment", a row appeared under **Live assignments**, and its ref still reads `ROL-24xx`; open it → rail says "Assignment workflow", step 01 badge reads `01` and the eyebrow reads `Step 01 · Intake`; deep-link `?step=submission` still lands on step 07; hit `/` and `n` (the search and new-assignment keybinds); then open `/found` as a matched candidate and a `/rights/[token]` page for someone on that assignment and confirm both still say **role**, unchanged. Repeat at mobile width per the design rules, and run the `web-design-guidelines` skill — "Close assignment and start retention" and "+ New assignment" are longer than what they replace and are the two most likely to wrap.
6. **Two things that will look like rename bugs and are not** — call them out in the PR so they aren't "fixed" mid-review: the dashboard's `STAGES` at `app/agencies/page.tsx:71` is a hard-coded SIX-item list with `aria-label="Step N of 6"` while `WORKFLOW_STEPS` has seven; and `/agencies/roles/ROL-2402` 404s (routing is by uuid).

Two process gates before any of this: per CLAUDE.md the Figma frame is the source of truth for anything a user looks at, so the renamed labels need a frame and Ose's sign-off before implementation; and the AWR/temp-desk reading of "assignment" is the one judgement call in this plan that should be put to Ose explicitly rather than assumed away.