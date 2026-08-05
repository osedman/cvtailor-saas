# Tailr Strategy Meeting — Recruitment Arm

**Date:** 5 August 2026
**Attendees:** OJ (chair), Ose (product — POC demo), Yemi (recruitment domain expert; works in executive search)
**Mentioned, not present:** Temi (UX/UI designer, joining a follow-up workshop)
**Source:** call transcript (names/spellings normalised from auto-transcription)

---

## TL;DR

- Yemi validated the recruitment POC end-to-end. The strongest signal of the
  meeting: the recruiter-override + write-up flow is *exactly* how her firm
  works today, and consultant write-ups are what actually move client
  decisions — especially for senior roles.
- Five concrete feature asks came out of her walkthrough: a cross-role
  candidate repository, screening depth tiered by seniority, streamlined
  background/social checks, an interview scheduler, and three-stage client
  reports (long list / shortlist / panel).
- Commercial direction agreed in outline: free for candidates, platform not
  charged to hiring-manager clients initially (it's the differentiator that
  wins recruitment contracts), placement fees first, then license the platform
  to established recruitment agencies as the main revenue play.
- Next: Yemi reviews the POC and files notes, then a redesign workshop with
  Temi (demo of consumer Tailr + POC + Yemi walking the end-to-end process).
  Build starts after that. Check-in next Friday (30 min).

---

## 1. Context

Candidates continue to arrive through the consumer Tailr app (people are still
reaching out about PM roles). Flow: they create a profile, upload a CV, get
skill-gap analysis and a career path. The recruitment arm then has visibility
of those profiles; when client job requirements come in, they're entered into
Tailr and matched against candidates with a gap analysis (90% match, 50%
match, etc.).

Yemi opened with a view from inside the industry: clients often have a
preferred candidate before the process starts, and everyone else is going
through the motions — enormous candidate effort spent on outcomes that were
never available. Context for why an evidence-first, fair-process product has
room to matter.

Positioning restated by OJ: **"we have the AI doing the work, but we have the
recruiters in the loop"** — the AI does initial screening and gap analysis;
the recruitment partners validate and have the final say. A 90% score can be
put aside after one conversation; a 70% candidate who interviews well can go
forward.

## 2. POC walkthrough (Ose)

One role, one company, multiple candidates:

- Job description as the main source; recruiter notes and client context
  alongside. The app extracts requirements; the recruiter adjusts them and
  sets importance (must / important / nice — "almost like a MoSCoW"), plus
  constraints. This drives scoring.
- Weighting model (requirement coverage weighted highest, then evidence
  strength, seniority, etc.) mirrors how a recruiter reads a CV against a JD.
  OJ flagged that **Yemi's input should calibrate these weights**.
- Candidates: add/remove CVs (up to a handful per role), automatic scoring,
  ranked matrix, per-candidate drill-down showing strong / transferable /
  partial / missing evidence per requirement, score breakdown by category.
- Recruiter override demoed: the system says 92% high confidence; the
  consultant who actually spoke to the candidate adjusts it — Yemi confirmed
  this mirrors her firm's process exactly (screening → shortlist →
  consultant interviews → write-ups that inform the client decision).
- Output: client submission as summary view, document, email, or portal link
  (client can accept for interview, ask questions, see evidence).

## 3. Yemi's domain input

**Consultant write-ups are the differentiator.** Clients decide on CV + cover
letter + the consultant's write-up — and for senior roles the write-up moves
the needle most, because CVs can't convey the full breadth of a person and
"anyone can put anything on a CV."

**Screening depth should scale with seniority.** Junior roles (e.g. project
coordinator): skills/experience match is nearly enough; keep it light. Senior
roles (director/C-suite): a consultant conversation before anything reaches
the client, possibly multiple screeners in the loop. Suggestion: freelance
specialist consultants engaged per-screen rather than retained — more
cost-effective. Agreed direction: **recruiter stays in the loop for every
role**; the depth of that loop varies.

**Cross-role candidate repository.** Her current platform context: "Ezekia"
(exec-search CRM) plus several other tools. The ask: when Tom scores low for
this role, surface that he fits a *different* open role; and when a new role
comes in, screen it against the existing candidate bank before posting
anywhere. OJ's view: the candidate bank + instant gap analysis **is the USP**
("we have a bank of candidates and any job description… we do the gap
analysis off the bat"). Consumer-app users naturally feed this pool.

**Background checks (senior roles).** Social media checks, criminal-history
checks, digital footprint — required at exec level, currently slow ("weeks").
Wants it incorporated/streamlined.

**Interview scheduler.** Hiring managers import availability; shortlisted
candidates self-book; platform sends invites/links. Removes the
back-and-forth her project coordinators currently absorb.

**Three-stage client reporting.** Her firm delivers: **long list report**
(first-stage: all candidates' CV + cover letter + consultant write-up in one
document), **shortlist report** (second stage), **panel report** (final
stage). One document per stage with everything the client needs in one place.
Ask: auto-generate these, ideally client-accessible ("download PDF once this
stage is finished"). OJ: reporting likely lives on the client-side view;
platform becomes end-to-end with different persona views.

**Trust framing (OJ):** the human-validation layer is what keeps hiring
managers paying for the service rather than "just going to ChatGPT."

## 4. Commercial strategy (Yemi + OJ)

- **Candidates: free.** Non-negotiable for liquidity now; a candidate
  subscription is a much later phase (only once value stories exist).
- **Hiring-manager clients: don't charge for the platform initially.** The
  platform is the pitch that wins recruitment contracts — clients don't care
  how many tools an agency uses; they care that the agency is more efficient.
- **Phase 1 revenue: placement fees** earned by the recruitment arm using the
  platform ourselves.
- **Phase 2 (the big prize): license the platform to established recruitment
  agencies** once there are enough case studies ("we placed N candidates for
  these companies"). For agencies currently juggling multiple platforms, one
  all-encompassing system "changes the game." Two income streams eventually:
  agency licences + candidate subscriptions.
- Yemi (business development background) will draft the recruitment +
  commercials strategy: phase 1 targeting, and the later sell-to-agencies
  motion.

## 5. Decisions

1. Recruiter-in-the-loop for **all** roles; loop depth scales with seniority.
2. Free for candidates; no platform charge to clients in phase 1; placement
   fees first; agency licensing later.
3. Design before build: redesign workshop with Temi precedes the app build;
   Yemi's written feedback precedes the workshop.
4. Yemi joins the Trello board and the sprint cadence.

## 6. Actions

| Owner | Action |
|---|---|
| OJ | Send Yemi the POC link + meeting notes; invite Yemi to Trello; schedule the redesign workshop with Temi; book next Friday's 30-min check-in |
| Yemi | Review the POC; write feedback/notes as a ticket (multi-role scenarios especially) **before** the workshop; draft the recruitment + commercial strategy (phased) |
| Ose | Incorporate the five feature asks into the plan; prep a whistle-stop demo of consumer Tailr (recent career-path changes) + POC walkthrough for the workshop |
| Workshop (OJ/Ose/Yemi/Temi) | Demo consumer Tailr; POC walkthrough at high level; Yemi walks the end-to-end recruitment process; Temi maps the simplified user journey |

**Next meeting:** Friday (30 min, lunchtime) — check-in.

---

## 7. Implications for the current build *(added by Claude, not discussed in the meeting)*

The data layer built this week (migrations 1–5 on staging) already models most
of what Yemi described, and the meeting resolves in favour of several
decisions we'd made speculatively:

- **Validated as-is:** the screening call → override → rescore loop
  (`candidate_reviews` / `review_overrides`) is her firm's consultant
  write-up process; the write-up feeding the client narrative is the
  `notes → submission` path; the portal with per-recipient links and client
  actions matches "client accepts for interview / asks questions"; and
  three-stage reports fit the existing `submissions` model (one snapshot per
  stage — needs only a `stage` label, no structural change).
- **Tiered screening depth** fits `job_roles.seniority` + per-role config; no
  schema change needed for v1.
- **Cross-role repository needs a deliberate decision at the workshop.** Two
  different things are hiding in one ask: (a) re-screening candidates *the
  agency already holds* against new roles — collides with our role-scoped
  retention/purpose-limitation design and would need consent + notice
  changes; (b) matching from the *consumer user pool* — this is exactly the
  sourcing thread we parked on 5 Aug (consent model, cold start), where the
  recommended shape was candidate-initiated per-role opt-in. The
  quick person-to-role analysis we pulled forward is the atomic unit both
  variants build on. Don't accidentally commit to (a) by building (b).
- **Scheduler and background checks pull toward ATS territory** — the design
  handoff's positioning is explicitly *decision-support, not an ATS*.
  Scheduler is a fine later integration. Background checks touch
  criminal-offence data (UK GDPR Art 10) — materially heavier compliance than
  anything currently designed; keep out of v1 and treat as an
  integration/partner feature, not a build.
- **Timeline converges:** they asked for "a few weeks to a month" before
  build; the schema is 5/6 migrations done, and the UI phase was already
  gated on Figma — the Temi workshop slots exactly into that gap. Yemi's
  ticket + workshop output should land before any UI code, which is the
  standing Figma-first rule anyway.
