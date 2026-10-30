# Tailr — legal review pack

**Every consent decision, lawful-basis position and privacy commitment in the
product, in one place · 18 September 2026**

---

## How to read this

Tailr is two products sharing one company and one database:

- **Tailr** (consumer, live at gettailr.com) — people tailor their own CV
  against a job, get an auditable match score, and track applications. Real
  users, real data, live today.
- **Tailr for Agencies** (B2B, **staging only — no production environment
  exists**) — a recruitment agency runs a role: candidates in, evidence-based
  shortlist out, then interviews, references and handover to the client
  employer.

**Nothing in the B2B product has ever touched a member of the public.** It runs
on a staging database with fixture data. That is why this review is happening
now rather than after an incident.

§8 is the list of questions. §9 is the list of things we know are missing.
Everything before that is the evidence.

**The drafting rule throughout:** every claim here is checkable against the
code. Where a commitment is enforced by a database constraint or a test that
fails the build, it says so. Where the honest answer is unflattering, it is
stated rather than dressed.

---

## 1. The four data subjects

Most privacy analysis of a recruitment tool assumes one data subject. We have
four, and three of them never asked to be here.

| # | Who | How their data arrives | Do they have an account? |
|---|---|---|---|
| 1 | **Consumer user** | They sign up and upload their own CV | Yes |
| 2 | **Agency candidate** | A recruiter uploads their CV. **They did not give it to us** | No — and must never need one |
| 3 | **Referee** | A candidate names them. They have no relationship with anyone here | No |
| 4 | **Client hiring manager** | Invited by the recruiter; also recorded in interviews | Yes (invite-only) |

Subjects 2, 3 and 4 reach every doorway through a **single-use token link** —
never a login. Requiring an account from someone whose data you obtained
without asking is a barrier to their own rights.

---

## 2. Controllership across the lifecycle

This is the map we need confirmed or corrected before anything is published to
customers.

| Stage | Controller | Tailr's role |
|---|---|---|
| Consumer product | **Tailr** | Controller |
| Agency uploads a candidate → shortlist → interviews | **The agency** | Processor |
| Client portal — hiring manager views the shortlist | The agency | Processor |
| **Handover to the employer** | **The employer becomes controller** of what they receive | Processor to neither, from that point |
| After handover | Retention clock starts for everyone else | Processor |

**The consequence we most need checked.** If the agency is controller for the
B2B product, then the Art 35 DPIA duty is *theirs*, and our DPIA
(`docs/DPIA-INTERVIEW-CAPTURE.md`) is Art 28(3)(f) supporting material we
publish as a template. If instead we are a **joint controller** — arguable,
since we designed the consent mechanism, fixed the retention behaviour, and
constrain what the client is permitted to see — then the customer contract, the
notices and the liability all change.

**Handover is a controllership transfer, and we treat it as a real event**, not
a download. It is stamped, audited, and it starts the retention clock on
everyone who was not hired.

---

## 3. Every consent-shaped surface in the product

Eight of them. Three are consent in the Art 6(1)(a) sense; the rest are
transparency, opt-in toggles, or access control that is often mistaken for
consent. Distinguishing them is half the review.

| # | Surface | Is it consent? | Lawful basis as built | Status |
|---|---|---|---|---|
| 3.1 | Consumer account & CV tailoring | No | Contract | **Live** |
| 3.2 | Recruiter visibility opt-in | Yes | Consent | **Live** |
| 3.3 | Quiet matching / applying | Yes — the application *is* the consent | Consent | **Live** |
| 3.4 | Art 14 candidate notice | **No** — transparency duty | Legitimate interests (the agency's) | **Live, staging** |
| 3.5 | Right to represent | Yes, contractually; not the GDPR basis | Legitimate interests + a specific permission | **Built** |
| 3.6 | Interview capture | **Yes — the hard one** | Consent | **Gated, never used** |
| 3.7 | Referee fair-processing notice | No — transparency | Legitimate interests | **Built** |
| 3.8 | Client portal access | No — access control | n/a | **Built** |

### 3.1 Consumer account and CV tailoring — LIVE

The user uploads their own CV and asks us to tailor it. Basis is performance of
a contract. Anthropic is the sub-processor for the AI passes and is named in the
privacy policy.

**Gap: there is no Terms of Service.** There is a privacy policy at `/privacy`
and no terms anywhere in the product. See §9.1.

### 3.2 Recruiter visibility — the bridge between the two products — LIVE

A consumer user may opt in to being visible to recruiters. **Off by default,
revocable, and engineered so that revocation is real rather than cosmetic:**

- There is **no table** recording "this candidate is also a Tailr user". A
  stored link of that kind would itself be the disclosure. Agency code never
  caches match results, so revocation takes effect on the next fetch.
- **Matched-but-not-opted-in is byte-identical to unmatched.** Both return null
  from the same code path — no flag, no distinct error, no timing difference a
  recruiter could read as a signal that someone exists but has said no.
- One function is the only door between the two schemas, and it is
  service-role-execute-only.
- It exposes the user's career summary and evidence bank. It **never** reads
  their private roadmap (their own view of their weaknesses), their first-CV
  drafts, their subscription or their usage logs.
- If a user revokes, evidence derived from their profile is deleted and the
  candidate is rescored — the basis goes, everything derived from it goes.

### 3.3 Quiet matching — LIVE

Role-first only. A recruiter publishes a role; the **candidate alone** sees that
they match it. The recruiter is not told a match exists. **Applying is the
consent** — nothing is disclosed until the candidate acts. There is no
person-scoped scan, by design.

### 3.4 The Article 14 candidate notice — LIVE on staging

A candidate whose CV a recruiter uploaded did not give it to us. Art 14 applies.

- **Scheduled for day 7** after ingestion (configurable, hard-capped at 28), and
  **the auto-fire cannot be switched off.** That is the entire value: an
  optional notice is a checkbox no agency can point to in an audit.
- In the window the recruiter may send early, add a personal line, or record
  *"already informed by other means"* — which suppresses the send but **writes
  an audit row**, placing the assertion on the agency rather than hiding it.
- **Good news first.** It opens with the fact that they are being considered for
  a role. Rights and retention sit below. The normal candidate experience is
  silence.
- **The client company is not named** by default.
- **No marketing use, ever.** The landing page is not an acquisition funnel —
  repurposing legally-obtained contact details is a purpose-limitation breach
  and would discredit the feature.
- **No contact details** (redacted CVs, scraped listings) → recorded as
  suppressed with a reason, relying on the Art 14(5)(b) disproportionate-effort
  exemption plus the agency's own public notice. Never silently skipped.
- A **suppression list** keyed on a hashed identity means a re-upload after an
  objection or erasure does not re-notify or re-process.

**An operational incident worth disclosing.** In August, 23 of these notices
were found queued against real people's addresses on the *staging* system,
because staging carries real CVs as fixtures and the notice cron deliberately
has no skip switch. They were suppressed before sending; none went out. We then
built a hard allow-list so no non-production environment can email anyone
outside a short internal list. We raise it because it is exactly the kind of
near-miss a reviewer should hear about unprompted.

### 3.5 Right to represent — BUILT

The candidate's answer to "may we put you forward to this employer?" — a
recruitment-practice permission distinct from the GDPR basis. Versioned copy,
timestamped answer, audited.

### 3.6 Interview capture — GATED, and the reason this review is happening

Full assessment: **`docs/DPIA-INTERVIEW-CAPTURE.md`**. In short: if the
candidate agrees, interview audio is recorded and transcribed so the recruiter
can quote what they actually said against the role's requirements, instead of
paraphrasing from memory hours later.

**Nothing has ever been recorded.** No transcription vendor is selected, named
or wired in — the provider is an interface with a synthetic implementation, so
the entire pipeline is built and drillable while audio has nowhere to go. We
stopped deliberately at the sub-processor decision because it is yours, not
engineering's.

The hard question is §8.1: **can consent be freely given by someone who wants
the job?** What we built to try to earn it rather than assert it:

- Declining changes nothing — same interview, same time, same people.
- **The interviewers are never told what the candidate chose.** Enforced in
  code: the client-facing payload omits the consent fields, and a test fails the
  whole build if they ever appear.
- Withdrawal works before, during and after, and actually deletes — the
  recording, the transcript, and every piece of evidence drawn from them, then
  the candidate is rescored.
- Audio is deleted the moment a human verifies the transcript. The promise and
  the act are the same event.
- No pre-selection anywhere; the email's buttons select nothing, so a mail
  client prefetching links cannot consent on someone's behalf.

### 3.7 The referee — BUILT

A referee never applied for anything. Their name, email and words are personal
data collected from a third party, so the fair-processing notice goes out **in
the same operation as the request** — the request cannot be sent without it.
Their words are stored **verbatim and attributed**; a summarised reference is
one nobody can stand behind. Declining to give a reference carries the same
visual weight as agreeing.

### 3.8 The client portal — BUILT

**Per-recipient tokens, not one shared link.** With a shared link, a forwarded
email means an unknown party can approve a candidate and the audit log records
"someone with the link". Per-recipient tokens make every action attributable to
a named contact and let one person's access be revoked without killing
everyone's. Tokens expire, are individually revocable, and the raw value is
shown once.

The client sees the shortlist and the evidence behind it — **never** the
recruiter's internal working, rejected candidates, or evidence overrides.

---

## 4. Retention and erasure

- **The clock starts when the role closes**, not at upload. Candidates are
  role-scoped precisely so this is an enforceable rule rather than a per-row
  judgement. Default **180 days**, per agency.
- **Closing a role is a deliberate human act** with a real consequence, and
  nothing automates it — because it starts the retention clock on real people's
  data.
- **One erasure path.** A single function is the only way data is erased,
  whether triggered by a rights request or the scheduled purge. It returns the
  storage paths so deletion takes the actual files, not just the database rows.
- **The audit log survives erasure, deliberately.** It records that a person was
  considered and what was decided — refs and decisions, never CV content. The
  candidate reference in it has no foreign key specifically so that erasing
  someone does not erase the record that a decision was made about them. **We
  would like this confirmed as the right balance** between Art 17 and the
  agency's need to evidence a fair process.
- **Rights requests** (access, rectification, erasure, objection) share one
  queue, reachable from the candidate notice without an account. **Fulfilment is
  currently manual.**

---

## 5. No automatic rejection — the product's central commitment

**No candidate is ever automatically rejected, filtered, hidden or
deprioritised, anywhere in the product.** This is enforced in the schema and
tests, not only in policy:

- Low scores prompt human review; nothing acts on them.
- A client pressing *decline* is **a signal to the recruiter, not a state
  change** — no code path turns it into a removal, and the candidate is not told.
- A failed CV parse or a redacted CV never removes anyone from the list.
- Every score traces to a verbatim quote, a named recruiter's override, or an
  explicit `MISSING`. A database constraint enforces that `MISSING` can never
  carry inferred content, in both directions.
- Overrides never edit the evidence; they are recorded separately, attributed
  and audited.

**No inference about a person, ever.** No tone, sentiment, confidence, fluency,
accent or hesitation analysis exists or is planned — both because it is the
product's argument and because it is the line the EU AI Act draws around
emotion inference in hiring.

Our position is that there is **no Art 22 automated decision-making** here. We
would like that confirmed, along with a view on whether the EU AI Act's
high-risk employment provisions are engaged at all (§8.4).

### 5.1 The shortlist recommendation — the hardest thing in this pack

**Added 19 September 2026, staging only, and it has never been run against a
real candidate.** We are flagging it ourselves because it is the single
feature in the product that most threatens the claim made immediately above,
and we would rather it were reviewed than discovered.

**What it does.** On the compare screen, a recruiter may press *Recommend a
shortlist*. A model reads the answers that recruiter typed during their own
screening calls, together with the evidence scores, and returns every
candidate on the role sorted into three named groups — *Recommended*, *Worth
a second look*, *Not recommended yet* — each with a one-sentence reason. It
exists because a recruiter can read a matrix of ten candidates and cannot
read one of fifty.

**It names people.** That is the difference from everything else in this pack,
and we are not going to soften it. Until now the product organised evidence
and left every judgement about a person to the recruiter. This orders people
into groups, and the top group is, in substance, a proposed shortlist.

**Why we say Art 22 is still not engaged.** The recommendation produces no
decision and no effect. It writes nothing: the shortlist / hold / reject
controls are on a different screen, `recruiter_reviews` is untouched by the
route, and a test fails the build if that route ever contains an insert,
update or delete. Nothing downstream reads the grouping — the client
submission, the interview loop and the handover pack are all built from
recruiter decisions, never from this output. A candidate's position in it has
no consequence unless a human acts, and the human acts elsewhere.

**Why we are not satisfied by our own answer.** The live question is not
whether a human is in the loop but whether their involvement stays
*meaningful*, and a recruiter under time pressure at fifty candidates may
simply shortlist the top group. We have designed against rubber-stamping
rather than asserted it away:

- **Nothing is filtered, hidden, reordered away or pre-selected.** All fifty
  candidates remain on the matrix in the recruiter's own order. A group is a
  label with a stated reason, never a removal, and a test asserts that every
  candidate handed in comes back out exactly once — one the model omits is
  added to the third group rather than disappearing.
- **The third group is "not recommended *yet*"**, and the adverb is enforced:
  the word "rejected" does not appear in the feature, by test.
- **Every reason is traceable to a source the recruiter can open** — a
  verbatim CV quote, an answer they typed, an override they made, or an
  explicit `MISSING`. Reasons are not free prose: the model selects citations
  from a list computed from the actual rows, anything invented is discarded,
  and a reason left with no surviving citation is replaced by a factual line
  generated from the record. An untraceable recommendation cannot be
  displayed.
- **`MISSING` is never filled.** Where nothing is evidenced, the output says
  so and stops. Its most useful sentence is that a requirement has not been
  asked about by anyone.
- **No inference about a person reaches the model.** It is never given a
  candidate's name, and it is never given the two fields in our schema that
  rate a person rather than their evidence (a recruiter's optional 1–5
  communication and motivation stars) or the call questions about motivation
  and availability. A test that scans the source fails the build if any of
  them is ever sent. The commitment in §5 above — no tone, sentiment,
  confidence or fluency analysis — holds here unchanged and is additionally
  enforced by a language filter that discards any reason describing a person.
- **Asking for one is audited**, with the role reference, the recruiter and
  the time. The audit row deliberately carries counts only: no name, no
  reason, no group.

**On the EU AI Act, our position has changed and we want to say so plainly.**
§5 and §8.4 record our belief that the high-risk employment provisions are
not engaged. That belief was formed about a product that structured evidence.
A system that sorts candidates into recommended and not-recommended groups
looks considerably more like a system used to evaluate candidates in
recruitment, and we no longer think our own answer is safe. **We would rather
be told this feature is high-risk, and what conformity and documentation that
demands, than keep a clean claim we have outgrown.** If the advice is that it
cannot ship in this form, it does not ship — it is behind a button nobody has
yet pressed.

---

## 6. The two-products question

Tailr runs a candidate-facing career product **and** a tool agencies use to
manage candidates. Agencies reasonably ask whether we are feeding one with the
other.

`docs/NON-COMPETE.md` is our written commitment, approved internally on 22 Aug
2026 and **used in sales conversations and diligence responses**. Its claims are
mechanism-backed: a candidate uploaded by an agency is never shown a Tailr
account, never invited to one, never marketed to.

**It has never been reviewed by a lawyer, and it is already in commercial use.**
That is §9.3, and we would put it high on the list.

The honest unflattering fact, stated in that document rather than hidden: **both
products share one database.** Separation is by schema, row-level security
policies and a single audited function, not by physical isolation.

---

## 7. Security posture relevant to the above

- Two separate security families: consumer rows are scoped to the owning user;
  agency rows to the agency's members. They are never mixed.
- **Anything requiring an audit trail has no direct write access at all** —
  those writes happen only in server routes that write the audit row in the same
  operation. If the interface shows an "audit logged" marker, the client
  genuinely cannot write it directly.
- Every token doorway (portal, rights, consent, reference, booking) stores a
  **hash**, shows the raw value once, expires, and is individually revocable.
  Invalid, expired and already-used links return **one identical non-disclosing
  message**, so a link cannot be used to probe whether a person exists.
- **Non-production environments cannot email the public** — a hard allow-list,
  checked before the network call.

---

## 8. Questions for review, in priority order

**8.1 Can consent be freely given for interview recording, in a hiring
context?** The most contested ground in UK GDPR for anything
employment-adjacent, because a candidate who wants the job is not a free agent.
We have removed every mechanism by which their choice could be known or held
against them (§3.6). Is that enough? **If the answer is no, we would rather know
now — the honest outcome is that the feature does not ship.**

**8.2 Is the controllership map in §2 right?** Specifically: is the agency the
sole controller for the B2B product, making the DPIA duty theirs and ours
supporting material — or are we a joint controller?

**8.3 What must the DPA say about a transcription sub-processor?** None is
selected. We want the criteria, the required terms, and whether UK/EU-only
processing should be a hard requirement before we choose.

**8.4 Art 22 and the EU AI Act.** We believed neither was engaged, and the
shortlist recommendation added on 19 September 2026 (**§5.1**) has made us
much less sure. It groups named candidates into recommended and
not-recommended-yet, which is closer to evaluating candidates than anything we
have built before, even though it writes no decision and nothing downstream
reads it. Two questions, and we want the uncomfortable answer if it is the
right one: **(a)** does human involvement stay meaningful under Art 22 when
the recruiter's own notes are being read back to them as a proposed grouping,
and what would make it not? **(b)** does §5.1 fall inside the AI Act's
high-risk employment provisions — and if so, what conformity and record-keeping
does it demand? It is behind a button that has never been pressed against a
real candidate, so "do not ship it in this form" is an answer we can act on.

**8.5 Is the surviving audit log the right balance?** It deliberately outlives
erasure so an agency can evidence a fair process (§4).

**8.6 Special category data in a transcript.** A candidate may volunteer health
or religious information unprompted, and a verbatim transcript will contain it.
Our mitigation is that the transcript is never disclosed wholesale — only quotes
a recruiter deliberately selects. Sufficient, or should we add an active warning
at the point of selection?

**8.7 The hiring manager's own voice.** They are recorded but are not the
subject of the assessment. We notify them at booking. Is notice enough, or do
they need their own consent?

**8.8 Art 14(5)(b) reliance.** Where a CV carries no contact details, we record
a suppression and rely on the disproportionate-effort exemption plus the
agency's public notice. Is that defensible as built?

---

## 9. What we know is missing

Listed so nobody has to discover them.

**9.1 There is no Terms of Service.** The consumer product is live, takes
payment, and has a privacy policy but no terms. This is the largest gap on the
list.

**9.2 There is no DPA template for agency customers.** If we are a processor, we
need one before the first paying agency.

**9.3 The non-compete commitment has never been lawyer-reviewed** and is already
used in sales and diligence (§6).

**9.4 The consent copy has never been cleared** for use with a real person.
`docs/CONSENT-COPY-DRAFT.md` holds the exact words — the email, the page, the
in-call reminder, the hiring-manager notice. **§2 and §3 of that document are
the ones to read.**

**9.5 The privacy policy does not identify a controller entity** by name or
address, and there is no DPO named. It references the ICO but does not state
registration.

**9.6 Rights fulfilment is manual.** Access and rectification are performed by
hand. The queue exists; the automation does not.

**9.7 No cookie consent mechanism.** The product sets authentication cookies and
references usage analytics; there is no banner. We would like a view on whether
one is required as configured.

**9.8 The audio-deletion sweep fails quietly.** It logs but does not alert. A
deletion promise made in writing to a candidate should not depend on someone
reading a log. We intend to fix this before launch — tell us if it is a blocker
rather than a should.

**9.9 Retention defaults are ours, not advised.** 180 days after role close, and
a 7-day notice delay, were engineering defaults chosen for sane behaviour, not
legal ones.

---

## 10. Documents in this pack

| Document | What it is | Status |
|---|---|---|
| **This file** | The consolidated map | For review |
| `docs/DPIA-INTERVIEW-CAPTURE.md` | Full DPIA for recording and transcription | Draft for review |
| `docs/CONSENT-COPY-DRAFT.md` | **The exact words a candidate reads.** §2 and §3 are the priority | Never cleared |
| `docs/NON-COMPETE.md` | Commitment to agencies | Approved internally, **never reviewed**, in commercial use |
| `docs/AGENCIES_SCHEMA.md` | Data model and full decision log | Reference |
| `app/privacy/page.tsx` | The live consumer privacy policy | **Live** |

---

## 11. Sign-off

| | Name | Date | Outcome |
|---|---|---|---|
| Prepared by | Ose Oifoh, Tailr | 18 Sep 2026 | For review |
| Legal review | _to be completed_ | | |
| Decision on interview capture | | | ☐ Proceed ☐ With changes ☐ Do not proceed |
| Decision on B2B launch readiness | | | ☐ Proceed ☐ With changes ☐ Do not proceed |

The B2B product has no production environment and no paying customer. Nothing
in it needs to ship before this is settled.
