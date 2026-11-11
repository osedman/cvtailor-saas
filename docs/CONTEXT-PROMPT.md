# Tailr — context prompt

Paste this into a fresh session to explain what Tailr is and where it stands.
Written 20 Aug 2026. For working *rules* read `CLAUDE.md`, then the
`tailr-playbook` and `tailr-b2b` skills — this document is the map, not the
operating manual.

---

## What Tailr is

Two products, one Supabase project, one auth pool, two schemas that never mix.

**Tailr (consumer)** — helps a person get hired using only what they have
actually done. Its argument is evidential: every line in a tailored CV traces
to something the person said about themselves, and gaps are shown as gaps
rather than filled with plausible invention.

**Tailr for Agencies (B2B)** — decision support for recruitment agencies.
**Not an ATS.** A recruiter inputs one client role and 3–10 candidates and
gets an explainable ranked shortlist where every score traces to CV evidence,
a recruiter override, or an explicit `MISSING`. Since 13 Aug it also carries
the interview loop: the client posts a brief, offers times, meets people, and
decides.

**The voice, both sides:** "we structured what you told us, you decide."
Never "AI decides", never "auto-hire".

## The non-negotiables

These are enforced in schema and tests wherever possible, not left to memory.

- **No automatic rejection, ever.** Low scores prompt review; nothing hides a
  candidate. Client declines and round decisions are signals, not removals.
- **`MISSING` renders explicitly**, never filled with inferred content. A DB
  constraint enforces missing ⇔ no quote, both directions.
- **No inference about a person.** Verbatim quotes mapped to requirements
  only — never tone, sentiment, confidence or fluency. This is both the
  product's argument and the line the EU AI Act draws around emotion
  inference in hiring.
- **Human override on everything**, attributed and audit-logged.
- **Audit-coupling rule:** any table whose changes must be audit-logged has
  NO authenticated write policies. Writes happen in API routes via the
  service role, in the same operation as the audit row.

## What exists on the consumer side

CV tailoring against a JD (multi-pass, Claude), the **evidence bank** (career
evidence the person banks in their own words), the Career Arc, career paths
and roadmaps, and the tracker.

**Quiet matching** (built 15–16 Aug) is the newest and most distinctive:

- Two separate opt-ins in `/settings` — "roles I never applied to may find me"
  is a different question from "a recruiter who already has my CV may also see
  my evidence", and they revoke independently.
- The scan runs **consumer-side** against published role snapshots. **There is
  no job board** — and that is structural, not a policy: `published_roles`'
  RLS admits a row only if a recommendation for that user already exists, so
  browsing is a query that returns empty.
- `/found` — "a role found you". The person sees the role, the requirements,
  and their own evidence against each one.
- **Applying is the consent.** Until someone applies, the agency sees nobody —
  not even a count. A manifest shows exactly what will be shared before it is,
  and the whole share happens in one transaction with an Art 13 notice.
- **Tailor-first apply** (16 Aug): tailoring against the role's frozen
  requirements, then applying sends that tailored CV — verified sha-identical
  from the editor to the agency's pipeline.

## What exists on the agency side

**Recruiter** (`/agencies`): dashboard · the seven-step role workflow ·
clients · briefs inbox · interviews · close-out · dossier · audit · settings.

**The workflow is SEVEN steps, not six** — `lib/agency/steps.ts` is the single
source of truth. 01 intake · 02 parse · 03 candidates · 04 screening ·
05 compare · 06 candidate detail · 07 submission. Interviews, close-out,
dossier, clients, briefs, audit and settings are **adjuncts**, not steps.

**Hiring manager** (`/hiring`): dashboard · write a brief · availability ·
round write-up and decision · invite accept. HMs hold **zero RLS grants** —
every read is a service-role route shaped by disclosure rules.

**Doorways** (token, no account): `/portal` · `/rights` · `/consent` ·
`/reference`.

### Newest B2B features

- **Interview capture** (17 Aug, gated): the recruiter uploads audio the
  candidate consented to, it is transcribed, a human verifies the transcript
  *and names which speaker is the candidate* — and that single act is what
  releases the recording for deletion. No transcription vendor is wired in;
  choosing one makes it a sub-processor, which is a DPA decision.
- **Intake in one hop** (20 Aug): the hiring manager pastes the JD *with* the
  brief; accepting mints the role with that JD already in intake. The brief
  also carries expected interview rounds and a start target — advisory, never
  a gate.
- **Right-to-work capture** (20 Aug): its own audit-coupled table. Statuses
  are facts (`unverified` / `verified` / `needs_sponsorship`) — there is
  deliberately no "not eligible", and a test proves the field can never
  filter a candidate list.

## Where it stands

**Staging only. Production has never seen a single line of agency code** — no
migrations, no routes — and stays that way without Ose's explicit say-so.

- Staging Supabase: `tailr-staging` (`pwonuqkpumgejqmotkwh`). Always confirm
  the ref before applying anything.
- Migrations 1–24 applied to staging. ~750 tests. Build clean.
- Quiet matching has been **walked end to end by a human on real data**.
- The recruiter interview loop has **not** — that walk-through is the highest
  value hour available.

## What is blocked, and by what

- **The lawyer/DPIA gate** blocks interview capture pointing at a real
  candidate. The consent copy is written and the surfaces are built; it is a
  legal sign-off, not a build task.
- **A transcription vendor** must be named in the DPA before any adapter is
  written. It must do speaker diarization — attributing an interviewer's
  question to the candidate would be a fairness bug.
- **The placement record** — the commercial event the business is paid for —
  is specced and queued but not built. See the `tailr-b2b` skill.

## How to work here

Read `CLAUDE.md` first: Figma is the design source of truth for every UI
change, migrations run manually in both environments before the code that
reads them, and every change gets a row in `docs/PROJECT.md` *and* a Notion
card. `docs/PROJECT.md` (tail) is the running session record and the best
account of why things are the way they are.

**The lesson that keeps paying:** verify the effect, never the status code.
Mocked tests have three times agreed with wrong code that the database
disagreed with. Read the deployed schema, seed real data, and check the thing
that should have changed.
