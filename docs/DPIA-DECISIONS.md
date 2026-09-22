# DPIA decisions log

Every decision in this project that changes **what personal data is disclosed,
to whom, or for how long**. Newest first.

A decision is logged here whether or not it has been reviewed — the point is
that nothing of this kind happens without a written record a reviewer can pick
up cold. **OPEN** means it is built and running on staging and has NOT been
through legal / DPIA review. **CLEARED** means it has.

A scheduled task emails Ose the OPEN items every Sunday at 17:00, so the list
cannot go quiet just because nobody opened this file.

> Nothing in this log may contain candidate names, emails or CV text. Refer to
> people by their ref (CAN-01).

---

## 2026-09-22 · The hiring manager sees the name, the evidence and the CV

**Status: OPEN** — built on staging, no DPIA, no legal review.

**Decided by Ose**, 22 Sep 2026, explicitly and against the existing rule:
this is how recruitment works today. A hiring manager reads the CV and the
evidence and decides from them; a product that withholds both is describing a
market that does not exist.

**What changed.** `lib/agency/client-auth.ts` said, in a boxed comment, that a
client must never be returned `candidates.full_name`, `cv_storage_path`, any
CV text, or any `candidate_evidence` row — and that needing otherwise would be
"a product decision with a DPIA attached". That rule is now:

| Data | Before | After |
|---|---|---|
| Candidate's name | Ref only (`CAN-01`) | Disclosed through a submission, unless the candidate asked to be withheld |
| Evidence quotes | Never | Disclosed through a submission, capped at 24 rather than 3 |
| The CV | Never, in any shape | Disclosed through a submission, as **text with all contact details stripped** |
| Email, phone, links, postcode | Never | **Still never** |
| The CV **file** (`cv_storage_path`) | Never | **Still never** — the text only |

**How it is constrained.**

- A sixth disclosure switch, `cv`, frozen into the submission snapshot at
  generation like the other five. **Defaults ON for new submissions** (this is
  the normal case) and **reads OFF for any snapshot that predates it** — a
  submission sent under the old promise is not retroactively widened. Guarded
  by tests in `lib/__tests__/client-shortlist-disclosure.test.ts`.
- Contact details are stripped by `lib/agency/cv-disclosure.ts`
  (`redactContactDetails`, version `v1-2026-09-22`): emails, UK and
  international phone numbers, personal links, UK postcodes. 19 tests probe
  both directions — what must go, and what must survive (dates, salaries,
  headcounts, versions, the city, the name).
- **Served live, never frozen into the snapshot.** `agency.purge_candidate()`
  nulls `candidates.cv_text`; a copy sealed inside a `submissions` row would
  outlive the erasure it exists to honour. The frozen part is the decision,
  not the document.
- `candidates.redacted` outranks the switch, checked twice — against the
  snapshot and against the live row at serve time, so a candidate who
  withdraws after the submission was sent is withheld from that moment.
- **Every view writes an audit row** (`cv_viewed_by_client`) naming the
  contact, the submission and the redaction version, in the same operation.
  If the audit write fails, the CV does not go.
- Route: `app/api/hiring/roles/[roleId]/candidates/[candidateRef]/cv`. Scoped
  to the submission, never to the ref — refs repeat across roles.

**What a reviewer needs to decide.**

1. Is the Art 14 notice at ingestion accurate now? It must say the CV may be
   shown to the client. **It has not been updated** — this is the largest
   open gap.
2. Is "text with contact details stripped" the right disclosure, or does the
   client need the original document? Stripping is also commercial: a client
   who can ring the candidate can cut the agency out of its fee.
3. Retention: the client sees the CV live, so erasure works — but does the
   client's own copy (what they read, printed or pasted) need addressing in
   the terms of business?
4. Does the audit row need to be surfaced to the candidate under a subject
   access request, and in what form?

**Where it is implemented.** `lib/agency/cv-disclosure.ts`,
`lib/agency/client-auth.ts` (the rule block), `lib/agency/client-shortlist.ts`
(the switch and the evidence cap), `app/api/agency/roles/[roleId]/submission/route.ts`
(freezing the switch), the CV route above, `components/agency/hm-candidate.tsx`.

**Migration:** none. The switch lives in the snapshot JSON.

---

## Earlier decisions, logged retrospectively on 22 Sep 2026

These were taken before this log existed and are recorded here so the weekly
reminder covers everything, not just what came after it.

### Capture, transcription and per-round enrichment — **OPEN (gate)**

Built behind a gate and deliberately not shipped: `round_artifacts.kind` has
no `transcript` writer and the `agency-recordings` bucket does not exist. The
consent copy is written (`docs/CONSENT-COPY-DRAFT.md`) and has never been sent
to a real candidate. Blocked on the DPIA and a lawyer pass. Unchanged.

### The AI Act question — **OPEN**

`docs/LEGAL-REVIEW-PACK.md` §8.4. Tailr scores candidates against
requirements with verbatim evidence and refuses any inference about a person
(no tone, sentiment, confidence or fluency). Whether the scoring itself is
high-risk under the EU AI Act is the unanswered question.

### Art 14 candidate notice at ingestion — **CLEARED in design, LIVE**

Notice fires at ingestion plus `notice_delay_days` (default 7, hard cap 28),
and cannot be switched off. **See item 1 above: its content is now out of date
and that is an open action.**

### Retention on the hire — **OPEN, needs Ose**

Closing a role starts retention on the person who was hired too, and
`placements.candidate_id` cascades, so the purge deletes the placement record
— fee and rebate window with it. Either exempt the hire from retention or make
the placement survive with `set null`. Needs a migration in tailr-staging.
