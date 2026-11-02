# Next session: everything is built and nobody has walked it

_Written 17 September 2026, at the end of the session that built the archive,
the interview room and the recruiter's loop table._

## Paste this as the opening prompt

> Read `docs/NEXT-SESSION-INTERVIEW-LOOP.md` first, then the `tailr-playbook`
> and `tailr-b2b` skills, before touching anything.
>
> The B2B interview loop is built end to end and has never been exercised by a
> person. I want to walk it on staging. Tell me exactly what to press, in
> order, on ROL-2416 — and where you expect it to break. Do not write code
> until I have walked it and told you what actually happened.

Or, if he has already walked it and is reporting faults, that report is the
task and this file is the context.

## The one sentence that matters

**Nothing here is blocked on code.** Three separate pieces of work were built
for the walk-through this week — seeded windows, the doorway link fix, the
room — and the walk still has not happened. Every hour of building past this
point has a worse expected value than one hour of Ose clicking.

## What shipped 15–17 Sep, in order

| commit | what |
|---|---|
| `3081aa5` | step 06 speaks step 04's language (evidence rows) |
| `ba05b9a` | the HM dashboard answers one question; both brief doors closed |
| `bcc61aa` | Desk health struck; dead-payload guard added |
| `06d24b4` | the booking doorway stopped explaining an absence by guessing |
| `dbecdcf` | windows re-seeded on ROL-2411 |
| `810566e` | **a non-production deployment must not email links to production** |
| `5f13755` | the interview loop rail (a distribution, not a stepper) |
| `80b2af6` | `scripts/seed-walkthrough.mjs` |
| `a25f44a` | a finished role leaves the live table → Archive |
| `e9bcfd5` | **the interview room** |
| `7c57344` | the recruiter's loop table runs the shared ladder |

Figma frames 08–13 on `AWRRbEOX6rLsltutFDL3zs`, all signed off before code.
Frame 13 supersedes 12.

## The walk, and where it will probably break

`ROL-2416` — "AI & Automation Consultant — walk-through" — is a clean clone:
10 requirements, 4 candidates, 40 evidence rows, no rounds, no submission.

1. **Recruiter**: screen the candidates (step 04), compare (05), submit (07).
2. **HM**: shortlist arrives → choose who to interview → offer windows.
   - Windows must clear the role's **minimum notice (24h default)** AND be at
     least as long as the interview. `node scripts/seed-walkthrough.mjs state
     ROL-2416` says what a walker would actually find.
3. **Candidate**: booking link → pick a time.
   - **Any booking email sent before `810566e` deployed points at
     gettailr.com and 404s forever.** Press "Send again" on the cohort board
     to mint a fresh link.
   - Addresses must clear the non-prod allowlist or `sendEmail` refuses.
4. **HM**: the round happens → the room → write-up → decision.
5. **Recruiter**: book the next round, or take it to close-out.
6. **Recruiter**: references → handover pack → deliver → **close the role**.

**Most likely to break first:** step 3. It is the only leg that depends on
email actually leaving the building and on a link resolving on a deployment
that is not production.

## Open decisions — these are Ose's, not the next session's

1. **Per-interviewer write-ups.** `round_artifacts.round_id` is UNIQUE — one
   write-up per round, with no author on it. So "both interviewers have
   written up" is not a thing this schema can say, and the room implies a
   single voice per round. Ose described two people interviewing. **Migration
   + product decision**, and it changes the room's shape.
2. **Chasing a client.** Nothing chases a hiring manager for a write-up or a
   decision. `remindCohortMember` re-sends a BOOKING link and refuses once a
   slot is held. Frame 13 drew a "Nudge" button; it was not built because it
   does not exist. **A feature with an email in it.**
3. **The 24-hour minimum notice.** A real constraint, not a filter. If desks
   book same-day, the default in `interview_settings` is what to change.
4. **`/hiring/briefs/new`.** Both doors are closed; the route still answers.
   The recruiter's briefs inbox can now only ever hold what already exists.
   Delete the route, or leave it reachable by direct URL?
5. **The mobile pass.** Frame 09 is designed and parked. The real defect is
   `.ag-screen-head` having no `flex-wrap`, so the PRIMARY action is off-screen
   at 375px on five workflow screens.

## Two things only Ose can do

- **Set `NEXT_PUBLIC_APP_URL` on the staging environment in Vercel.** The code
  fix means forgetting it degrades to "links point at this deployment" rather
  than "links point at a different product", but explicit is better.
- **Close ROL-2408 and ROL-2410.** They were handed over on 24 August and
  never closed, so **their retention clocks have never started.** They sit in
  the new Archive marked "close it to start retention". Closing is a real act
  with a real consequence for real candidates' data.

## Verification discipline — earned expensively this week, do not relearn it

- **headless Chrome on macOS clamps its window to 500px.** `--window-size=375`
  is accepted silently, the page lays out at 500, and the PNG is cropped. Every
  "clipped at 375" screenshot is a lie. Measure inside an `<iframe width="375">`,
  which gives its document a genuine viewport. A `width:100%` control div
  settles it in five seconds.
- **Curl the served CSS chunk, never read the file.** Turbopack has served a
  stale `globals.css` before.
- **Reproduce the ancestor chain** or the harness lies: `.ag-app` is
  `display:flex`, every token is scoped to `.ag-app`, and `.agd-page` supplies
  the inset. A missing wrapper looks exactly like broken CSS.
- **A probe must visibly mutate the file.** Three guards this week "passed"
  because the probe script itself was broken — `sed` escaping, Python's `rfind`
  vs `lastIndexOf`. Print the mutation and assert it landed.
- **`[^)]*` is defeated by an arrow parameter's own paren.** Twice now.
- **Allow-list, never deny-list, for anything that picks an environment.**
- **`.env.mail.local` holds PRODUCTION credentials** and `loadMailEnv` reads it
  FIRST. `.env.local` here has no Supabase URL at all; `.env.development.local`
  points at staging. Any script parsing env files must say which it means.

## What must not regress

- **The write-up gates the decision**, and the gate reads from the server.
- **The gate on the room is the SUBMISSION, not the role.** A recruiter may be
  interviewing somebody the client was never sent.
- **The plan is never a gate.** A fourth round after three planned is allowed.
- **A decline is a signal, never a removal**, and the candidate is not told.
- **No capture.** `round_artifacts.kind` still has no `transcript` writer and
  the DPIA is still the reason.
- **No SLA anywhere.** An age is not a breach; nothing turns red because time
  passed.
- **No button that cannot do anything.** It has now bitten three times.

## Still open, and not this task

- Lawyer + DPIA + DPA on capture → transcription → enrichment.
- Wave 6's copy pass — the only remaining buildable item in the plan. Its
  measurement half was struck on 15 Sep because two of its four spans cannot
  be measured until somebody walks the loop.
- Production port. There is still **no** agency code on `main`, by design.
