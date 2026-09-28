# DPIA — interview capture, transcription and evidence enrichment

**Prepared for legal review · 18 September 2026 · Tailr for Agencies**

**Status: DRAFT FOR A LAWYER. Nothing described here has ever processed a real
person's data.** The pipeline is built, tested and drillable on staging against
synthetic input only. No recording has been made, no transcript produced, no
audio stored, and no third party has received anything. This document exists so
that the first time any of that happens, it happens on advice.

**This is the gate.** `round_artifacts.kind` has no `transcript` writer wired to
a real vendor, and the feature stays dark until this review is closed.

---

## 0. What we are asking for

Three questions, in priority order. Everything else in this document is the
evidence needed to answer them.

1. **Is consent the right lawful basis here, and is ours capable of being
   "freely given" in a hiring context?** This is the contested one — see §5.2.
2. **Who owes the DPIA — us or our agency customers?** We have modelled the
   agency as controller and Tailr as processor, which would make the DPIA
   obligation theirs and this document our supporting material. We want that
   confirmed or corrected before we publish anything to customers (§2.1).
3. **What must the DPA say about the transcription sub-processor?** No vendor is
   named or wired in. We deliberately stopped before that decision (§3.4).

Secondary, but worth a view: §5.4 (UK GDPR Art 22 / EU AI Act), §6.3 (the
hiring manager, who is recorded but is not the data subject), and §8 (the
residual risks we have not been able to design out).

---

## 1. The processing, in one paragraph

A recruitment agency arranges an interview between a candidate and its client
employer. **If — and only if — the candidate agrees**, the audio of that call is
recorded, transcribed, and used by the recruiter to attach *what the candidate
actually said* to the written requirements of the role, as verbatim quotes. The
audio is deleted as soon as a human has checked the transcript. The client
employer never receives the recording or the raw transcript, only the structured
evidence drawn from it. The candidate may decline or withdraw at any point,
including after the interview, and withdrawal deletes everything derived from
the recording.

**What it is not.** No software scores, rates, ranks or infers anything about a
person. No tone, sentiment, confidence, fluency, accent or hesitation analysis
exists or is planned. No candidate is ever automatically rejected, filtered or
deprioritised. Every judgement in the product is made by a named human and
recorded as theirs.

---

## 2. Roles and responsibilities

### 2.1 Controller and processor — the framing we need confirmed

| Party | Role as modelled | Basis |
|---|---|---|
| **The recruitment agency** | **Controller** | They decide to run the process, they hold the client relationship, they determine why the interview happens and what is done with the outcome. |
| **Tailr** | **Processor** | We provide the software. We do not decide whose interview is recorded or what is done with the result. |
| **The client employer** | **Separate controller**, from handover onward | They receive the handover pack and become controller of what they receive. Until then they are a recipient of disclosed material, not a joint controller. |
| **Transcription vendor** | **Sub-processor — NOT YET SELECTED** | See §3.4. |

**The consequence, and the question.** If the agency is the controller, the Art
35 DPIA duty is the agency's, and this document is the processor's technical
description supporting it — the Art 28(3)(f) assistance obligation. We would
then publish this as a customer-facing template each agency completes for
itself.

**Please confirm that reading.** If instead we are a joint controller for this
feature — an argument could be made from the fact that we designed the consent
mechanism, fixed the retention behaviour and constrained what the client may
see — the obligations and the customer contract both change materially.

### 2.2 Data subjects

- **The candidate.** The primary data subject, and the only person whose consent
  governs the recording.
- **The hiring manager and any other interviewer.** Recorded incidentally. Their
  voice is personal data. They are not the subject of the assessment. See §6.3.
- **The recruiter.** Also recorded, and an employee of the controller.

---

## 3. The data, and where it goes

### 3.1 What is collected

| Data | Source | Kept where | Kept how long |
|---|---|---|---|
| Interview **audio** | The call, recorded by the recruiter and uploaded | `agency-recordings` storage bucket | **Until a human verifies the transcript** — then swept within 24h |
| **Transcript**, speaker-labelled | Transcription vendor (none selected) | `round_artifacts` (`kind='transcript'`) | The role's `retention_days` after role close (**default 180**) |
| **Verbatim quotes** mapped to requirements | Recruiter, from the transcript | `candidate_evidence` (`origin='interview'`) | As above |
| **Consent state and timestamp** | The candidate, via their own link | `interview_rounds.capture_consent_status` / `_at` | As above |

**Audio only. No video.** Video would capture appearance, home environment,
health signals and family members — none of which is needed to quote what
somebody said about a job requirement, and all of which raises the consequences
of a breach. If a client ever insists on video that is a separate assessment and
a separate consent.

### 3.2 Special category data

We do not seek it. We cannot promise it never occurs: a candidate may
volunteer health, religious or trade-union information unprompted during an
interview, and a verbatim transcript will contain it.

**Mitigation:** the transcript is never disclosed to the client employer; only
quotes a recruiter has deliberately selected and mapped to a stated requirement
are. A recruiter selecting a quote revealing special category data would be the
recruiter's act as controller, not an automated disclosure. **We would welcome a
view on whether this is sufficient**, or whether we should be doing something
more active — an interstitial warning at quote selection is technically cheap.

### 3.3 Automated decision-making

**None.** There is no automated decision, no profiling that produces legal or
similarly significant effects, and no scoring of the person. The product scores
*evidence against written requirements*, every score traces to either a quote, a
named recruiter's override, or an explicit `MISSING`, and a low score is
surfaced for human review rather than acted upon. **No code path exists that
rejects, filters or hides a candidate.** This is enforced in the schema, not
merely in policy.

### 3.4 International transfers and the sub-processor — the open decision

**No transcription vendor is selected, named, contracted or wired in.** This is
deliberate and is recorded in the code itself: the provider is an interface with
a synthetic implementation, so the queue, the run, the state machine, the human
verification step and the deletion sweep are all built and drillable while no
audio has anywhere to go.

We stopped at this line because sending a candidate's voice to a third party
makes that third party a sub-processor — a decision requiring the controller's
authorisation, a named entry in the DPA, a transfer mechanism if they are
outside the UK, and a TRA. That is a legal decision, not an engineering one.

**What we need from you:** the criteria a candidate vendor must satisfy, the
contractual terms to require, and whether UK/EU-only processing should be a hard
requirement. Adding the adapter once a vendor is cleared is a day's work.

One technical constraint that narrows the field: **speaker diarization is
mandatory.** Only the candidate's own words may become the candidate's evidence.
A vendor that cannot return speaker-labelled segments is not a candidate vendor,
because attributing an interviewer's question to the candidate — "so you led
the migration?" — would be a fairness failure dressed as a data-modelling
choice.

---

## 4. The flow, step by step

1. **Round booked.** Consent status is `pending`. It is created that way and
   there is no function anywhere in the codebase that can create it otherwise.
2. **Recruiter asks.** A consent link is minted and emailed to the candidate.
   Asking is a separate act from booking, on purpose. Status stays `pending` —
   this asks the question, it does not answer it.
3. **The candidate answers, on their own link.** The two options carry equal
   visual weight, nothing is pre-selected, and the email's buttons select
   nothing (so a mail client prefetching links cannot consent for someone).
4. **The interview happens.** The recruiter says a scripted line at the top of
   the call reminding everyone it is being recorded and that they may stop it.
5. **If recorded:** audio uploads, transcription runs, and **a human verifies** —
   confirming the transcript reads correctly *and* identifying which speaker is
   the candidate. Diarization returns "speaker 0, speaker 1"; guessing which is
   the candidate would be inference about a person by the back door.
6. **Verification deletes the audio.** The promise "deleted once the transcript
   is checked" and the act of checking are deliberately the same event.
7. **If declined or stopped:** the round produces an ordinary written debrief
   instead, exactly as it would have without the feature.
8. **Withdrawal, at any time:** the artifact, the recording, and every evidence
   row drawn from that round are deleted, and the candidate is rescored.

---

## 5. Necessity, proportionality and lawful basis

### 5.1 Why do it at all

The alternative is the status quo: a recruiter writes up from memory hours
later. Recruitment decisions are routinely made on a paraphrase of what someone
said, and the paraphrase is where distortion, favourable and unfavourable,
enters. Quoting a candidate accurately is **more** protective of them than
summarising them, provided the recording itself is tightly held. The entire
design follows from that: quote, do not characterise.

### 5.2 Lawful basis — the question we most need answered

**Our position:** consent (Art 6(1)(a)) for the recording and transcription
specifically, with the surrounding recruitment processing resting on legitimate
interests under the agency's own existing notice.

**The difficulty, stated plainly.** Consent must be freely given, and a
candidate who wants the job is not a free agent. This is the most contested
ground in UK GDPR for employment-adjacent processing, and we would rather be
told now than after the first real interview.

**What we have built to try to earn it, rather than assert it:**

- Declining changes nothing about the interview — same time, same people, same
  process. The copy says so in the opening paragraph, not the small print.
- **The interviewers are never told what the candidate chose.** This is the line
  that makes "freely given" true rather than claimed, and it is enforced in
  code: the client-facing payload omits the consent fields, and a
  build-failing test fails the whole test suite if they ever appear.
- Withdrawal is available before, during and after, and actually deletes.
- No pre-selected option anywhere.

**If you tell us consent cannot carry this weight in a hiring context**, we would
rather know than paper over it. The honest fallback is that the feature does not
ship.

### 5.3 The candidate's rights

- **Art 15 access,** including the transcript itself, via the existing rights
  route. We treat this as a right rather than a concession, and say so in the
  consent email — it is also the strongest signal that the recording is not
  being done *to* them.
- **Art 17 erasure** through a single erasure path that also returns the storage
  paths, so deletion takes the audio blobs and not just the database rows.
- **Art 14 notice** is already live and sends on ingestion plus a configurable
  delay (default 7 days, hard-capped at 28). It cannot be switched off.

### 5.4 EU AI Act and emotion inference

Emotion inference in the workplace and in hiring is prohibited under the EU AI
Act. We do not do it, will not do it, and have written that constraint into the
code and its tests rather than into a policy document. **No tone, sentiment,
confidence, fluency, accent or hesitation analysis exists.**

We would value a view on whether transcription-plus-human-quotation, as
described, engages the Act's high-risk employment provisions at all, and what
documentation we should be keeping if it does.

---

## 6. Risks and mitigations

| # | Risk | Severity | Mitigation built | Residual |
|---|---|---|---|---|
| 1 | Consent is not genuinely free | **High** | Interviewers never told the answer (enforced by a build-failing test); declining changes nothing; no pre-selection | **Open — §5.2 is for you** |
| 2 | Audio breach or over-retention | High | Deleted at verification by an automated sweep; never sent to the client; erasure path returns blob paths | Sweep failure is silent-ish — see §8.1 |
| 3 | A candidate is quoted saying something an interviewer said | High (fairness) | Diarization mandatory; a **human** identifies the candidate's speaker before anything is drawn | Human error remains |
| 4 | Client sees the raw transcript | Medium-high | Disclosure rules; client receives selected evidence only; enforced by a source-scanning test | Recruiter could paste it manually |
| 5 | Special category data in a transcript | Medium | Never disclosed wholesale; quote selection is a deliberate human act | **§3.2 — your view welcome** |
| 6 | Sub-processor exposure | **Not yet incurred** | No vendor wired in | **§3.4 is for you** |
| 7 | Recording used to infer things about a person | High | No such code exists; prohibited by design and by test | Requires ongoing discipline |
| 8 | The hiring manager's own voice | Medium | One-line notice at booking | **§6.3 below** |

### 6.3 The hiring manager, specifically

They are recorded, their voice is personal data, and they are not the data
subject of the assessment. We notify them at booking with a single line
explaining that their voice is in the recording, what it is used for, and that
it is deleted on the same schedule.

**Is a notice sufficient, or do they need their own consent?** They are the
controller's client rather than its employee, which we think distinguishes this
from workplace monitoring — but we would like that confirmed.

---

## 7. What is actually built, as of 18 September 2026

Stated precisely, because a DPIA describing intentions rather than code is
worthless.

| Promise | State |
|---|---|
| Consent status never disclosed to the client | **Built and test-enforced** (build fails if breached) |
| Consent can only be given by the candidate, on their own link | **Built** — no function takes a recruiter or client context; there is no code path by which anyone could consent on another's behalf |
| Declining produces an ordinary write-up instead | **Built**, and as of 17 Sep it has a human-facing screen (it was API-only before) |
| Withdrawal deletes artifact, recording and derived evidence, then rescores | **Built** |
| Audio deleted on verification, by automated sweep | **Built** |
| Erasure takes the audio blobs, not just the rows | **Built** |
| No tone/sentiment/confidence/fluency analysis | **Built as an absence**, and asserted by tests |
| Transcription vendor | **Not selected. Not wired. Nothing has left the building.** |
| Any real candidate touched | **None. Zero. Ever.** |

---

## 8. Residual risks we could not design out

**8.1 The deletion sweep can fail quietly.** It logs its failures but nothing
pages anybody. A promise made in writing to a candidate — "deleted once checked"
— should not depend on someone reading a log. We intend to add alerting before
launch; flag if you consider it a blocker rather than a should.

**8.2 A recruiter can defeat most of this by hand.** They can copy a transcript
into an email. No technical control stops a person with legitimate access
misusing it; this is a contractual and training matter for the controller, and
should probably appear in the DPA.

**8.3 We cannot prove a candidate felt free to decline.** We can only show that
we removed every mechanism by which their choice could be known or held against
them. Whether that is enough is §5.2, and it is the question we would most like
answered.

---

## 9. Sign-off

| | Name | Date | Outcome |
|---|---|---|---|
| Prepared by | Ose Oifoh, Tailr | 18 Sep 2026 | Draft for review |
| Legal review | _to be completed_ | | |
| DPO / adviser sign-off | _to be completed_ | | |
| Decision | | | ☐ Proceed ☐ Proceed with changes ☐ Do not proceed |

**Until the decision box is ticked, the feature stays dark.** That is enforced
by there being no vendor adapter, not by a flag somebody could flip.

---

### Appendix — supporting documents

- `docs/CONSENT-COPY-DRAFT.md` — the exact words the candidate receives: the
  email, the consent page, the in-call reminder, the hiring-manager notice.
  **§2 and §3 are the ones to read.**
- `docs/AGENCIES_SCHEMA.md` §5.4–5.5 — the data model and its decision log.
- `lib/agency/transcription.ts` — the pipeline, including the reasoning on
  diarization and human verification, in comments.
- `lib/agency/consent.ts` — the consent mechanism.
- The Art 14 candidate notice, live since August, in `lib/agency/notices.ts`.
