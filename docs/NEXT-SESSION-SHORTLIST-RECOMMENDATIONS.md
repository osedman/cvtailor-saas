# Next session: recommendations on the compare board

_Written 19 September 2026, at the end of the session that seeded ROL-2417 and
built the matching window._

## What Ose asked for

> At this point of the process, the AI should be able to suggest who to
> shortlist based on the screening call and the final scores. There should be
> another tab with the recommendations and insights based on the input of the
> screening call.

Step 05, the compare board. A second tab beside the matrix carrying a
recommendation — who to shortlist — and the insight behind it, drawn from what
the recruiter wrote during the screening calls plus the scores.

## Read this before designing it

**This is the most dangerous feature in the product**, and it is dangerous in
a specific way: it is the first surface where software would offer an opinion
about a person rather than a fact about their evidence. Everything Tailr sells
rests on the opposite claim — *"we structured what you told us, you decide"* —
so the difference between a good version and a version that destroys the
argument is entirely in the framing.

The lines that cannot move, all of them already enforced elsewhere:

- **No automatic rejection, ever.** A recommendation may not decide, filter,
  hide, reorder-into-oblivion, or pre-select. `decisions` stay empty until a
  human presses something.
- **No inference about a person.** No tone, sentiment, confidence, fluency, or
  "culture fit". The EU AI Act draws its line around exactly this in hiring,
  and `docs/LEGAL-REVIEW-PACK.md` §5 states publicly that we do not do it.
- **Every claim traces to something the recruiter can see** — a quote from the
  CV, an answer they typed on the call, an override they made, or an explicit
  `MISSING`. A recommendation that cannot show its working is not shippable.
- **`MISSING` is never filled with inferred content.** The DB constraint
  `evidence_quote_iff_present` enforces it in both directions; the
  recommendation must respect it in prose too.
- **Ose's word, not ours**: the call notes are HIS judgement. The feature
  should read as *"here is what you wrote, gathered up"*, never as the machine
  having formed its own view of somebody.

## What it has to work with

All of this already exists on the compare board:

- **Five score components** per candidate — requirement coverage, evidence
  strength, seniority calibration, context fit, confidence/completeness — with
  their weights, plus the before → after the screening call (91 → 97).
- **Must-have coverage**, e.g. 5/5, and the top unmet requirement
  ("R07 unevidenced: Infrastructure as code").
- **The screening call itself**: `candidate_reviews.call_answers` (probe
  questions keyed by question id, never array index) and `notes`.
- **Recruiter overrides** in `review_overrides`, attributed and audit-logged.
- **Evidence** with verbatim quotes and source citations.

The call answers are the new input. The scores were always there; what makes
this worth building is that the recruiter's own words from the call have never
been gathered anywhere.

## Suggested shape, to argue with

A tab, not a replacement — the matrix stays the default. Then per candidate,
in the recruiter's own material:

- **What your call confirmed**: probe answers that corroborate evidence.
- **What your call contradicted**: where a call answer sits against the CV.
  Note the `round-delta` precedent — the lane there is **REVISITED, not
  CONTRADICTION**, because deciding two statements conflict is a judgement
  about meaning and judgements belong to people. A test asserts "contradict"
  never appears on that item. The same reasoning almost certainly applies here.
- **What is still unknown**: must-haves with no evidence and no call answer.
  The strongest thing this feature can do is say what nobody has asked yet.
- **A suggested grouping**, not a ranking: who clears every must-have, who has
  a specific gap, who was not asked about it. Ose's phrase was "suggest who to
  shortlist" — the safest reading is *sorting the deck by what is known*,
  leaving the decision untouched.

## How to start

1. **Figma first** — repo rule, and this one especially deserves a frame
   before code. Frames 14–18 are the recent house style: 1840 wide, vertical
   auto-layout, 64 padding, 36 gap, bands `#fdfcf9` on `#f9f6f0`.
2. Ask Ose the framing question the feature turns on: does the tab **suggest a
   shortlist** (naming people) or **organise what is known** (naming gaps)?
   Those are different products and only one of them is defensible without a
   lawyer looking at it again.
3. Check whether this needs a line in `LEGAL-REVIEW-PACK.md` §5 before it
   ships. It probably does: "no automated decision-making" is currently a
   clean claim, and a shortlist suggestion is the closest thing to one that
   has ever existed here.

## Where staging is, right now

- **ROL-2417 · Senior Data Engineer — Patient Platform** — 10 requirements (5
  must), **10 candidates, 100 evidence rows, 0 reviews**. Parked exactly at
  step 04, screening calls, which is the input this feature needs. Scores run
  91 down to 38, and the must-have coverage varies 3/5 to 5/5, so the compare
  board has something real to show.
- **ROL-2418 · Senior Business Analyst — Automation & AI** — no candidates,
  published for matching, requirements written against Ose's own consumer
  profile so the matching window has something to find.
- Both carry the Meridian Health contact, so the hiring-manager side works.
- Migration `20260918120000` (interview settings agency default) is applied and
  verified. `ANTHROPIC_API_KEY` in `.env.development.local` is now a real key,
  so ingestion and scans run locally.

## Still open from earlier sessions

- **The seven panes are one component.** 3,045 lines, 49 pieces of state. The
  typing path was fixed (refs and a debounce); splitting the panes is the
  structural fix and has not been done.
- **The orphaned-CV sweep.** Three routes still orphan storage objects — a
  failed removal inside the purge path, cascades from role deletion, and clones
  sharing a blob. Ose's call: before the first real candidate, not before the
  walk.
- **The DPIA and the legal pack** are drafted and waiting on a lawyer.
- **Nobody has walked the loop signed in.** Still true.
