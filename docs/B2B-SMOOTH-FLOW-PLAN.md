# Tailr B2B — adopt the prototype's smoothness, keep the app

_3 September 2026. Written after reviewing `tailr-b2-b.zip` (the Claude
prototype), the consolidated product/UX review PDF of 1 Sep, and the current
`staging` build (head `5abd34b`)._

## The decision

**Do not rebuild.** The existing app is kept as is: the routes, the `agency`
schema, the seven-step shortlist workflow, the three derived phases, the
disclosure-filtered hiring-manager payload, the token doorways. What we take
from the prototype is the way it *projects* the flow, and we remove the demo
and AI-flavoured copy on the way in.

Ose's brief, verbatim: "adopt how smooth the prototype projects the flow, but
keep the main app, just remove all the AI text and solidify the processes."

What "smooth" is, once you take the prototype apart, is six things. None of
them is a screen. They are patterns that sit on top of screens we already have:

| # | Pattern in the prototype | What it does for the user | Exists today? |
|---|---|---|---|
| 1 | **Role header + ownership strip** (`role-header.tsx`) | On every role screen: company · ref · title · phase rail · **owner** · **waiting on** · **due / age** · **next action** chip | Phase rail yes (4 of 6 role screens). Owner stored but only shown as a select on one page. Waiting-on and next-action derived nowhere |
| 2 | **Next-action engine** (`next-action.ts`) | One persona-aware sentence: what to do, why, one CTA, or "waiting on X" | No. Dashboard has hand-coded "Needs you now" literals |
| 3 | **Handoff receipt** (`handoff-banner.tsx`) | After every consequential action: *Confirmed / Now owned by / Their next task / Then* | Partly: five `ag-handoff` blocks with one CTA each, no owner, no "then" |
| 4 | **Today queue** (`today.tsx`) | Roles grouped by *who is blocking*: needs my decision · waiting on clients · candidate work · interviews · handovers ready | No. Dashboard groups by role stage, capped at three cards |
| 5 | **HM home = "what needs you, and only you"** (`hiring/tasks.tsx`) | One card, one CTA, then the role at a glance | No. `/hiring` is a dashboard of sections |
| 6 | **Sub-state vocabulary** (`deriveSubState`) | The phase chip names the exact state: "Waiting for client review", "Collecting availability", "Debriefs due" | No. Chips say only Shortlist / Interviews / Handover |

Everything below is about porting those six, fixing the navigation faults the
inventory found, and hardening five process seams. Each wave is small enough
to verify in a browser on both hats in one sitting.

## What we are NOT taking from the prototype

- **The client-side store and persona switcher.** Real routes, real auth, real
  disclosure boundaries already exist. The switcher stays a prototype device.
- **The dependency set** (`@base-ui/react`, Tailwind 4, shadcn 4). We port
  behaviour and tokens into the `ag-` stylesheet, not packages.
- **Ordinal coverage numbers as the headline.** The real app has explainable
  `score_breakdowns`; the review is right that a single 0–100 implies false
  precision. Evidence bands and MISSING stay first-class.
- **Fake SLAs.** The prototype invents "In 3 days · 72h". We have no SLA
  model. We show honest age ("waiting 3 days", "sent 21 Aug") until an agency
  SLA setting exists. Never a due date we cannot defend.
- **The five-stage rail with "Brief" and "Closed" as chips.** Our rail is three
  phases derived from two facts and already signed off. The brief lives in
  the inbox before a role exists; closed is a state of handover, not a place.
  Keep three chips, add sub-states.

## The copy that goes

Every line that names AI, sparkles, or automation. The product voice is
"we structured what you told us, you decide"; that sentence does the work
without naming a model.

| Prototype text | Replace with |
|---|---|
| "AI organises and cites evidence. It never advances or rejects a candidate" (shortlist, brief, settings) | "Evidence is mapped to the brief, quote by quote, with its source. You decide who goes forward." |
| "How AI is used here" panel (settings) | Delete. The evidence rule is documented in `docs/EVIDENCE-RULE.md`; link it from settings as "How evidence works". |
| `Sparkles` icon anywhere | Delete the icon. |
| `persona: 'ai'` actor in activity, "AI" label with a bot icon | `system` only. Anything the product did on its own is the system; nothing else needs an actor. |
| "AI-organised coverage, 0-100" | Not ported (see above). |
| "availability collection begins automatically", "first-round interviews are created here automatically", "Starts automatically the moment the pack is delivered" | Name the owner: "the recruiter invites advanced candidates", "the recruiter books round 1", "starts when the pack is delivered". Nothing "automatic" in a human-led process. |
| Demo names, "Good morning, Mara", fake metric strip, fake sibling roles | Real user name from session; real counts from the dashboard route; no filler rows. |

## Navigation: the faults, and the shell that fixes them

From the inventory (all file:line refs on `staging` head `5abd34b`):

**Bugs to fix first (Wave 0)**

1. **Bare-role-URL bounce.** `roleLandingPath` redirects `/agencies/roles/:id`
   away from the workflow unless `?flow=shortlist` is set
   (`app/agencies/roles/[roleId]/page.tsx:243`), but only the interviews
   sidebar sets it. "This role" on close-out and the dossier, every crumb, the
   step-06 rail and the dashboard's `openRole` all link bare, so on any role
   past submission they bounce back where they came from. Fix: one helper,
   `workflowHref(roleId, step?)`, that always carries `flow=shortlist`; the
   landing redirect only ever fires on a truly bare URL.
2. **Seven pages bypass `AgencyNav`** with five different hand-rolled
   "Navigate" lists; two workflow pages have no route navigation at all
   (Briefs, Clients, Audit, Settings unreachable from the screen recruiters
   live on). Fix: `AgencyNav` on every `/agencies/**` page, no exceptions.
3. **`PhaseRail` and `AgencySwitcher` missing** on step-06 candidate detail
   and the dossier. Add both.
4. **`HiringNav` highlights nothing** on `/hiring/roles/:id` and
   `/hiring/briefs/new` (`components/agency/hm-shared.tsx:73`). Fix the
   matcher.
5. **Two parallel step lists** on the workflow page (`page.tsx:728` vs
   `WORKFLOW_STEPS`). Derive Back/Next from `WORKFLOW_STEPS` and delete the
   local array. Delete the unused `stepLabel()`.

**The shell (Wave 0, same session)**

Global navigation answers "where do I work"; role navigation answers "where is
this role". Keep the two levels apart, as the review recommends and as the
prototype does with its sidebar + role header.

| Context | Items | Notes |
|---|---|---|
| Recruiter global (`AgencyNav`) | Today · Roles · Candidates · Client briefs · Client access · Audit log · Settings · Notifications | "Dashboard" becomes **Today** (it is the queue). **Roles** is new: `/agencies/roles`, the list that today only exists as dashboard cards. Nav key `roles` finally means roles. |
| Recruiter role (the `RoleHeader`, on all six role screens) | Overview · Shortlist workflow · Interviews · Close-out · Activity | Overview = `/agencies/roles/:id/overview`, the prototype's `role-overview.tsx`: checklist of the seams, latest receipt, activity. Landing stays "where the work is"; Overview is the calm page you go to when you want the whole picture. |
| HM global (`HiringNav`) | Home · My roles | Home = `/hiring`, reshaped as "what needs you". `/hiring/interviews` folds into the role pages; keep the route as a redirect for a release. "Post a brief" moves off the primary nav (Wave 5a: the brief is the recruiter's) and stays reachable from a role's Overview. |
| HM role (`/hiring/roles/:id`) | Overview · Shortlist · Interviews · Decision · Handover status | Tabs, not pages, over the one disclosure-filtered payload. Handover status is read-only: "the recruiter is completing references", never the pack. |
| Doorways | none | Three blocks only: why you are here · the task · what happens next. Already true for booking, consent, reference, rights; align portal. |

Naming collisions the inventory flagged, resolved: the nav item is
**Candidates** (people across roles), the workflow step stays **03
Candidates** (it is inside a role, under a rail titled "Shortlist workflow"),
and the dashboard section that was also called Candidates goes. "Interviews"
stays the same word in both hats because it is the same phase.

## The process seams, solidified

The review's integrity findings, checked against the real app rather than the
prototype. Three are already satisfied by architecture; five need work.

**Already true, keep true**

- Persona data is separated server-side. HMs hold zero RLS grants; every HM
  read is a service-role route shaped by disclosure. (§5.4)
- Hire selection is the client's. Decisions are append-only and reach the
  recruiter as signals. (§5.5)
- Every consequential write is audit-coupled. (architecture decision 2)

**To harden**

| Seam | Today | Change | Line to hold |
|---|---|---|---|
| **Shortlist decisions complete** | Portal decisions arrive one at a time; nothing says when the client is done | An explicit HM action, "Confirm my decisions", available once every submitted candidate has one. It closes the review: receipt to both sides, recruiter's next action becomes "Invite N advanced candidates". Until then the HM's next action reads "Decide on 2 remaining" and the recruiter's waiting-on reads "Owen · 2 decisions outstanding" | Not a gate on booking. The recruiter may still book an advanced candidate early; decisions never remove anyone. **Ose to confirm this is completeness, not a lock.** |
| **Booking states named exactly** | Round states exist (`invited/confirmed/declined/cancelled`, slot index) but the rail says only "Interviews" | Sub-states from facts: *Collecting availability* (HM slots offered, none booked) → *Invited, awaiting candidate* (round on a slot, invite pending) → *Booked* (candidate confirmed) → *Debrief due* (round happened, write-up missing) → *Decision due*. The candidate doorway receipt says "availability received, the recruiter confirms the slot" and never "booked" | The prototype's own bug (submit availability ⇒ booked) must not be ported. Booking is the slot index, nothing else. |
| **Handover checklist** | Freeze → hand over → deliver, gated on the pack existing | A mandatory list on close-out: references received · right to work on file · placement record · start date · terms confirmed. Each item is *done*, *waived (reason)*, or *not applicable*, audit-coupled. "Hand over" is disabled until every item is resolved | No auto-completion of items on delivery (the prototype does this; we do not). Waivers are audited facts, not silent skips. |
| **Recruiter acting for the client** | `Take to close-out` on the recruiter's interviews screen | If a recruiter records a hire without a client decision on file, require "on behalf of <contact>" + reason, audit both. Otherwise the button waits for the decision | The HM's selection is authoritative. Proxy is explicit or absent. |
| **Candidate outcome ≠ role outcome** | Candidate decisions and role closure are separate tables already | Make it visible: the role header shows the role outcome (open · placed · closed no-hire · cancelled · fell off); the candidate lane shows advance/hold/decline. Never the same chip | Decline is a signal about a submission, never a state of a person. |

## Waves

_4 Sep, Ose: "Fuck the phases, build a version of what the refinement should
look like then come back to me." Waves 0–3 were built as one version on
staging that day, without the per-wave sign-offs below. The wave text stays
as the record of what each part is and how to verify it; Waves 4–6 remain
open._

Each wave ends with something Ose can click on staging, both hats, and a
recorded row in `docs/PROJECT.md`. Figma first for anything a user looks at
(CLAUDE.md rule); the prototype screens are the reference the frames are built
from, and frames are marked Approved before code.

### Wave 0 · Navigation hygiene (no design, no schema)

- Fix the five bugs above. Add `/agencies/roles` (list) and the `Today` rename.
- `AgencyNav` on all 14 recruiter pages; `PhaseRail` + switcher on all six
  role screens; `HiringNav` active states.
- **Verify:** every link in both navs lands on the page it names, for a role in
  each of the three phases (ROL-2409 for shortlist; seed one in interviews and
  one in handover). No bounce. Deep link + reload holds context.

### Wave 1 · The ownership strip and next action (design + code)

- `lib/agency/next-action.ts`, server-import-free like `phases.ts`. Input: the
  facts a role payload already carries (phase, submission, decisions, rounds,
  write-ups, pack, closure, owner). Output per hat: `{ title, detail, cta,
  href, waitingOn?, since? }`. Pure function, unit-tested against every
  sub-state.
- `deriveSubState(facts)` next to `derivePhase`. The rail chip shows it.
- `RoleHeader` component (recruiter and HM variants) replacing the ad-hoc
  crumb + rail on all role screens: company · ref · title · owner · waiting on
  · since · next-action chip · phase rail with sub-state.
- Owner is real (`roles.owner_id`); waiting-on is derived from facts, never
  stored; "since" is the timestamp of the fact that created the wait.
- **Verify:** for one role walked through all sub-states, the header's
  sentence is right at every step on both hats. Screenshot each.

### Wave 2 · The handoff receipt (design + code)

- `HandoffReceipt` with the four cells: Confirmed · Now owned by · Their next
  task · Then. Replaces the five `ag-handoff` blocks. Derived from facts on
  render (survives reload; nothing stored) and announced via a live region.
- Fires at the seams: brief accepted · submission sent · decisions confirmed ·
  round booked · write-up in · hire selected · pack handed over · role closed,
  plus the doorway confirmations (booking, consent, reference, rights).
- **Verify:** every seam shows a receipt whose "now owned by" matches the
  header's owner on the *other* hat.

### Wave 3 · Today and the HM home (design + code)

- Recruiter `/agencies` becomes the Today queue: groups by who is blocking,
  each row from `nextAction()`, real counts, no cap at three. The old sections
  move to `/agencies/roles` (list) and a Reports page later.
- HM `/hiring` becomes one card from `nextAction('hiring')` + "your roles at a
  glance". Interviews and diary live under the role.
- **Verify:** with three roles in three phases, each appears in exactly one
  group, and its CTA opens the screen the next action names.

### Wave 4 · Process hardening (schema where needed)

- Decisions-complete action (route + audit + receipt). Booking sub-states.
  Handover checklist table (`agency.handover_items`, audit-coupled, no
  authenticated writes). Proxy-hire rule. Outcome chips.
- Migration to staging first, before the code that reads it.
- **Verify:** golden path and the exceptions (decline all, no-hire, cancel,
  fall-off, expired link) by hand on staging; tests for every gate.

### Wave 5 · The recruiter's brief, and the matched list

_Rewritten 3 Sep after Ose's clarification: the brief is not a matching
feature, it is the job description with all its details, and it is now the
recruiter's to create rather than the hiring manager's. And for consumer
matching, the recruiter should see the list of Tailr users who will be
scanned and who meet the score._

**5a · The brief is the recruiter's job description**

Step 01 intake already takes a JD, company context, salary band, location and
constraints. It becomes *the brief*: one recruiter-side form that is the job
description with everything around it. Fields, taken from the hiring
manager's form so nothing is lost: title · client (a `client_contacts`
company, or free text until a clients table exists) · JD (paste or the
existing 10 MB upload, text only, never stored as a file) · mission ·
must-haves · nice-to-haves · comp · location and work mode · planned rounds ·
start target · client contact. Saving mints the role through the same
conversion contract the HM path uses (`BRIEF_CONVERSION_COLUMNS`, so the JD
cannot silently vanish again) and lands on step 02 parse.

The hiring manager's "Post a brief" stays as a secondary path: a client can
still send one, it lands in the inbox, and accepting it pre-fills this form
rather than minting a role on its own. It drops out of the HM nav's primary
slot (Home · My roles keep it reachable from a role's Overview). Nothing is
deleted; the origin just moves to the desk that owns the process.

**5b · The matched list, shown to the recruiter**

What exists: publishing a role for matching scans every opted-in consumer's
evidence bank, writes a `role_recommendations` row per person with score and
evidence map, and shows the match to the person only. The recruiter sees
`lastScanAt`, `scanQueued` and a rounded bucket, never who.

What Ose wants: on the role, the recruiter sees the list of people who meet
the minimum score. That reverses a promise the settings screen makes today in
these words: "A role that matches you is shown only to you. The agency is told
a rounded count, never who." and "nobody sees you unless you choose to apply."
So it is built behind a **new, third consumer opt-in**, and shows only people
who turned it on:

- **`discoverable`**, "Let recruiters see me when a role matches". Off by
  default, its own copy version, moved only through `setConsent()` so the
  consent event and the flag are written together, revocable, and the list is
  derived live so revoking removes a person from every role at once. The two
  existing switches keep their wording and their promise: someone who leaves
  the third off is still shown only to themselves.
- **The list lives on step 03 Candidates** as its own panel, "Matched on
  Tailr", above the pool: the scan's process first (queued → scanning → last
  checked <time>, from the status the route already returns), then the rows.
  A row is the projection the person consented to: name, headline, location,
  score band and the evidence cards mapped to the role's requirements, with
  MISSING shown as MISSING. No CV, no contact details, no other roles they
  matched. Sorted by score, never ranked ordinally on screen (bands, as
  everywhere else).
- **One action per row: Invite to apply.** It marks the recommendation
  `invited`, so the person's `/found` card says "the recruiter at <agency>
  invited you", and it is audit-logged. The CV, contact details and the
  candidate row on the role still arrive only when the person applies.
  Applying remains the consent for the file; discoverability is the consent
  for the listing.
- People who match but are not discoverable stay in the rounded bucket, as
  now. The panel says so: "and N more who match but have not chosen to be
  seen", to the bucket's precision, never finer.

**Schema:** `match_preferences.discoverable boolean default false` +
`discoverable_at`; `role_recommendations.state` gains `invited` (state guard
trigger updated: a client still cannot set it); a service-role RPC
`agency.matched_people(role_id)` that joins recommendations to the opt-in and
returns the projection, execute granted to service_role only, so the wall
stays structural rather than a filter in a route. Migration to staging first.

**Gate:** this is a new purpose for consumer data and needs its own line in
the DPIA and a copy pass on the settings screen (the "never who" sentence is
rewritten to describe the third switch). Ose has confirmed the direction;
the consent copy still goes past a lawyer before a real user sees the switch,
same as the capture consent.

**5c · The process, visible to the person too** (small, kept from the
earlier draft): a strip on their `/found` card, from facts they are entitled
to: a role found you → invited → you applied → with the recruiter →
shortlisted → interview → decision. Dated, one line for the current step, no
other people, no unreleased client decision.

**Verify:** one consumer account with the third switch on and one with it
off, both above the score on a recruiter-authored brief published for
matching. The recruiter sees exactly one row and "and 1 more who has not
chosen to be seen"; invites the row; the person sees the invitation on
`/found`, applies, and appears in the pool as "Matched · applied themselves".
Turn the switch off and reload the recruiter's screen: the row is gone.

### Wave 6 · Copy and measurement

- The copy table above applied across both hats and the doorways.
- `web-design-guidelines` pass on every touched screen, desktop and mobile.
- Success measures from the review, wired into the dashboard route's timings:
  brief accepted → submission; submission → all decisions; slot offered →
  booked; decision → pack delivered.

## Definition of done for the whole plan

- Every consequential action shows a receipt and writes an audit row.
- A user on either hat can say, from the header alone: phase, sub-state,
  owner, who they are waiting on, and what they do next.
- No link in either nav bounces; deep links and reloads keep context.
- No screen says AI, automatic, or shows a sparkle.
- Booking, availability and decisions-complete are distinct, exactly named
  states. Handover cannot be delivered with an unresolved mandatory item.
- Each persona still receives only its projection; nothing new is disclosed.
