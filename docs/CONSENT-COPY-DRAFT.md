# Interview capture — consent copy

**Status: BUILT 14 Aug 2026, and NOT YET CLEARED FOR A REAL CANDIDATE.**

The flow is live on staging (`lib/agency/consent.ts`, `/consent/[token]`,
`/api/consent/[token]`, `/api/agency/roles/[roleId]/consent`). The copy below is
what it sends and renders, near-verbatim.

**It must not be pointed at a real person until:**
1. A lawyer has read §2 and §3 (see §7 — my recommendation is unchanged), and
2. The DPIA is done, and
3. The build promises in §6 are all true — **§6.2 (declining produces a debrief
   artifact) and §6.4 (the audio-deletion sweep) are still unbuilt**, because
   `round_artifacts` has no write path yet.

Until then the machinery exists and nothing has been asked of anybody.

**Decisions settled by Ose, 14 Aug:** audio only · the agency is controller ·
the client sees structured evidence only, never the raw transcript. Retention
and candidate-copy were not answered and are built to the recommendation below
(§1.3, §1.5) — the second is an Art 15 right rather than a choice.

This document exists to be argued with. It is the gate in front of
`round_artifacts`, per-round enrichment, and both hero screens
(AGENCIES_SCHEMA.md §5.5).

Read alongside the Art 14 notice already live in `lib/agency/notices.ts` — this
copy deliberately borrows its voice, its structure and its promises so a
candidate who receives both does not feel handed off between two companies.

---

## 1. Five decisions that change the words

Answer these and the copy below is close to final. Each one has a recommendation
and the reason for it.

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 1 | **Who is the controller of the recording?** The agency, or the client employer? | **The agency.** | Everything else in the schema treats the agency as controller and Tailr as processor. Splitting controllership per artefact means two privacy notices, two erasure paths, and a candidate who cannot tell who to ask. |
| 2 | **Audio only, or audio + video?** | **Audio only.** | Video captures appearance, home, health signals and family — data nobody needs to structure evidence against a requirement, and all of it raises the stakes on a breach. Audio is the proportionate minimum for a transcript. If a client insists on video, that is a separate consent. |
| 3 | **How long is the transcript kept?** | **The role's own `retention_days` (default 180), then purged with everything else.** | It already cascades from `interview_rounds` on candidate purge. A separate clock would be a second thing to forget. |
| 4 | **Does the client see the raw transcript, or only structured evidence?** | **Structured evidence and verbatim quotes only — never the raw transcript.** | The disclosure rule in `client-auth.ts` exists precisely so a client sees the evidence, not the recruiter's working. A raw transcript is the working. It also means an off-hand remark in minute 3 does not follow someone into a hiring decision. |
| 5 | **Can the candidate get their own transcript?** | **Yes, on request, through the existing rights route.** | It is their personal data; Art 15 makes this a right rather than a favour. Saying so up front is also the single strongest signal that the recording is not being done *to* them. |

**One more, and it is not really a choice:** the hiring manager is recorded too.
They are not the data subject of the hiring decision, but their voice is personal
data. They need a one-line notice at booking. Drafted in §5.

---

## 2. The consent request — email to the candidate

Sent when a round is booked, from `gettailr.com`, agency named in the body,
reply-to the recruiter. Same sender discipline as the Art 14 notice.

> **Subject:** Your interview with {Client} — one thing to decide first
>
> ---
>
> **BEFORE YOUR INTERVIEW**
>
> # {FirstName}, would you like this interview recorded?
>
> {Agency} has arranged your {RoleTitle} interview with {Client} on
> {Day} at {Time}. Before it happens, they need one answer from you, and either
> answer is completely fine.
>
> **What recording would mean.** The audio of the call is transcribed. Your
> recruiter uses the transcript to attach what you actually said to the
> requirements of the role — in your words, quoted, rather than from their memory
> of the conversation.
>
> **What it does not mean.** Nothing decides anything about you automatically. No
> software scores how you sound, how confident you seem, or how you look — Tailr
> does not do that and will not. Every judgement in this process is made by a
> person, and you can ask to see what was recorded against your name.
>
> **If you would rather not.** Say no and the interview happens exactly the same
> way, at the same time, with the same people. Your recruiter writes up their own
> notes afterwards, as they would have done anyway. **Declining will not be held
> against you, and the people interviewing you are not told what you chose.**
>
> [ Yes, record it ]  [ No, don't record it ]
>
> You can change your mind at any point — before the call, during it, or
> afterwards. If you withdraw during or after, the recording is deleted.
>
> The audio is deleted as soon as the transcript is checked. The transcript is
> kept for {RetentionDays} days after the role closes and then deleted with the
> rest of your data. {Client} sees the evidence your recruiter draws from it, not
> the recording or the full transcript.
>
> ---
> *Sent on behalf of {Agency}, who is responsible for your data. Tailr processes
> it on their behalf. You can reply to this email to reach {RecruiterName}
> directly, or [see everything they hold and ask them to delete it]({RightsUrl}).*

### Why each part is there

- **"either answer is completely fine"** in the opening, not the small print. If
  the first thing someone reads implies a right answer, consent is not freely
  given and the whole basis fails.
- **"the people interviewing you are not told what you chose"** — this is the
  line that makes "freely given" true rather than claimed. It also has a build
  consequence: **the client-facing dashboard must never expose
  `capture_consent_status`.** It currently does not, and
  `getHiringDashboard` has a comment saying so. That comment is now load-bearing.
- **No pre-ticked state, two equal buttons.** Not "Yes" as primary and a
  greyed-out "no thanks" link. Equal weight is the point.
- **Deletion of audio on transcript verification** matches the `verified_at` /
  `recording_deleted_at` columns and the cron sweep, so the promise and the
  schema say the same thing.

---

## 3. The consent page — `/consent/{token}`

Reached from either button. Same raw-once token discipline as the portal and
rights routes; the page states the decision again, because a click in an email
is not a considered choice.

**Header:** {Agency} · interview with {Client}
**Title:** Your interview on {Day} at {Time}
**Body:** the four short paragraphs above, verbatim.

**The choice:**

> ( ) **Record it.** The audio is transcribed so what you said is quoted
>     accurately against the role's requirements.
> ( ) **Do not record it.** Your recruiter writes up notes afterwards instead.
>
> [ Save my answer ]

**After choosing, and on every later visit:**

> **Your answer: {recorded / not recorded}.** You can change this at any time,
> including after the interview. [Change my answer]

**If they withdraw after the interview:**

> Your answer has been changed to *not recorded*. The recording and its
> transcript have been deleted, along with anything drawn from them. Your
> recruiter has been told the recording is gone; they keep their own notes, as
> they would have had you declined at the start.

**Invalid / expired / already-used token:** one identical, non-disclosing state,
exactly as `/portal` and `/rights` do — "This link isn't valid any more. Ask your
recruiter for a new one."

---

## 4. In-call reminder (for the recruiter and hiring manager to say)

Consent given a week ago in an email is not the same as knowing you are being
recorded right now. One sentence at the top of the call:

> "Just so you know, this call is being recorded and transcribed so we can quote
> you accurately rather than paraphrase you. You can ask me to stop at any point
> and it won't count against you — do say if you'd rather I didn't."

If the candidate says stop, the round becomes a `debrief` artifact and the audio
is deleted. That path already exists in the schema — `round_artifacts.kind`
carries `'debrief'` precisely so declining still produces a record.

---

## 5. Hiring-manager notice (one line, at booking)

Shown on `/agencies/roles/{roleId}/interviews` and in the HM's own workspace when
a recorded round is booked:

> This call will be recorded and transcribed if the candidate agrees. Your voice
> is in that recording too — it is used only to attach what the candidate said to
> the role's requirements, and it is deleted on the same schedule.

---

## 6. What must be true in the build before any of this ships

These are not copy questions; they are promises the code has to keep.

1. **Consent status is never disclosed to the client.** Already true —
   `getHiringDashboard` deliberately omits `capture_consent_*`. Add a test that
   fails if it ever appears.
2. **Declining costs nothing and produces a `debrief` artifact.** The kind exists;
   the flow does not yet.
3. **Withdrawal deletes the recording, the transcript, and any evidence derived
   from it, and rescores.** This is the hardest one. `candidate_evidence` rows
   carrying `origin='interview'` and that `round_id` must be deleted and the
   candidate rescored — the same shape as the consumer-revocation rule in §5
   ("null for a candidate with `origin='tailr_profile'` evidence ⇒ revoked ⇒
   delete those rows and rescore").
4. **Audio is deleted on transcript verification**, by the cron sweep, and the
   sweep is monitored — a silent failure here means a promise broken in writing.
5. **No inference about the person.** Only verbatim quotes mapped to
   requirements. No tone, sentiment, confidence or fluency scoring, ever. This is
   both the product's argument and, for hiring, the line the EU AI Act draws
   around emotion inference.
6. **`purge_candidate()` already returns recording paths** so erasure takes the
   blobs. Drill it before the first real interview, as the original purge was
   drilled.

---

## 7. What I need from you

- The five decisions in §1.
- A pass on tone — this is the most important copy in the product, because it is
  the one piece a candidate reads while deciding whether to trust the process.
- Whether this goes to a lawyer before it ships. **My view: yes.** Consent as a
  lawful basis in an employment-adjacent context is the most contested ground in
  UK GDPR, precisely because of the power imbalance — a candidate who wants the
  job is not a free agent. The §2 copy is written to earn "freely given" rather
  than assert it, but that is a judgement worth a professional signature, and it
  is cheaper now than after the first real interview.

Once §1 is answered I can write the consent route, the page, the withdrawal
path and the debrief fallback. None of it is large. All of it is blocked on
words, not code.
