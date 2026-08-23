---
name: tailr-b2b
description: Tailr for Agencies (B2B recruiter product) — full context, agreed decisions, schema state, and where to pick up. Use whenever working on the agencies/recruiter side of Tailr - the agency schema, recruiter screens (/agencies/**), the hiring-manager surface (/hiring/**), the candidate/referee doorways (/consent, /reference, /portal, /rights), JD/CV parsing, scoring, interview rounds, consent, handover, or the staging→prod port of agency migrations. Read AFTER tailr-playbook (repo-wide rules still apply). Carries the SEVEN-step workflow definition, the client-actor and interview-loop decisions, the design lineage, the product decisions embedded in the UI, and the bugs that cost something. Triggers - "tailr b2b", "agencies build", "recruiter product", "agency schema", "client submission", "candidate notice", "workflow steps", "hiring manager", "interview loop", "consent", "handover".
---

# Tailr for Agencies — B2B build context

Read `tailr-playbook` first for repo-wide rules (staging-first, verified pushes,
PII, tracking boards). This skill carries the agencies-specific state.

## START HERE — state as of 22 Aug 2026 (end of day)

**Staging sign-in was broken for four weeks and is now fixed.**
`SUPABASE_SERVICE_ROLE_KEY` in `~/.config/tailr/tailr.env` was the literal
string `SET_ME_…` since 25 Jul, so `generateLink` answered `Invalid API key`
and nobody could sign in. That is why the "human walk-through" sat open since
14 Aug — it was BLOCKED, not unscheduled. If a task has sat on the open list
for weeks, check whether something mechanical is stopping it.

**The 20 Aug gap list is closed.** Migrations 28–34 applied to tailr-staging
and verified by effect. Read docs/PROJECT.md's 22 Aug entries for detail:

- **Notifications** + two-layer preferences (agency default, personal
  override). `resolvePreference()` is the ONE rule; `facesClient()` is a
  whitelist of one.
- **Candidate booking doorway** — /booking/[token], confirm/decline + .ics.
  Declining releases the slot in the same write and is never a withdrawal.
- **Closing the loop** — closing a role emails the candidates the loop was
  OPENED with. Batched at 50, paced; deferred people are never stamped.
- **Role ownership** — job_roles.owner_id, audited reassignment,
  notifications resolve owner-first.
- **Right to represent** — the ask on the rights doorway; the submission gate
  refuses answered-no outright and audits the unanswered override.
- **Candidates screen** at /agencies/candidates, **sign out** on every screen,
  **add-a-client** on the clients screen, **remove a candidate added in
  error**, and JD upload on the HM brief.
- **Domains: B2B gets its OWN separate domain** (not a subdomain), bought when
  production is wanted. There is NO port into consumer production, ever —
  agency migrations go to staging and, one day, a B2B production environment.

**Open, in priority order:**

1. **The apply path sends a stale CV** (consumer side, diagnosed not fixed).
   Two mechanisms — a localStorage restore race in
   `components/cv-tailor/resizable-panels.tsx`, and applying using
   `role_recommendations.tailor_history_id` (the last TAILOR RUN) so swapping
   the CV without re-tailoring sends the old document. **Ask Ose which repro
   he hit before building** — the two need different fixes.
2. **MAX_CANDIDATES_PER_ROLE is still 10.** Raising to 50 is safe from the
   mail side now. The remaining risk is the submission route: a sequential
   rescore loop, three queries per candidate, against `maxDuration = 60`.
   Load-test a full shortlist first.
3. **Finish the walk-through.** Sign-in works now and nothing else blocks it.
   Everything built on 22 Aug is structurally verified but has never been
   clicked by a person.
4. Lawyer + DPIA on capture→transcription→enrichment (unchanged gate);
   the revoke of authenticated UPDATE on `agency.agencies`, and the same
   table-wide-grant caveat now applies to `job_roles.owner_id` (migration 32).

**Signed off 22 Aug:** all email templates, and `docs/NON-COMPETE.md` (where
it lives publicly is still Ose's call; a lawyer pass before public web use
remains advisable).

**Verification discipline — this is the part that pays:**

- Verify grants by attempting the write AS THE ROLE, service_role included.
  Two shipped tables could never be written by the role that writes them.
- **Probe-mutate every guardrail before trusting it.** A guardrail counts only
  once it has failed. Three shipped with blind spots: a filename-pinned
  constraint test, a `[^)]*` regex an arrow parameter's paren defeats, and a
  scan that matched its own documentation.
- Strip comments before scanning source — use
  `lib/__tests__/helpers/source-scan.ts`, do not copy it again.
- Never trust a mock that does not implement the filter it is handed.

## What the product is

Decision-support for recruitment agencies — **not an ATS**. A recruiter inputs
one client role + 3–10 candidates and gets an explainable ranked shortlist
where every score traces to CV evidence, a recruiter override, or an explicit
`MISSING`. Output is a client-ready submission (document / email / portal).
Since 13 Aug it also carries the **interview loop**: the client posts a brief,
offers times, meets people, and decides — and the record deepens each round.

**Non-negotiables (from the PRD, enforced in schema where possible):**
- No automatic rejection, ever. Low scores prompt review; nothing hides a
  candidate. Client 'decline' actions and round decisions are signals, not
  removals — no code path turns either into one.
- `MISSING` renders explicitly, never filled with inferred content — DB
  constraint `evidence_quote_iff_present` enforces missing ⇔ no quote, both
  directions, plus 1000-char quote cap.
- Human override on every candidate; overrides live in `review_overrides`,
  attributed and audit-logged — never edits to the evidence map.
- Voice: "we structured what you told us, you decide." Never "AI decides" /
  "auto-hire".
- **No inference about a person.** Verbatim quotes mapped to requirements
  only. Never tone, sentiment, confidence or fluency scoring — the product's
  argument and the line the EU AI Act draws around emotion inference in hiring.

## Source documents

- `docs/AGENCIES_SCHEMA.md` — agreed design + **§4.1 as-built deltas** + §5
  decision log (**§5.4 client-actor auth, §5.5 interview loop**). THE
  reference; keep §4.1 updated on any schema change.
- `docs/CONSENT-COPY-DRAFT.md` — the interview-capture consent copy, BUILT but
  **not cleared for a real candidate**. Five decisions, the email, the page,
  the in-call reminder, and §6's six build promises.
- `docs/PROJECT.md` — running status rows.
- `mockups/agency-prototype/screens/*.jsx` — the original handoff's seven
  screens. Read rather than reconstructing from screenshots; doing the latter
  lost content twice.
- Figma **"Tailr — Hiring Manager Concept"** (`AWRRbEOX6rLsltutFDL3zs`) — 5
  pages, ~12 frames: concept map, HM dashboard, pre-round briefing, write a
  brief, recruiter briefs inbox, applicant pool, booking, close-out, consumer
  match, living dossier v2, round delta, audit log, settings.
- Tokens = Tailr brand v1.0 (ink #1E1813, paper #FFFDFA, cream #F9F6F0, coral
  #DC4F33), Fraunces headlines on the agency side only.

## Architecture decisions (5 Aug — do not relitigate)

1. **Same Supabase project, separate `agency` schema.** Consumer RLS is
   `auth.uid() = user_id`; agency RLS is `agency_id in (select
   agency.member_agency_ids())`. Never mix the families.
2. **Audit-coupling rule:** any table whose changes must be audit-logged has NO
   authenticated write policies — writes happen only in API routes via the
   service role, in the same operation as the `agency.audit_log` row. If the UI
   shows an AUDIT LOGGED pill, the client cannot write it directly.
3. **Clients are a third actor** — `client_contacts`, per-recipient sha256
   portal tokens (raw once), expiry + individual revocation.
4. **Retention:** role close stamps `retention_expires_at`;
   `agency.purge_candidate()` is the single erasure path; `purge_expired()`
   returns storage paths for the caller to delete via the Storage API.
5. **Art 14 candidate notice** at ingestion + `notice_delay_days` (default 7,
   hard cap 28). Auto-fire is NOT switch-off-able.
6. **Consumer bridge:** `public.recruiter_profile_snapshot(email)` is the ONLY
   door to consumer data, service-role-execute-only. No match caching anywhere.
7. **Provenance FKs** to auth.users are nullable `on delete set null` — consumer
   account deletion must never be blocked.
8. **Refs:** ROL-XXXX / CAN-0N via service-role-only RPCs.
9. **Scoring runs server-side.** `score_breakdowns` cached with `inputs_hash`;
   submission generation recomputes and REFUSES on a stale hash.

Never add `force row level security` to `agency.members` — infinite recursion.

## Client-actor + interview loop (13–14 Aug — settled, §5.4 / §5.5)

1. **One auth pool.** `auth.users` is the person; consumer / recruiter / hiring
   manager are orthogonal hats. Post-login routing by hat (`lib/hat-routing.ts`).
2. **Linkage is invite-only.** `client_contacts.user_id` (nullable, set null) is
   bound only by accepting a recruiter-issued invite on a **matching verified
   email**. No email self-claim.
3. **HMs hold ZERO RLS grants.** Every HM read/write is a service-role route
   shaped by disclosure rules. Their view is disclosure-filtered, not
   row-filtered — live tables hold recruiter-private material.
4. **The recruiter owns the process.** HM offers availability (their diary),
   recruiter books rounds, HM decides. Decisions are append-only.
5. **Capture consent is the candidate's alone.** `recordDecision` takes a raw
   token and *nothing else* — no context object — so there is no code path by
   which a recruiter could consent for someone. Rounds are created leaving
   `capture_consent_status` at `'pending'`; a test fails if the insert ever
   carries those columns.
6. **Withdrawal is a cascade**, not a flag: artifact + recording path +
   every evidence row from that round, then rescore.
7. **The client never sees the raw transcript** — structured evidence and
   quotes only. `getHiringDashboard` omits `capture_consent_*` and a
   build-failing source-scan test keeps it that way, because the consent copy
   promises "the people interviewing you are not told what you chose".
8. **Handover ends it.** The employer becomes controller; the retention clock
   starts on everyone else.

## State (14 Aug 2026)

**Staging only. Production has zero agency code** — no migrations, no routes.

**Migrations 1–11 applied to `tailr-staging` (pwonuqkpumgejqmotkwh)**, RLS
verified. 10 (`agency_client_auth`) and 11 (`agency_interview_loop`) applied
13 Aug. Always confirm the project ref before applying anything.

**Recruiter surface** (`/agencies`): dashboard · role workflow (7 steps) ·
candidate detail · **clients** (invite/revoke access) · **briefs** (inbox,
accept→mints role) · **interviews** (book/complete/cancel, ask about
recording) · **close-out** (references + handover pack) · **dossier**
(stratigraphy + round delta) · **audit** · **settings**.

**Hiring-manager surface** (`/hiring`): dashboard (dark) · write a brief ·
availability (offer/withdraw) · round write-up + decision · invite accept.

**Doorways** (token, no account): `/portal` · `/rights` · `/consent` ·
`/reference`.

**lib/agency/**: `db · types · steps · scoring · ingest · rescore · probes ·
notices · client-auth · briefs · rounds · consent · artifacts · references ·
handover · dossier · round-delta · recipients · audit-view · settings ·
settings-limits`.

**⭐ The standing gap is partly closed:** Ose completed the authenticated invite
accept on staging 13 Aug 22:29 — first real logged-in write, audit row verified.
**The rest of the loop has still never been walked by a human.**

**Demo fixtures on staging:** `hm-smoke-halcyon` ("Halcyon Search") with Ose as
owner (membership **backdated to 2025-07-10** so it wins the first-membership
race) + a linked Meridian Health contact. `rls-test-alpha` holds the real
parsed data (ROL-2402, ROL-2403, 79 overrides, 15 scored candidates). Ose is in
both — use the sidebar agency switcher.

### THE FLOW IS CALLED **THE SHORTLIST WORKFLOW** (decided 22 Aug 2026)

The rail says "Shortlist workflow". **The unit the steps run on stays "role" —
there is no unit-noun rename, and the question is CLOSED.** Do not re-run the
survey: `docs/ROLE-RENAME-PLAN.md` is headed with the decision, the four
rejected candidates and the reasons.

The short version. "Assignments" is out — Tailr serves contract desks, and AWR
2010 makes "assignment" the *worker's* word. "Searches" collides with the
dashboard's own search box (and with agency names: the fixture is "Halcyon
Search"). "Vacancies" is a synonym for the role, not a different object.
**"Shortlist" is reserved and must NOT become the unit noun** — it is a value
of the per-candidate decision enum (`["shortlist","hold","reject"]`) and the
client-facing name of the deliverable (`/portal`). The shortlist is the flow's
OUTPUT, not its container, and the unit exists from step 01 with nobody on it.

It won as the FLOW name because the product already named the span itself:
`app/api/agency/dashboard/route.ts:445` measures `brief_to_shortlist` — "Brief
to first shortlist: role created -> first submission."

Still true and still unfixed: "role" means two things in recruiter body copy
("Close this role", "No candidates on this role yet"). §3 of the plan is the
inventory if that is ever worth paying for.

### THE WORKFLOW IS SEVEN STEPS, NOT SIX

`lib/agency/steps.ts` is the single source of truth. Import it; never re-declare.
01 intake · 02 parse · 03 candidates · 04 screening · 05 compare · 06 **candidate
detail (own route)** · 07 submission. Step 06 fell out of a pane-derived rail
once and went missing for four days.

**Interviews, close-out, dossier, clients, briefs, audit and settings are
ADJUNCTS, not steps.** They hang off a role or the sidebar. Do not add an
eighth step.

## Design lineage

1. `mockups/agency-prototype/screens/*.jsx` — source of truth for the original
   seven screens' structure and copy.
2. `mockups/agency-dashboard-v2.html` — approved dashboard.
3. Figma "Tailr — Hiring Manager Concept" — everything from 12 Aug onward.

**Theme:** recruiter dashboard + all `/hiring` = **dark**, scoped by
`.ag-app:has(.agd-main)`. The seven workflow screens and the adjunct recruiter
screens stay light. Doorways (`/consent`, `/reference`) are light, own
stylesheet. Headlines Fraunces, body Geist, machine data Geist Mono.

## Product decisions embedded in the UI (do not undo)

- Compare matrix tints **recruiter overrides**, not "strong" cells.
- Submission disclosure switches **freeze into the snapshot** at generation.
- The client document keeps its **confidentiality footer** and **"Known gaps,
  stated plainly"**. Dropped once already in a layout rebuild.
- Hiding a candidate on compare is a **view control only**.
- Probe questions keyed by **question id**, never array index.
- **Booking is an index, not a status:** the partial unique index on
  `interview_rounds.slot_id` is the whole double-booking mechanism.
- **Round numbers are derived**, never supplied.
- **Both consent options carry identical weight**; no pre-selection anywhere,
  and the email's buttons select nothing (a prefetcher must never consent).
- **"I'd prefer not to"** on the referee page is the same size as the primary.
- The round delta's lane is **REVISITED, not CONTRADICTION** — deciding two
  statements conflict is a judgement about meaning, and judgements belong to
  people. Both layers show, no verdict. A test asserts "contradict" never
  appears on the item.
- The booking screen's **amber note** says Tailr does not host or record the
  call. Delete it the day capture ships, and not before.

## Performance invariants

`evidence` indexed into a Map once per data change — **never reintroduce
`evidence.find()` inside a matrix cell**. Derived lists memoised; strength
helpers stable callbacks. `content-visibility` on matrix rows, evidence cards,
role rows. Interaction feedback is transform/opacity only.
`prefers-reduced-motion` honoured in all three stylesheets.

## Lessons that cost something

- **"shortlist" is a reserved noun, in two places at once.** It is a value of
  the candidate decision enum AND the client-facing name of the deliverable
  (`/portal` titles itself "Shortlist"). Do not reuse it for a container, a
  status, or the unit the seven steps run on — the verb you press on a person
  and the box they sit in must not be the same word. Same trap as `placement`,
  which is the outcome.

- **Mocked tests agree with wrong code.** Two real bugs this session were found
  by reading the deployed schema and by seeding real data, both while the unit
  tests were green: (a) cancelling a round did not free its slot, because the
  unique index is status-agnostic — the code and its tests agreed with each
  other and disagreed with Postgres; (b) `ADDED` in the round delta was
  unreachable, because ingestion writes a `missing` evidence row for *every*
  requirement and that counted as prior evidence. **An absence of evidence is
  not evidence.**
- **Types are erased and travel fine; constants are not, and do not.**
  Importing a runtime constant from a module that imports `agencyAdmin` drags
  `next/headers` + the service-role key into the browser bundle and fails the
  build. Put shared constants in a server-import-free module
  (`settings-limits.ts`, `round-delta.ts` are the pattern).
- **RESTRICT is the attribution trail, and it will block your cleanup.**
  Deleting a seeded contact fails while a round attributes an action to them.
  Correct order: round → slot → contact. Audit rows correctly survive.
- **A failed load must not read as an empty one.** The briefs inbox once said
  "Nothing waiting on you" above an "Unauthorised" banner — the same shape as
  the `200 {enabled:false}` lesson in CLAUDE.md.
- **`safeNextPath` rejects backslashes.** Browsers normalise `\` to `/`, so
  `/\evil.com` resolves off-origin — right after a session is minted. One
  shared guard, and a source-scan test fails the build if an auth entry point
  re-derives it by hand (one already had).
- **Figma: resize BEFORE setting `textAutoResize`.** Resize resets sizing to
  fixed, so text overflows without reserving space. 27 nodes were affected
  across frames already signed off.
- **Turbopack will serve a stale `globals.css` and swear blind your edit isn't
  there.** 16 Aug: a `::before` hit-area rule was on disk, in the right file,
  imported by `app/layout.tsx` — and absent from the served chunk through an
  HMR reload, a `touch`, a server restart AND `rm -rf .next/cache`. Only
  `rm -rf .next` (the whole directory) fixed it; the chunk name and byte count
  were identical throughout, which is the tell. JSX-derived Tailwind utilities
  recompile fine, so a CSS-file change going missing while class changes land
  is this bug. Verify CSS by curling the chunk, not by reading the file.
- Local `npm run build` needs placeholder Supabase env or `/_not-found` fails
  to prerender:
  `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder npm run build`

## Deliberately NOT built (do not fake these)

- **Capture, transcription, per-round enrichment.** Behind the DPIA + consent
  gate. `round_artifacts.kind` has no `transcript` writer, and the
  `agency-recordings` bucket does not exist yet. The sweep that deletes audio
  on transcript verification IS built and finds nothing, which is correct.
- **"Load from template" / "From ATS"** — need real features behind them.
- **Access/rectification fulfilment** is manual.
- **HM-facing dossier** — needs a "was this candidate actually submitted to
  you" gate before it can exist; today the dossier is recruiter-side because it
  contains the recruiter's working.
- **Quiet matching / applicant pool** — decided and designed (job board was
  cut 13 Aug in favour of candidate-side recommendation), not built.


## BUILT 20 Aug: the placement record (migration 25)

`agency.placements`, one row per (role, candidate). Fee on the placement,
fall-off first-class and refusing to save without a reason, rebate window
DERIVED from start_date + rebate_weeks. Status is an outcome not a judgement
('declined' never filters or ranks); recording one never closes the role.
Audit-coupled, SELECT-only grants. Card on candidate detail.

**Still open around it:** terms of business have no home — there is no clients
table, only `client_contacts` (a person, with a company string), so putting
fee defaults there would model a company on a person row. Needs a decision
before it is built. The original spec follows for reference.

### Original spec (superseded by the build above)

**The biggest commercial gap.** The loop ends at decision → references →
handover, but the placement — the event the entire business is paid for — is
not modelled anywhere. There is no record of who got the job.

Without it you cannot compute the four numbers an agency owner runs on: fill
rate, time-to-fill, fee value, rebate exposure. Even if Tailr never invoices,
the record has to exist.

**Shape (agreed direction, not yet DDL):**

- `agency.placements` — one row per candidate placed on a role. `role_id`,
  `candidate_id` (unique together), `offered_at`, `accepted_at`,
  `declined_at`, `start_date`, `status` in
  `('offered','accepted','declined','started','fell_through')`.
- **Fee metadata**: `fee_percent`, `fee_value`, `rebate_weeks`,
  `invoice_due_at`. These belong here rather than on the client, because the
  fee is agreed per placement even when terms are standing.
- **Fall-off**: `fell_through_at` + reason. Fall-off before the rebate period
  ends is the money event agencies fear; it must be first-class, not a
  status someone edits away.
- **Audit-coupled** — placements are money. No authenticated write grants;
  service-role route + audit row in one operation, same shape as
  `candidate_compliance` (migration 24) which is the closest model to copy.
- **Terms of business** get a home on the client at the same time: fee %,
  rebate period, TOB-signed flag on `client_contacts` or a sibling table.

**Lines to hold:** a placement is a FACT about an outcome, never a filter and
never a ranking input. Declining an offer is not a judgement about a person.
And nothing here may auto-close a role — closing stays the recruiter's act,
because it starts the retention clock.

**Why it is queued rather than built:** it is a commercial modelling decision
(fee structures differ by agency: contingent, retained, fixed, percentage)
and getting it wrong means migrating money data later. Worth 20 minutes with
a real agency owner before the first line of DDL.

## Other gaps named 20 Aug — ALL CLOSED 22 Aug

Every item on this list was built (notifications, candidate-side booking,
right-to-represent, closing the loop, role ownership) or delivered as a
sign-off draft (the non-compete commitment, docs/NON-COMPETE-DRAFT.md).
Temp/contract recruitment remains out of scope until decided otherwise.

## Open items

- Lawyer review + DPIA + DPA (the gate). Consent copy is written and built.
- The full human walk-through.
- Revoke authenticated UPDATE on `agency.agencies` (settings audit bypass).
- Bulk upload; quiet matching DDL workshop; production port.
- `web-design-guidelines` pass: **done 14 Aug** for the session's screens.

## Git: commit through the API, not local branches

Local `git fetch` hangs on this network. `git push origin staging` works and is
what this session used throughout. **Always re-read staging's head before
committing** — other sessions work this repo in parallel, and a `docs/PROJECT.md`
push from a stale snapshot silently dropped another session's section once.
