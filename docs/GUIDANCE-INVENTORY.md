# Static guidance inventory — 9 Oct 2026

Every always-visible explanatory text on the recruiter, hiring-manager and doorway screens (hints, labels, buttons and errors excluded). Input to the declutter plan.

```
STATIC GUIDANCE INVENTORY. Paths are relative to /home/user/cvtailor-saas. Word counts are approximate. Where a paragraph spans several lines, the line given is its first line. Text inside `Hint`, title= tooltips, labels, buttons, errors and one-line empty states is excluded.

Three sets of items are listed only once even though they appear on several screens:
- `brief-form`, `brief-editor` and `brief-review` are listed under Role step 01. `brief-form` also appears on the HM brief page.
- CandidateCompliance appears in the candidate detail modal and on the candidate file.
- CandidateReferences appears on the candidate file and on close-out.

== Recruiter · Today ==
Recruiter · Today | app/agencies/page.tsx:336 | One line per role, and what it needs next. / Roles that need you come first… | 9 | subtitle
Recruiter · Today | app/agencies/page.tsx:374 | All shortlists are subject to recruiter judgment. Nothing is rejected automatically. | 11 | footnote (sidebar)
Recruiter · Today | app/agencies/page.tsx:418 | Your email address and a magic link — no password. | 9 | empty-state (unauthed)
Recruiter · Today | app/agencies/page.tsx:430 | Ask your agency owner to invite you, and this page fills in… | 14 | empty-state
Recruiter · Today | app/agencies/page.tsx:566 | Nothing here is deleted. Closing a role starts the retention clock on its… | 33 | note (archive)
Recruiter · Today | app/agencies/page.tsx:576 | Tailr never rejects anyone automatically. Client declines are signals, not decisions, and… | 16 | footnote

== Recruiter · Roles list ==
Recruiter · Roles list | app/agencies/roles/page.tsx:103 | One row per role, from the same facts as the role header… | 18 | footnote (sidebar)
Recruiter · Roles list | app/agencies/roles/page.tsx:113 | Every role, where it is, who holds it, and what happens next. | 13 | subtitle

== Recruiter · Role page, all steps (shared chrome) ==
Recruiter · Role chrome | app/agencies/roles/[roleId]/page.tsx:1419 | Decision support only. All shortlists are subject to recruiter judgment. | 11 | footnote (sidebar)
Recruiter · Role chrome | components/agency/role-header.tsx:251 | Closing starts the retention clock on every candidate attached to it: their… | 37 | other (close confirm)
Recruiter · Role chrome | components/agency/brief-chip.tsx:83 | Amend the brief to a new version, change the role back, or keep… | 20 | note (inside details)

== Recruiter · Role step 01 Role & brief ==
Step 01 | app/agencies/roles/[roleId]/page.tsx:1471 | The job comes first: the description and your notes are what everything downstream… | 40 | subtitle
Step 01 | page.tsx:1500 | Filled from the JD… Check the fields, then continue to check the requirements… | 25 | other (post-extract banner)
Step 01 | page.tsx:1535 | This JD came with the client's brief — parse it, or edit first. | 12 | note
Step 01 | page.tsx:1548 | Replaces the box with their exact text. | 7 | note
Step 01 | page.tsx:1559 | Extraction fills any empty fields below from the JD. It never overwrites… | 20 | note
Step 01 | page.tsx:1588 | Naming them puts this role in their workspace and their name on the… | 19 | note
Step 01 | page.tsx:1597 | Notes feed the scoring and never reach the client. | 9 | note
Step 01 | page.tsx:1622 | Name the hiring manager under Role & client first — the terms are addressed… | 23 | note
Step 01 | page.tsx:1627 | The rounds, how the client decides, what they are shown, the feedback promise… | 35 | note
Step 01 | page.tsx:1648 | For a role added twice, or by mistake. It leaves your lists and… | 42 | explainer card (Discard)
Step 01 | page.tsx:1664 | Every score you see later points back to something in this brief or… | 38 | explainer card (Evidence first principle)
Step 01 | components/agency/brief-editor.tsx:236 | What {contact} agrees to before interviews start. The role runs on these terms… | 18 | note
Step 01 | brief-editor.tsx:260 | {contact} reads it in their workspace. Changes come back as a new version… | 16 | note
Step 01 | brief-editor.tsx:177 | Or change it, which sends v{n+1} back to them. | 9 | note
Step 01 | brief-editor.tsx:225 | Sending is v1 and signs it for your side. / An amendment is a new version… | 16 | note
Step 01 | components/agency/brief-review.tsx:125 | The job description and the four terms the client signs for. A change… | 22 | note
Step 01 | brief-review.tsx:146 | Stated by the agency; the client reads and acknowledges. | 8 | note
Step 01 | components/agency/brief-form.tsx:358 | The document the terms are about. The client sees it and can replace… | 37 | note (section sub)
Step 01 | brief-form.tsx:403 | PDF, DOCX or TXT, up to 10 MB. Drop it here or choose a file. | 13 | note
Step 01 | brief-form.tsx:440 | Nothing could be read from this file — a scan, perhaps. The role's intake… | 25 | note
Step 01 | brief-form.tsx:446 | Read once for the role's intake. Nothing is parsed until you press Extract… | 15 | note
Step 01 | brief-form.tsx:457 | A new file is a new version: {their} signature is cleared until they approve it. | 14 | note
Step 01 | brief-form.tsx:566 | What each round is for, who is in it, how long. The room's… | 28 | note (section sub)
Step 01 | brief-form.tsx:573 | Multi-select from the client's contacts. The first named decides. | 11 | note (field hint)
Step 01 | brief-form.tsx:590 | Drives the reminders and "I'm done deciding". A promise the client makes, not… | 18 | note (field hint)
Step 01 | brief-form.tsx:591 | Tap to toggle. | 3 | note (field hint)
Step 01 | brief-form.tsx:602 | The agreed default, frozen per submission as today. It is what the candidate's… | 17 | note (section sub)
Step 01 | brief-form.tsx:609 | Notes default off; the rest default on. | 7 | note (field hint)
Step 01 | brief-form.tsx:624 | From the client's contacts. | 4 | note (field hint)
Step 01 | brief-form.tsx:625 | Steps of £1,000. | 4 | note (field hint)
Step 01 | brief-form.tsx:638 | The default per candidate on this role; changeable per person at close-out. | 12 | note (field hint)
Step 01 | brief-form.tsx:647 | The one free-text field, and it is optional. 600 characters. | 11 | note
Step 01 | brief-form.tsx:162 | No contacts at this client yet — add them under Client access. | 11 | empty-state

== Recruiter · step 02 Check requirements ==
Step 02 | page.tsx:1677 | Click a chip to cycle its weight. This is the human in the loop… | 19 | subtitle
Step 02 | page.tsx:124 (rendered at 1694) | Weight about 45% of the score. Zero here is a hard fail. | 12 | note (ag-group-hint)
Step 02 | page.tsx:125 (rendered at 1694) | Weighted, but not disqualifying if missing. | 8 | note (ag-group-hint)
Step 02 | page.tsx:126 (rendered at 1694) | Signal only. Adds bonus points, never subtracts. | 8 | note (ag-group-hint)
Step 02 | page.tsx:1721 | Constraints act as filters, not scoring inputs. A candidate outside a constraint gets… | 19 | note
Step 02 | page.tsx:1727 | Weighting model: Requirement coverage 45% · Evidence strength 25% · Seniority… | 15 | explainer card

== Recruiter · step 03 Candidates (includes the matching window modal) ==
Step 03 | page.tsx:1748 | PDF, DOCX or pasted text, up to 50 per role. Scoring runs on… | 17 | subtitle
Step 03 | page.tsx:1787 | Tailr scans against this role's requirements, so parse them first. Once they exist… | 25 | note
Step 03 | page.tsx:1792 | Publish this role and Tailr scans every Tailr user who opted into matching… | 47 | note
Step 03 | page.tsx:1824 | Scanned against this role's requirements. It re-runs on its own whenever you… | 16 | note (state variants)
Step 03 | components/agency/matching-window.tsx:303 | Tailr checks people who opted into being seen by recruiters, against the requirements… | 29 | subtitle
Step 03 | matching-window.tsx:321 | Matching scores people against this role's requirements, so it needs them parsed first… | 19 | note
Step 03 | matching-window.tsx:328 | Nothing has been published and nobody has been scanned. | 9 | note
Step 03 | matching-window.tsx:334 | There is no job board. Tailr scans each consumer user's own evidence — on… | 30 | note
Step 03 | matching-window.tsx:389 | The next scan runs {day}, and your score applies to it. Changing the number… | 40 | note
Step 03 | matching-window.tsx:414 | {n} requirements, {m} of them must-haves. A person is only ever considered against… | 45 | note
Step 03 | matching-window.tsx:437 | This usually takes under a minute. You can close this and come back. | 13 | note
Step 03 | matching-window.tsx:451 | Nobody who matched has chosen to be seen yet. People control whether recruiters… | 22 | empty-state
Step 03 | matching-window.tsx:549 | A handful of the people who matched have not chosen to be seen… | 40 | note

== Recruiter · step 04 Screening ==
Step 04 | page.tsx:2052 | Log what you learned. Overriding a strength rescores the candidate immediately, and every… | 21 | subtitle
Step 04 | page.tsx:2134 | No questions on this call yet. Write one below, or pick from the… | 18 | empty-state

== Recruiter · step 05 Compare (includes shortlist rail and recommendation) ==
Step 05 | page.tsx:2542 | The matrix shows post call evidence. Coral cells are your overrides. Decide here… | 20 | subtitle
Step 05 | page.tsx:2665 | Legend: Strong evidence — 1.0 · Transferable — 0.7 · Partial — 0.4 · Missing — 0.0 | 12 | legend
Step 05 | components/agency/shortlist-rail.tsx:84 | {Client} sees each name as you add it. The CV, evidence and scores… | 21 | subtitle
Step 05 | shortlist-rail.tsx:133 | Next: choose what else the client reads, then send. | 9 | note
Step 05 | components/agency/recommendation-panel.tsx:93 | Tailr can read the answers you wrote on the screening calls and the… | 31 | subtitle
Step 05 | recommendation-panel.tsx:156 | A reading of your own notes, not a filter. Everyone is still on the… | 36 | subtitle
Step 05 | recommendation-panel.tsx:41 (rendered at 174) | Every must-have evidenced, or answered by something you wrote on the call. | 12 | note (group blurb)
Step 05 | recommendation-panel.tsx:43 (rendered at 174) | Strong where it counts, with one gap named plainly. A requirement with nothing… | 22 | note (group blurb)
Step 05 | recommendation-panel.tsx:45 (rendered at 174) | Each one carries the specific must-have with nothing under it. All of them… | 27 | note (group blurb)
Step 05 | recommendation-panel.tsx:236 | {ref} is a must-have, and nobody has been asked about it — … nothing to carry. | 40 | other (what would change this)
Step 05 | recommendation-panel.tsx:246 | {n} candidates have no screening call logged at all. This recommendation is reading… | 30 | other
Step 05 | recommendation-panel.tsx:255 | The recommendation proposes; you add. Every add here is the same decision as… | 40 | footnote

== Recruiter · step 06 Submission ==
Step 06 | page.tsx:2911 | They open it in their Tailr workspace, where they choose who to meet… | 25 | subtitle
Step 06 | page.tsx:2980 | Sending again does not replace what they have. It generates a second snapshot… | 49 | other (resend dialog)
Step 06 | page.tsx:3011 | The ask is on their rights page and they have not answered it. Unanswered… | 46 | other (represent dialog)
Step 06 | page.tsx:3035 | Nothing shortlisted yet. Go back to compare and shortlist the candidates you want… | 15 | empty-state
Step 06 | page.tsx:3050 | No client contacts yet. Add the hiring manager and the shortlist goes to them. | 14 | empty-state
Step 06 | page.tsx:3148 | Held and passed stay with you. Nothing about them is sent. | 11 | note
Step 06 | page.tsx:3163 | Sent to their account. Nobody has to find an email. / The invite and the shortlist… | 10 | note
Step 06 | page.tsx:3171 | Both are shortlisted. They would reach the client as two people. | 11 | note
Step 06 | page.tsx:3210 | Written into the submission when you send, so what the client received can never… | 16 | note
Step 06 | page.tsx:3224 | Names, one line each, and a button back to the workspace. Never the whole… | 17 | note
Step 06 | page.tsx:3225 | The printable document, with the confidentiality footer and known gaps stated plainly. Opens… | 20 | note
Step 06 | page.tsx:3226 | Personal, expires in 30 days, revocable on its own. Shown once after you send. | 16 | note
Step 06 | page.tsx:3263 | Never sent to the client. The reason each was not submitted stays in the… | 16 | note
Step 06 | page.tsx:3456 | Revoking kills one person's link. It never deletes the record of what they… | 20 | footnote
Step 06 | components/agency/submission-parts.tsx:100 | The recruiter's screening notes are not part of this submission. | 10 | note (client preview)
Step 06 | submission-parts.tsx:116 | Choose who you want to interview, then offer the times you can do… | 22 | other (client preview)
Step 06 | submission-parts.tsx:215 | This shortlist was prepared with AI-assisted evidence matching, and every score traces back… | 50 | footnote (print doc)
Step 06 | submission-parts.tsx:406 | Personal links, one per person, shown once — they are not stored. Each expires… | 22 | note

== Recruiter · Candidate detail modal ==
Cand. modal | components/agency/candidate-detail.tsx:242 | No narrative written yet. Whatever you record here travels to the client as… | 18 | empty-state
Cand. modal | candidate-detail.tsx:345 | No evidence found in the CV for this requirement. Marked MISSING. Confirm on… | 20 | note (per row)
Cand. modal | candidate-detail.tsx:394 | Also on the candidate file — the operational record outside the workflow, where these… | 20 | note
Cand. modal | candidate-detail.tsx:433 | Still unevidenced: {refs}. Worth asking if the call has not covered them. | 12 | note
Cand. modal | candidate-detail.tsx:467 | Decisions are yours and reversible. Tailr never rejects a candidate. | 10 | note
Cand. modal | app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx:58 | No candidate is ever auto-rejected. All shortlists are subject to recruiter judgment. | 12 | footnote (sidebar)

== Shared · Right to work & logistics (CandidateCompliance: modal and candidate file) ==
Compliance | components/agency/candidate-compliance.tsx:160 | This candidate has an offer starting {date}. The employer's own check is needed… | 14 | note
Compliance | candidate-compliance.tsx:191 (text in lib/agency/compliance-vocab.ts:66) | This is the agency's own pre-screen, not the employer's statutory check. The employer… | 21 | note
Compliance | candidate-compliance.tsx:206 | The note is the assertion — how, not the documents. Nothing uploads here, on purpose. | 15 | note
Compliance | candidate-compliance.tsx:222 | Leave empty if you did not record one. Empty means unrecorded, not unlimited. | 13 | note
Compliance | candidate-compliance.tsx:254 (text in compliance-vocab.ts:72) | What the candidate told you, in their words. It is not a decision… | 25 | note
Compliance | candidate-compliance.tsx:279 | Attributed to you, in the audit log. | 7 | note

== Shared · References (CandidateReferences: candidate file and close-out) ==
References | components/agency/candidate-references.tsx:254 | Someone who worked with them — when, and what they were like to work with. | 15 | note
References | candidate-references.tsx:255 | The employer's HR team, confirming dates and job title. Facts only. | 11 | note
References | candidate-references.tsx:322 | Referees are data subjects too. The request and their fair-processing notice are the… | 40 | footnote

== Recruiter · Candidate file (/agencies/candidates/[id]) ==
Cand. file | app/agencies/candidates/[candidateId]/page.tsx:129 | The paperwork that travels with the person — right to work and references… | 25 | footnote (sidebar)
Cand. file | candidates/[candidateId]/page.tsx:207 | The evidence map, screening answers and score live in the shortlist workflow —… | 20 | note
Cand. file | candidates/[candidateId]/page.tsx:226 | This person asked to be erased. The file holds nothing. | 10 | other
Cand. file | candidates/[candidateId]/page.tsx:231 | Right to work and references travel into the handover pack — complete them here… | 18 | footnote

== Recruiter · Candidates list ==
Candidates | app/agencies/candidates/page.tsx:153 | Across every role, open and closed. A decision on one role says nothing… | 16 | footnote (sidebar)
Candidates | candidates/page.tsx:171 | Across every role, open and closed. Somebody rejected for one role may be… | 31 | subtitle
Candidates | candidates/page.tsx:182 | No candidates yet. They are added on a role — open one and use… | 22 | empty-state
Candidates | candidates/page.tsx:314 | Decisions are made on the role, not here — this is where you find… | 19 | footnote

== Recruiter · Candidate dossier ==
Dossier | app/agencies/roles/[roleId]/candidates/[candidateId]/dossier/page.tsx:121 | Every layer here is a row someone wrote. Nothing is inferred, and the unknown… | 19 | footnote (sidebar)
Dossier | dossier/page.tsx:164 | {role} · {ref} · every line below traces to a quote, a recruiter's call… | 16 | subtitle
Dossier | dossier/page.tsx:172 | Interview enrichment is not built yet, so nothing here has been drawn from… | 35 | note (callout)
Dossier | dossier/page.tsx:198 | Pick a round to see what it moved — what it reached first, what… | 18 | note
Dossier | dossier/page.tsx:220 | requirements still unproven. This number only ever goes down. | 9 | note
Dossier | dossier/page.tsx:247 | Each block is a requirement, coloured by the layer that last moved it… | 19 | note
Dossier | dossier/page.tsx:279 | {x} at parse, {y} added by screening. No round ever subtracts. | 12 | note
Dossier | dossier/page.tsx:295 | Sand → amber → coral: the deeper the colour, the more recently that layer… | 30 | legend
Dossier | dossier/page.tsx:319 | Nothing has evidenced this yet — not claimed, not inferred, not filled in. | 12 | empty-state
Dossier | dossier/page.tsx:374 | Round {n} has not moved anything yet. When it is written up, what… | 20 | empty-state

== Recruiter · Interviews ==
Interviews | app/agencies/roles/[roleId]/interviews/page.tsx:420 | Windows come from the client's own workspace. A candidate taking one removes it… | 21 | footnote (sidebar)
Interviews | interviews/page.tsx:434 | Nobody has been invited to interview yet. Your client chooses the cohort and… | 33 | empty-state
Interviews | interviews/page.tsx:460 | {Client} has offered N windows. Pick who meets them — the time comes out… | 33 | subtitle
Interviews | interviews/page.tsx:470 | From the brief: … Their plan, not a gate — what the candidates book… | 15 | note
Interviews | interviews/page.tsx:615 | Only when a candidate cannot use their own link — no email address, or… | 35 | note
Interviews | interviews/page.tsx:625 | No candidates on this role yet. Add them in step 03 — anyone on… | 17 | empty-state
Interviews | interviews/page.tsx:656 | Anyone on the role can be met, screened or not — Tailr does not… | 15 | note
Interviews | interviews/page.tsx:693 | Offered by {contact} from their workspace. Booking one removes it from the board… | 50 | note
Interviews | interviews/page.tsx:727 | Tailr does not host or record this call. Use your own meeting link… | 38 | note (callout)
Interviews | interviews/page.tsx:742 | The round number follows what they have already had — you cannot skip… | 17 | note
Interviews | interviews/page.tsx:989 | Nothing outstanding in the loop… If the client has chosen someone, close-out collects… | 40 | other (handoff)
Interviews | interviews/page.tsx:1008 | Booking takes the time off the client's board · cancelling gives it back. | 11 | footnote
Interviews | components/agency/cohort-board.tsx:237 | {n} people could not make any of the times offered. That is about… | 22 | note
Interviews | cohort-board.tsx:244 | Candidates book themselves from the client's windows, and the client decides when the… | 24 | note
Interviews | components/agency/interview-capture.tsx:208 | {name} has not agreed to this interview being recorded, so there is nothing… | 30 | note
Interviews | interview-capture.tsx:214 | The people interviewing them are never told what they chose. That is a… | 28 | note
Interviews | interview-capture.tsx:225 | {name} agreed. Tailr does not host or record the call — record it yourself… | 33 | note
Interviews | interview-capture.tsx:252 | The recording is stored. Transcription runs on a queue, not in this page… | 45 | note
Interviews | interview-capture.tsx:254 | Transcribing. This runs on the job queue; come back to it — nothing is lost… | 17 | note
Interviews | interview-capture.tsx:256 | That transcription failed. The audio has not been touched, so it can be tried again. | 15 | note
Interviews | interview-capture.tsx:282 | {n} segments, {m} speakers. Read the transcript, then say which voice is {name}… | 40 | note
Interviews | interview-capture.tsx:288 | Confirming does two things at once, deliberately: it accepts the transcript AND releases… | 30 | note
Interviews | interview-capture.tsx:316 | The transcript stays, and the quotes drawn from it carry the round they… | 25 | note

== Recruiter · Close-out/handover ==
Close-out | app/agencies/roles/[roleId]/close-out/page.tsx:381 | Handing over ends Tailr's part. The employer becomes responsible for the copy they… | 23 | footnote (sidebar)
Close-out | close-out/page.tsx:396 | Collect references, hand over the pack, and Tailr's part is done. Everything the… | 26 | subtitle
Close-out | close-out/page.tsx:414 | Nobody has been interviewed on this role yet. Once the client has met… | 18 | empty-state
Close-out | close-out/page.tsx:442 | Their preference, in their words. You confirm the hire — nothing is recorded until… | 15 | note
Close-out | close-out/page.tsx:450 | Suggested from the client's round decisions… You confirm the hire — nothing is recorded… | 20 | note
Close-out | close-out/page.tsx:517 | Opens references and the handover pack. The role stays open until you close it. | 14 | note
Close-out | close-out/page.tsx:533 | Right to work lives on the candidate file — completed there, they join… | 16 | note
Close-out | close-out/page.tsx:557 | Generating freezes everything as it stands: the evidence dossier with its quotes, the… | 31 | note
Close-out | close-out/page.tsx:564 | {n} references still outstanding. You can hand over anyway — the pack will say… | 20 | note
Close-out | close-out/page.tsx:624 | Prepared by {agency}. Every claim below carries its source; where there was no… | 17 | note (pack)
Close-out | close-out/page.tsx:631 | Verbatim quotes, mapped to the role's requirements. Nothing paraphrased. | 9 | note (pack)
Close-out | close-out/page.tsx:661 | What the agency saw and what the candidate said — acts and reported answers… | 16 | note (pack)
Close-out | close-out/page.tsx:665 | Nothing recorded. The employer must run its own check before employment starts. | 14 | empty-state (pack)
Close-out | close-out/page.tsx:696 | How each round was recorded, so every quote above has provenance. | 9 | note (pack)
Close-out | close-out/page.tsx:717 | In the hiring manager's own words, as sent. Not edited by the agency. | 12 | note (pack)
Close-out | close-out/page.tsx:724 | In the referee's words, attributed — never paraphrased. | 8 | note (pack)
Close-out | close-out/page.tsx:749 | Requirements never evidenced — in the CV, the calls or the interviews. The reader… | 26 | note (pack)
Close-out | close-out/page.tsx:840 | Four items are settled by the record itself; only terms are your word… | 28 | note
Close-out | close-out/page.tsx:851 | Delivery is recorded against the contact and audited. From that moment the employer… | 19 | other (handoff)
Close-out | close-out/page.tsx:887 | The pack is with the client and stays on record here… The retention clock… | 20 | other (handoff)
Close-out | close-out/page.tsx:907 | Close the role: the retention clock starts on everyone who did not get… | 30 | other (handoff)
Close-out | close-out/page.tsx:931 | When the hire is made, Tailr forgets · handing over starts the retention clock… | 19 | footnote
Close-out | components/agency/round-request-card.tsx:106 | Adding it invites them from the client's offered times. | 9 | note

== Recruiter · Clients ==
Clients | app/agencies/clients/page.tsx:380 | Nobody gains access by signing up. A client contact is only ever linked… | 19 | footnote (sidebar)
Clients | clients/page.tsx:409 | Giving a client contact access lets them post briefs and run interview rounds… | 33 | subtitle
Clients | clients/page.tsx:424 | Adding them does not give them access | 7 | note
Clients | clients/page.tsx:459 | This adds them to your address book. They get nothing until you send… | 30 | note
Clients | clients/page.tsx:487 | This is the only time Tailr will show you this link — it is stored… | 35 | note
Clients | clients/page.tsx:492 | The invite is valid, but Tailr could not email it to them. This is… | 25 | note
Clients | clients/page.tsx:497 | It has also been emailed to the contact, so you do not have to pass it on. | 13 | note
Clients | clients/page.tsx:512 | Accepting it requires signing in as the address it was sent to. A forwarded… | 18 | note
Clients | clients/page.tsx:531 | You have no client contacts yet, so there is nobody to give access to. | 15 | empty-state
Clients | clients/page.tsx:533 | Contacts are created on the Submission step of a role, when you name… | 30 | empty-state
Clients | clients/page.tsx:651 | What a linked contact can and cannot see — They can: Post a brief… / They cannot… | 70 | explainer card
Clients | clients/page.tsx:675 | Their side of Tailr shows only what has actually been created. Until a brief… | 28 | note
Clients | clients/page.tsx:679 | Removing access unlinks the person from the contact and kills any invite still… | 30 | note

== Recruiter · Settings ==
Settings | app/agencies/settings/page.tsx:198 | Both settings apply to every role from the moment you change them, not just… | 16 | footnote (sidebar)
Settings | settings/page.tsx:218 | Two numbers with real consequences for people who never signed up to anything… | 43 | subtitle
Settings | settings/page.tsx:231 | You can see these because you work here, but only an owner can change them. | 16 | note
Settings | components/agency/team-section.tsx:135 | Everyone who can work in {agency}. Recruiters work roles and candidates; viewers can… | 25 | note
Settings | team-section.tsx:239 | They get an email with a sign-in link. There is no password — they… | 18 | note
Settings | team-section.tsx:245 | Only an owner can add or change teammates. | 8 | note
Settings | settings/page.tsx:246 | How long a candidate's data is kept after a role closes. When the clock… | 31 | note
Settings | settings/page.tsx:270 | 180 covers the Equality Act tribunal window with room to spare. Shorter is kinder… | 22 | note
Settings | settings/page.tsx:278 | A candidate whose CV you hold has a right to know you hold it… | 32 | note
Settings | settings/page.tsx:304 | The cap is {N} days and the notice cannot be switched off. Setting it… | 28 | note (callout)
Settings | settings/page.tsx:322 | The least warning anyone is given before an interview you offer them. Windows closer… | 30 | note
Settings | settings/page.tsx:346 | your desk's default · a role can still override it / inherited — nobody has set this… | 11 | note
Settings | settings/page.tsx:351 | This is what a candidate is owed, not a filter on your diary. Shortening… | 32 | note (callout)
Settings | settings/page.tsx:361 | Where each of the five notifications starts for everyone in the agency. Unlike the… | 35 | note
Settings | settings/page.tsx:382 | Changing a default moves it only for people who have not chosen for themselves… | 30 | note
Settings | settings/page.tsx:416 | Every change on this page is written to the audit log against your name… | 40 | footnote

== Recruiter · Audit ==
Audit | app/agencies/audit/page.tsx:116 | Nothing in Tailr can edit or delete a row here, including this screen. | 13 | footnote (sidebar)
Audit | audit/page.tsx:134 | Every Audit logged pill in this product writes a row here. Append-only: nothing… | 23 | subtitle
Audit | audit/page.tsx:166 | Nothing has been logged for this agency yet. The first role, candidate or client… | 21 | empty-state
Audit | audit/page.tsx:193 | Append-only. Nothing in Tailr can edit or delete a row here — not this screen… | 56 | footnote

== Recruiter · Notifications ==
Notifications | app/agencies/notifications/page.tsx:110 | Nobody else can change these for you, and changing one never affects a colleague. | 13 | footnote (sidebar)
Notifications | notifications/page.tsx:128 | Two layers. Your agency sets a default for everyone, and you can override any… | 43 | subtitle
Notifications | notifications/page.tsx:155 (text in lib/agency/notification-kinds.ts:43) | You are told the write-up exists, never what it says. The answers stay… | 19 | note (row blurb)
Notifications | notifications/page.tsx:155 (notification-kinds.ts:49) | Their answer is not in the email, and it never reaches the panel interviewing… | 27 | note (row blurb)
Notifications | notifications/page.tsx:155 (notification-kinds.ts:54) | The reference itself stays in the app. This only tells you it is there… | 16 | note (row blurb)
Notifications | notifications/page.tsx:155 (notification-kinds.ts:60) | If they cannot make it the slot goes back to the client's board on… | 31 | note (row blurb)
Notifications | notifications/page.tsx:155 (notification-kinds.ts:66) | The quietest of the five. It fires once per contact, the first time they… | 18 | note (row blurb)
Notifications | notifications/page.tsx:195 | A dashed switch is the agency's default, not yours. Your own choice always wins… | 37 | note
Notifications | notifications/page.tsx:204 | Two things this screen deliberately cannot do, because neither is a preference. | 13 | note
Notifications | notifications/page.tsx:207 | The email telling a hiring manager you accepted or declined their brief is not… | 49 | note (callout)
Notifications | notifications/page.tsx:213 | Switching one off silences your inbox, nothing else. The event still happens, still writes… | 35 | note
Notifications | notifications/page.tsx:220 | Turning a notification off is written to the audit log against your name, the… | 40 | footnote

== Recruiter · Briefs (list and detail) ==
Briefs | app/agencies/briefs/page.tsx:82 | A brief is the terms of a search, one per role. Both sides sign… | 18 | footnote (sidebar)
Briefs | briefs/page.tsx:91 | How a search runs — rounds, decisions, what the client sees — agreed by both… | 46 | subtitle
Briefs | briefs/page.tsx:104 | No briefs yet. Open a role and start its terms on step 01, Role & brief. | 15 | empty-state
Briefs | app/agencies/briefs/[briefId]/page.tsx:57 | Send makes it a version the client can see. Their signature makes it the terms. | 15 | footnote (sidebar)
Briefs | components/agency/brief-editor.tsx:314 | Runs {refs}. A role's brief is edited on its first step, Role & brief. | 11 | note

== Recruiter · Sign-in ==
Sign-in | app/agencies/sign-in/page.tsx:109 | We sent a sign-in link to {email}. Open it on this device to come… | 23 | note
Sign-in | sign-in/page.tsx:150 | The link and the code each work once and expire after about an hour… | 20 | note
Sign-in | sign-in/page.tsx:170 | For recruiters and hiring managers. You will land in whichever workspace your account has… | 23 | subtitle
Sign-in | sign-in/page.tsx:190 | No password. We email you a link. If you already use Tailr for your… | 34 | note
Sign-in | sign-in/page.tsx:214 | Access is granted by your agency, never claimed. If nobody has invited you yet… | 22 | footnote

== HM · Shared frame (every hiring screen) ==
HM frame | components/agency/hm-room.tsx:161 | Your email address and a link we send you — no password. | 11 | empty-state
HM frame | hm-room.tsx:166 | Hiring-manager access is given by invitation only — ask your recruiter for one. | 13 | empty-state
HM frame | hm-room.tsx:170 | Reload the page. If it keeps failing, tell your recruiter. | 11 | empty-state

== Hiring manager dashboard ==
HM dashboard | app/hiring/page.tsx:77 | You are on the client side. This is what {agency} shows you — your… | 26 | note (side band)
HM dashboard | app/hiring/page.tsx:96 | When a shortlist arrives or an interview needs writing up, it appears here. / Across N roles… | 14 | subtitle

== HM · Roles list ==
HM roles | app/hiring/roles/page.tsx:68 | Every role your recruiter has opened with you, and the stage each is at… | 22 | subtitle
HM roles | hiring/roles/page.tsx:76 | When your recruiter opens a role with you named on it, it appears here. | 15 | empty-state
HM roles | hiring/roles/page.tsx:88 | Nothing in progress — every role below is finished. | 9 | note

== HM · Diary ==
HM diary | app/hiring/diary/page.tsx:66 | When a candidate picks one of your times, it appears here with its joining link. | 15 | empty-state
HM diary | diary/page.tsx:84 | No open times. You offer them from a role — open it and choose Offer times. | 14 | empty-state

== HM role room · shortlist stage ==
HM room | app/hiring/roles/[roleId]/shortlist/page.tsx:181 | The recruiter's screening notes are not part of this submission. | 10 | note
HM room | shortlist/page.tsx:191 | Name withheld at the candidate's request. | 8 | note
HM room | shortlist/page.tsx:231 | Interviews have started. The rounds are where this role is being decided now. | 13 | other (HandOff)
HM room | shortlist/page.tsx:238 | Choose who you want to interview, then offer the times you can do —… | 20 | other (HandOff)
HM room | shortlist/page.tsx:245 | You chose N candidates. They are picking times from the windows you offered. | 18 | other (HandOff)
HM room | components/agency/hm-shortlisting.tsx:216 | {Agency} is still building this shortlist. Each name appears the moment they add… | 31 | subtitle
HM room | hm-shortlisting.tsx:220 | Nothing to decide yet. When the submission arrives you will read each person here… | 22 | footnote
HM room | hm-shortlisting.tsx:235 | Names appear here as {agency} adds people to the shortlist. If your recruiter sends… | 25 | empty-state
HM room | hm-shortlisting.tsx:255 | {Agency} has shortlisted these since the submission. Their CV, evidence and scores arrive… | 19 | subtitle
HM room | components/agency/hm-candidate.tsx:111 | {gaps} — nothing in the CV under these must-haves. Not inferred either way. | 10 | note
HM room | hm-candidate.tsx:135 | Your recruiter did not include the score, … Withheld, not absent — ask them… | 15 | note
HM room | hm-candidate.tsx:147 | Your recruiter did not include the CV in this submission. Withheld, not missing — ask them. | 16 | note
HM room | hm-candidate.tsx:151 | This candidate asked to be considered without their details being shared. | 12 | note
HM room | hm-candidate.tsx:174 | Shared with you by your recruiter · contact details removed · opening this is recorded | 13 | note
HM room | hm-candidate.tsx:181 | Their phone, email and personal links were removed. Reply to your recruiter to reach them. | 14 | note
HM room | components/agency/hm-case.tsx:74 | Your recruiter did not include {list} with this submission. Ask them if you need… | 25 | note
HM room | hm-case.tsx:116 | Your recruiter has not sent you {ref}'s evidence in a submission yet. Ask them… | 17 | empty-state

== HM interview setup (choose and offer times) ==
HM interviews | app/hiring/roles/[roleId]/interviews/page.tsx:459 | You choose who to meet, you offer times from your diary, they pick their… | 37 | explainer
HM interviews | hiring interviews/page.tsx:501 | Their next task: Nothing — candidates pick their own time… Then: Each booking takes… | 30 | other (receipt)
HM interviews | hiring interviews/page.tsx:564 | Full evidence for each candidate is in the shortlist your recruiter sent you. Hold… | 45 | note
HM interviews | hiring interviews/page.tsx:671 | Answer these once. Every candidate you invite is offered times that obey them, and… | 50 | note
HM interviews | hiring interviews/page.tsx:723 | Read N busy spans from your calendar. Nothing about them is stored. | 13 | note
HM interviews | hiring interviews/page.tsx:739 | Widen the range, raise the daily limit, or invite fewer people for now —… | 22 | note
HM interviews | components/agency/cohort-board.tsx:243 | Each candidate picks their own time from the windows you offered. A time taken… | 18 | note

== HM interview/write-up (round page, RoundActions, interview room modal) ==
HM round | app/hiring/roles/[roleId]/round/[n]/page.tsx:69 | Nobody has been invited yet. Choose who to interview on the shortlist, and offer… | 17 | empty-state
HM round | round/[n]/page.tsx:88 | Write up what you saw, then decide. Advancing invites them to round N+1. | 15 | subtitle
HM round | round/[n]/page.tsx:95 | Your recruiter has not confirmed this interview took place yet — you can still… | 18 | note
HM round | round/[n]/page.tsx:166 | When everyone in round N is decided, this role moves on… / Round N is decided… | 17 | other (HandOff)
HM round | components/agency/hm-shared.tsx:391 | Yours and reversible — deciding again replaces this one. Declining records your view of… | 23 | note
HM round | hm-shared.tsx:402 | Nothing to do until this has happened. Your write-up and decision open here afterwards. | 14 | note
HM round | hm-shared.tsx:421 | You {decided} on {date}. The write-up it rests on is on file… Deciding again replaces… | 25 | note
HM round | components/agency/interview-room.tsx:186 | You can open a room for somebody your recruiter has actually sent you. If… | 22 | empty-state
HM round | interview-room.tsx:288 | Your decision should rest on a record rather than a memory, so the buttons… | 27 | note
HM round | interview-room.tsx:334 | Nobody is removed by any of these, and the candidate is not told. Your… | 26 | note
HM round | interview-room.tsx:347 | This room stays readable. A decision is append-only — what is above is the… | 22 | note

== HM decision ==
HM decision | app/hiring/roles/[roleId]/decision/page.tsx:63 | Your recruiter handles references, the offer and the handover. Nothing here closes the role. | 16 | subtitle
HM decision | decision/page.tsx:90 | Next, your recruiter collects references and prepares the handover pack. You will get… | 19 | other (HandOff)
HM decision | components/agency/hm-final-choice.tsx:141 | Your recruiter now takes references and the offer. … / Your recruiter will talk… | 20 | subtitle
HM decision | hm-final-choice.tsx:198 | Choosing one does not turn anyone else down. Your recruiter speaks to everyone, and… | 25 | subtitle
HM decision | components/agency/hm-shared.tsx:504 | You told your recruiter you had finished deciding on {date}. They are taking it… | 25 | subtitle
HM decision | hm-shared.tsx:515 | When you have decided on everyone you want to, say so and your recruiter… | 25 | subtitle
HM decision | components/agency/hm-round-request.tsx:89 | When your recruiter books it, the round appears on this page and in your… | 24 | subtitle
HM decision | hm-round-request.tsx:181 | Nobody is told anything. Your recruiter plans the round and books it from your diary. | 14 | footnote

== HM handover ==
HM handover | app/hiring/roles/[roleId]/handover/page.tsx:42 | They are collecting references and putting together the record for the person you took… | 30 | note card
HM handover | handover/page.tsx:57 | {title} · prepared by {agency}. From here you hold this record as the employer. | 11 | subtitle
HM handover | handover/page.tsx:116 | In your own words, as sent. Not edited by the agency. | 10 | note

== HM brief (uses brief-form; form items are listed under step 01) ==
HM brief | app/hiring/briefs/[briefId]/page.tsx:143 | No brief was sent to you at this address. If your recruiter mentioned one… | 18 | empty-state
HM brief | briefs/[briefId]/page.tsx:165 | Both sides have signed vN. It runs … Changing it now would make vN+1… | 22 | subtitle
HM brief | briefs/[briefId]/page.tsx:171 | You sent vN on {date}. Nothing to do until {agency} signs or changes it. | 15 | subtitle
HM brief | briefs/[briefId]/page.tsx:196 | Only the job description and the four numbered sections after it are yours to… | 28 | note
HM brief | briefs/[briefId]/page.tsx:245 | N changes. Sending signs the new version for you and clears {agency}'s approval… / Approving signs… | 20 | note
HM brief | components/agency/brief-review.tsx:125 | Change any of these and the brief becomes a new version, signed by you… | 17 | note
HM brief | brief-review.tsx:146 | Read these. If one is wrong, say so — that is a change too… | 19 | note

== HM invite ==
HM invite | app/hiring/invite/[token]/page.tsx:66 | Invitation links stop working once they have been used, once they expire, and the… | 32 | empty-state (dead link)
HM invite | invite/[token]/page.tsx:306 | You are signed in as a different account, and access is only ever given… | 46 | note
HM invite | invite/[token]/page.tsx:326 | Accepting opens a workspace where you brief roles, offer interview times and record your… | 34 | subtitle
HM invite | invite/[token]/page.tsx:332 | This invitation was issued to {masked} — accepting checks that against the address you… | 16 | note
HM invite | invite/[token]/page.tsx:367 | They want you as the hiring manager for {company}: briefing roles, offering interview times… | 23 | subtitle
HM invite | invite/[token]/page.tsx:385 | We sent a sign-in link to that address. Open it on this device to… | 24 | note
HM invite | invite/[token]/page.tsx:424 | The link and the code each work once and expire after about an hour… | 20 | note
HM invite | invite/[token]/page.tsx:456 | No password. We email you a link, and you already have a Tailr account… | 27 | note

== Booking page ==
Booking | app/booking/[token]/page.tsx:134 | It may have been used already, or the interview may have been rearranged. Reply… | 22 | empty-state (invalid)
Booking | booking/[token]/page.tsx:201 | {agency} has arranged an interview with {where}. Pick whichever of these works — the… | 23 | subtitle
Booking | booking/[token]/page.tsx:223 | Every time has been taken. Your recruiter will be in touch with more — nothing… | 17 | empty-state
Booking | booking/[token]/page.tsx:228 | The times still open are too soon to book here. Your recruiter will arrange… | 20 | empty-state
Booking | booking/[token]/page.tsx:233 | No times have been offered yet. Your recruiter will send some — nothing about… | 22 | empty-state
Booking | booking/[token]/page.tsx:259 | No account needed. If none of them work, say so and your recruiter arranges… | 33 | footnote
Booking | booking/[token]/page.tsx:270 | {agency} has arranged an interview with {where}. Please say whether it works. | 14 | subtitle
Booking | booking/[token]/page.tsx:310 | No account needed. If you cannot make it, the time goes back and someone… | 29 | footnote
Booking | booking/[token]/page.tsx:324 | Your current time stays yours until you choose another, so you cannot end up with none. | 16 | subtitle
Booking | booking/[token]/page.tsx:333 | There are no other times free at the moment. Reply to your recruiter and… | 16 | empty-state
Booking | booking/[token]/page.tsx:412 | The calendar file was attached to the email. If anything else changes, reply to… | 21 | footnote
Booking | booking/[token]/page.tsx:423 | {agency} has been told, and someone will be in touch about another time. You… | 25 | other
Booking | booking/[token]/page.tsx:435 | It was cancelled after the invitation went out. Reply to the email it came from… | 18 | other

== Consent ==
Consent | app/consent/[token]/page.tsx:187 | It may have been used already, or the interview may have changed. Your recruiter… | 24 | empty-state (invalid)
Consent | consent/[token]/page.tsx:219 | Your answer has been changed to not recorded. The recording and its transcript have… | 41 | other (saved)
Consent | consent/[token]/page.tsx:226 | You can change this at any time, including after the interview. If you change… | 30 | other (saved)
Consent | consent/[token]/page.tsx:250 | Sent on behalf of {agency}, who is responsible for your data. Tailr processes it… | 18 | footnote (saved screen)
Consent | consent/[token]/page.tsx:269 | Your {role} interview is on {when}. Before it happens we need one answer from… | 23 | subtitle
Consent | consent/[token]/page.tsx:274 | What recording would mean. The audio of the call is transcribed. Your recruiter uses… | 37 | explainer
Consent | consent/[token]/page.tsx:279 | What it does not mean. Nothing decides anything about you automatically. No software scores… | 40 | explainer
Consent | consent/[token]/page.tsx:284 | If you would rather not. Say no and the interview happens exactly the same… | 50 | explainer
Consent | consent/[token]/page.tsx:296 | You pressed {X} in the email. Nothing has been saved yet. Choose below and… | 26 | note
Consent | consent/[token]/page.tsx:312 | Record it. The audio is transcribed so what you said is quoted accurately against… | 15 | note (option)
Consent | consent/[token]/page.tsx:325 | Do not record it. The people you meet write up their notes afterwards instead. | 10 | note (option)
Consent | consent/[token]/page.tsx:345 | You can change your mind at any point — before the call, during it, or… | 60 | footnote
Consent | consent/[token]/page.tsx:353 | Sent on behalf of {agency}, who is responsible for your data. Tailr processes it… | 18 | footnote

== Reference ==
Reference | app/reference/[token]/page.tsx:232 | It may have been used already. If you think you still need to reply… | 26 | empty-state (invalid)
Reference | reference/[token]/page.tsx:251 | {agency} is responsible for the details they hold about you. You can ask to… | 32 | footnote (done screen)
Reference | reference/[token]/page.tsx:268 | {agency} is supporting {candidate} with a job application, and they named you as someone… | 37 | subtitle
Reference | reference/[token]/page.tsx:274 | You are under no obligation. There is a "prefer not to" button at the… | 23 | note
Reference | reference/[token]/page.tsx:71 (rendered 284) | Month and year is plenty — a rough answer is better than none. | 12 | note (field hint)
Reference | reference/[token]/page.tsx:80 (rendered 284) | Month and year. | 3 | note (field hint)
Reference | reference/[token]/page.tsx:91 (rendered 329) | In your own words. Whatever you write is passed on exactly as written —… | 15 | note (field hint)
Reference | reference/[token]/page.tsx:101 (rendered 329) | A notice period, or a correction to the dates above. Optional. | 12 | note (field hint)
Reference | reference/[token]/page.tsx:362 | What we hold about you. Your name, your email address and your relationship to… | 70 | footnote

== Portal ==
Portal | app/portal/[token]/page.tsx:76 | Shortlist links are personal and they expire. Contact your recruiter for a fresh one. | 13 | empty-state (invalid)
Portal | portal/[token]/page.tsx:116 | Name withheld at the candidate's request. Your recruiter can introduce you. | 12 | note
Portal | portal/[token]/page.tsx:143 | {agency} has been notified. They will confirm next steps with you directly. Nothing is… | 18 | other (post-action)
Portal | portal/[token]/page.tsx:208 | {agency} did not include scores or the evidence with this shortlist. Withheld, not missing… | 20 | note
Portal | portal/[token]/page.tsx:220 | Every score above traces to CV evidence or the recruiter's screening call. Declining flags… | 21 | footnote

== Rights ==
Rights | app/rights/[token]/page.tsx:96 | If your data was deleted, the link stops working. Reply to the email you… | 18 | empty-state (invalid)
Rights | rights/[token]/page.tsx:111 | You are being considered for {role} in {loc}. Below is what that means and… | 18 | subtitle
Rights | rights/[token]/page.tsx:119 | They have to respond. If you asked for deletion, your data is removed once… | 20 | other (post-action)
Rights | rights/[token]/page.tsx:128 | Your CV, your contact details, and their assessment of that CV against this one… | 45 | explainer card (What they hold)
Rights | rights/[token]/page.tsx:154 | Putting you forward means sharing your CV and their assessment of it with the… | 45 | explainer card (Being put forward)
Rights | rights/[token]/page.tsx:173 | You can withdraw that at any time. Withdrawing stops anything being sent from now… | 25 | note
Rights | rights/[token]/page.tsx:187 | {agency} cannot put you forward for this role. Nothing else changes — you are still… | 30 | note
Rights | rights/[token]/page.tsx:28-31 | Ask for a copy of everything they hold about you / Tell them what is wrong… (4 option blurbs) | 37 | note
Rights | rights/[token]/page.tsx:237 | Requests go to {agency}, who is responsible for your data. Tailr processes it on… | 23 | footnote

== TOTALS (items / approx words) ==
Recruiter · Today: 6 / 92
Recruiter · Roles list: 2 / 31
Recruiter · Role chrome (sidebar, header, brief chip): 3 / 68
Recruiter · Step 01 Role & brief (incl. brief-editor, brief-review and brief-form): 33 / 589
Recruiter · Step 02 Check requirements: 6 / 81
Recruiter · Step 03 Candidates (incl. matching window): 13 / 352
Recruiter · Step 04 Screening: 2 / 39
Recruiter · Step 05 Compare (incl. rail and recommendation): 12 / 300
Recruiter · Step 06 Submission: 18 / 390
Recruiter · Candidate detail modal: 6 / 92
Shared · Compliance (modal and candidate file): 6 / 95
Shared · References (candidate file and close-out): 3 / 66
Recruiter · Candidate file: 4 / 73
Recruiter · Candidates list: 4 / 88
Recruiter · Dossier: 10 / 190
Recruiter · Interviews (incl. cohort board and capture): 23 / 634
Recruiter · Close-out/handover: 23 / 419
Recruiter · Clients: 13 / 353
Recruiter · Settings (incl. team section): 16 / 417
Recruiter · Audit: 4 / 113
Recruiter · Notifications: 12 / 341
Recruiter · Briefs: 5 / 105
Recruiter · Sign-in: 5 / 122
HM · Shared frame: 3 / 35
HM dashboard: 2 / 40
HM roles list: 3 / 46
HM diary: 2 / 29
HM role room · shortlist: 17 / 288
HM interview setup: 7 / 215
HM interview/write-up: 11 / 226
HM decision: 8 / 168
HM handover: 3 / 51
HM brief: 7 / 139
HM invite: 8 / 222
Booking: 13 / 276
Consent: 13 / 392
Reference: 9 / 230
Portal: 5 / 84
Rights: 9 / 261

Recruiter surface subtotal: 229 items / ~5,109 words
Hiring-manager surface subtotal: 74 items / ~1,459 words
Token doorways subtotal: 49 items / ~1,243 words
GRAND TOTAL: 352 items / ~7,811 words```
