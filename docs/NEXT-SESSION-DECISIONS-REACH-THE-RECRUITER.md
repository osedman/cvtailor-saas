# Next session: the hiring manager's decisions have to reach the recruiter

_Written 21 September 2026, at the end of the session that walked the interview
loop end to end for the first time._

## What Ose reported

> The hiring manager's decision is not automatically feeding into the agent's
> side, and it needs to. When I selected and made my final decision, I went to
> the agent side and it still has all the candidates from the shortlist. The
> hiring manager's decisions should be reflected — and especially at close-out
> time, this should be automatic.

He is right, and the gap is wider than the close-out screen.

## The facts, from staging, before you design anything

ROL-2417 after two full rounds. **Every round decision has been made:**

| Candidate | Round 1 | Round 2 | What the record should say |
|---|---|---|---|
| CAN-12 | advance | **decline** | Out, after two interviews |
| CAN-17 | advance | **advance** | **The one being taken forward** |
| CAN-21 | **decline** | (cancelled) | Out, after one interview |

And yet, for **all three**:

- `recruiter_reviews.decision` = `'shortlist'`
- `client_actions.action` = `'interview'`

Both of those are **shortlist-stage** facts, frozen before any interview
happened. Nothing that happened in the interview loop has touched them.

## Where it actually breaks

**Round decisions live in exactly one place and go nowhere.**
`agency.round_decisions` is append-only, one row per decision, latest wins.
`lib/agency/handover.ts` reads it (correctly — the pack shows round
provenance). `lib/agency/waves.ts` reads it as of this session, so a declined
candidate is no longer re-invited. **Nothing else does.**

Every recruiter-side surface that asks "who is on this shortlist" keys on
`recruiter_reviews.decision`:

- `app/api/agency/roles/[roleId]/candidates/route.ts:70`
- `app/api/agency/candidates/route.ts:53`
- `lib/agency/role-facts.ts:158`
- `app/api/agency/roles/[roleId]/submission/route.ts:87`

So after two rounds the compare board, the candidates list and the role facts
all still read "3 shortlisted", because in shortlist terms they are.

**Close-out is the sharpest case.** `app/agencies/roles/[roleId]/close-out/page.tsx`
loads `/api/agency/roles/[roleId]/candidates` and offers a picker of **every
candidate on the role** for "who got the job". At that moment the system
already knows the answer: one candidate has `advance` on the final round and
the others have `decline`. It asks anyway.

## The framing question to settle first

**Does a round decision write back to `recruiter_reviews`, or does every
surface learn to read the loop?**

Both are defensible and they are very different products:

- **Write-back.** A round `decline` sets `recruiter_reviews.decision = 'reject'`.
  Every existing screen corrects itself for free. But it **destroys the
  distinction between "the recruiter did not shortlist them" and "the client
  interviewed them twice and passed"** — and `recruiter_reviews` is the
  RECRUITER's own judgement. A client decision overwriting it is the client
  reaching into the agency's record. There is also no machine path that writes
  `'reject'` today, by design: _"There is no machine path that writes 'reject'
  — no automatic rejection, ever"_ (`20260805140000_agency_scoring.sql`).
  **Do not do this without a deliberate decision.**
- **Derived, like everything else this session.** A `stageOf(candidate)`
  helper over rounds + decisions, and the surfaces read it. Consistent with
  the four ladders already unified (`loopState`, `cohortStatus`, the HM
  interviews screen, the round card). More call sites to touch.

The through-line of this whole session says the second. But it is Ose's call,
and it is the first thing to ask.

## What "automatic at close-out" should mean

The signal already exists. `agency.role_decision_completions` records the
client pressing **"I'm done deciding"**, surfaced as `decisionsCompleteAt` and
already outranking every derived rung in `deriveSubState`
(`next-action.ts:314`, "A FACT OUTRANKS AN INFERENCE").

So close-out should open with the answer filled in:

- The candidate with `advance` on the final round is **pre-selected** as the
  hire, named, with the round that decided it.
- Candidates with `decline` are shown as **not advanced**, with which round —
  not offered as the hire.
- The picker stays changeable. **Pre-selecting is not deciding**, and
  recording a placement must remain a human act: _"nothing here may
  auto-close a role — closing stays the recruiter's act, because it starts
  the retention clock."_

## Lines that must not move

- **No automatic rejection, ever.** Reflecting a decision the client already
  made is not the same as making one. Nothing derived here may remove a
  candidate, hide them, or write `'reject'` on their behalf.
- **Declining is a signal, not a removal.** Every candidate stays visible,
  with the reason and the round attached — the rule the shortlist and the
  wave reserve already keep.
- **`round_decisions` is append-only and the latest row wins.** A client may
  change their mind; read the latest, never the first.
- **Scope decisions to the role.** A decision belongs to a round; a candidate
  may sit on two roles. Join through `interview_rounds` — the wave fix does.

## Where staging is

- **ROL-2417** is the fixture: two rounds complete, all decisions made,
  CAN-17 advanced twice. Reproduce by opening
  `/agencies/roles/2de0d926-e45a-4ee8-9eff-ec29879c0dee/close-out`.
- **CAN-21 holds a cancelled round 2** from the wave bug fixed this session.
  Harmless, but it is why the cohort board says "1 cancelled".
- **Two settings are non-default for testing:** `min_notice_hours = 0` and
  `wave_release_hours = 1`. Real values are 24 and 48. Put them back before
  judging pacing.
- **`planned_rounds` is null** on this role. The callers default it to 2 and
  `loopState` now defends itself, but the column is genuinely unset.
- Migration **37** (`20260921090000_evidence_layers.sql`) is applied to
  tailr-staging and verified.

## Still open from this session

- **The wave timer versus capacity.** `planRelease` blocks on
  `waveStillRunning && awaiting > 0` before considering capacity, though the
  module header promises "or when capacity opens". Ose: **fine for now.**
- **"In reserve" counts declined candidates** on the cohort board.
- **Cancelled rounds show on the cohort board** — record, or live state?
- **The AI Act question** in `LEGAL-REVIEW-PACK.md` §8.4, with the lawyer.
- **Capture stays gated.** Recordings were asked for this session and
  declined: no bucket, no transcript writer outside the gated module, and the
  DPIA is the blocker. Enrichment now reads the write-up instead, and
  transcripts should feed that same path when the gate clears.
