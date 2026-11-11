# Walk-through content — one role, ten candidates

Paste-ready text for seeding a shortlist through the **real** ingest path.

## Why this is content and not a script

Staging holds no roles, no candidates and no CV files, so there is nothing for
`seed-walkthrough.mjs clone` to copy — cloning is that script's whole safety
property, and it has nothing to clone from. The alternative, writing rows
directly, is the thing this repo has learned not to do: hand-written fixtures
produce rows that look like bugs, and invented `score_breakdowns` carry a stale
`inputs_hash` that submission generation is built to REFUSE — so the fixture
would break at step 07, days after it was made, for reasons nobody would
connect back to here.

Pasting is a first-class ingest source (`source: 'paste'`). Text pasted through
the UI runs the same extraction, the same evidence rules and the same scoring
as an uploaded CV, so everything it produces is real: quotes that genuinely
appear in the text, `MISSING` where there is nothing to quote, and a score hash
that matches its inputs.

It also walks steps 01–03, which nobody has walked.

## How

1. **Step 01 · Role intake** — paste `00-job-description.txt`.
2. **Step 02 · Parse review** — check the requirements it pulled out. Ten are
   in the JD, deliberately.
3. **Step 03 · Add candidates** — paste each `can-NN.txt` in turn, choosing
   *paste* rather than upload.

To put one on the clipboard:

    pbcopy < scripts/seed-content/can-01.txt

## What the ten are shaped to test

They are not ten good candidates. A shortlist where everybody matches
everything exercises nothing — the compare matrix, the `MISSING` state and the
recruiter override all need genuine variation to show anything.

- **can-01** covers nearly everything. The obvious yes.
- **can-02** deep dbt and SQL, no streaming, no IaC, no regulated domain.
- **can-03** strong infrastructure and streaming, thin on dbt.
- **can-05** the domain expert: deep healthcare and IG, no streaming, no IaC.
- **can-06** excellent engineer, wrong shape — never used dbt.
- **can-08** a manager who is barely hands-on, and says so.
- **can-09** heavy streaming, uses Dagster not Airflow — a near-miss that
  should NOT read as an Airflow match.
- **can-10** healthcare throughout, batch only.

Several state their gaps in plain words ("I have read about Kafka but not run
it", "we use Dagster rather than Airflow"). That is deliberate: those lines are
a live test of the no-invention rule, because an extractor that turns them into
evidence has just fabricated a claim the person explicitly disclaimed.

## Two things to know before you start

**The email addresses are plus-aliases of Ose's own**, so the non-production
allow-list permits them and nothing is ever attempted against a stranger. That
was the August incident, and these addresses cannot repeat it.

**The Article 14 notice will fire seven days after ingestion, and cannot be
switched off.** Ten notices will arrive in Ose's inbox a week from seeding.
That is the mechanism working, not a fault — and it is a free test of a path
that has never been watched end to end. Set the notice delay on
`/agencies/settings` first if a different window suits the walk better.

**These are invented people.** No real CV is in this folder, and none should
ever be added to it.
