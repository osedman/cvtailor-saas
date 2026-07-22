# First CV Builder — Career Path Feature Plan

## Handoff block

Tailr is adding an employment-focused first-CV builder to Career Path for sixth-form students and apprenticeship candidates who may have no formal CV or paid-work history. The chosen approach is an evidence-first guided builder: users upload school documents, certificates, project or portfolio material, and optionally type experiences; Tailr extracts possible facts into a private evidence inbox; the user confirms or edits every fact; Tailr asks short follow-up questions for missing context; it then generates an editable, ATS-safe CV that can be downloaded. The AI must never invent experience, grades, dates, skills, metrics, or responsibilities. Existing PDF/DOCX/TXT parsing, authentication, rate limiting, Career Path navigation, and evidence-only prompt conventions should be reused. Start with Stage 0 validation, then Stage 1's thin end-to-end typed-evidence flow. Update this file at every stage boundary, recording any changed decision and why.

**Staging implementation status (19 July 2026):** The first end-to-end staging slice is implemented in code at `/career-path/first-cv`: manual evidence, in-memory PDF/DOCX/TXT extraction, mandatory evidence review, evidence-grounded generation, editable persisted draft, Word download, and preload into `/tailor`. Migration `010_first_cv_builder.sql` must be applied to `tailr-staging` before browser testing. Follow-up questions, richer structured editing, analytics, research validation, and pilot hardening remain pending. The upload slice was pulled forward because document-assisted creation is core to the requested staging test; uploaded binaries are discarded rather than retained.

## Product definition

### User and job to be done

Primary users are UK sixth-form students and apprenticeship candidates, broadly age 16–19, who want a CV for employment, work experience, internships, part-time work, or apprenticeship applications. They may have useful evidence but not know that school projects, clubs, caring responsibilities, volunteering, awards, portfolios, informal work, and certificates belong on a CV.

The smallest genuinely useful outcome is:

> A user with no existing CV can give Tailr at least one piece of evidence, confirm what Tailr understood, add missing context, and download a truthful first CV they can apply with.

This feature does not create sixth-form, college, UCAS, or university applications. It may ingest education-related evidence, but its output is an employment CV.

### MVP scope

- Entry point on `/career-path`: **Build my first CV**.
- Choose a starting method: upload evidence, type experience, or both.
- Accept PDF, DOCX, and TXT in the MVP, reusing the current parser; image/OCR support is a later slice.
- Recognise evidence from education, projects/portfolio, volunteering, clubs and responsibilities, awards/certificates, paid or informal work, and skills.
- Show extracted claims as reviewable evidence cards with source labels and confidence/needs-review state.
- Let the user edit, confirm, exclude, or manually add evidence before generation.
- Ask a small number of contextual follow-ups only where needed, such as what they did, tools used, result, dates, and target opportunity.
- Generate one editable, ATS-safe UK CV with sections selected according to available evidence.
- Allow preview, section editing, regeneration of wording, save, and download.
- Keep the existing adult Career Path experience intact.

### Explicitly out of scope for MVP

- UCAS statements, college applications, or personal statements.
- Job-specific tailoring; the finished CV can enter the existing `/tailor` flow later.
- Public portfolio pages and employer sharing links.
- Automated reference checks or verification of certificate authenticity.
- Email or cloud-drive imports.
- Collaborative editing by a parent, teacher, or careers adviser.
- Multiple visual templates; ship one strong ATS-safe template first.
- Scanned-image OCR until the text-based upload path is validated.

## Success measures

Instrument these events without recording document text or CV content:

- `first_cv_started`
- `evidence_source_added` with source type and file type only
- `evidence_review_completed`
- `first_cv_generated`
- `first_cv_edited`
- `first_cv_downloaded`
- `first_cv_sent_to_tailor`

Pilot targets, to be confirmed after baseline measurement:

- At least 60% of starters reach evidence review.
- At least 40% of starters generate a CV.
- At least 30% of generated CVs are downloaded.
- Median time from first source to first draft is under 10 minutes.
- In moderated review, zero unsupported factual claims in generated CVs.

## Approach decision

### Chosen: evidence inbox plus guided CV editor

Documents are inputs to a structured evidence record, not direct instructions to an AI writer. The user verifies evidence before it can enter a CV. This gives the user help discovering transferable experience while keeping the truth boundary visible and testable. It also supports users with no documents by allowing manual evidence cards.

### Rejected alternative: blank form first

A conventional form is cheapest to build and easiest to reason about, but it assumes the user already understands CV language and which experiences count. That is the main problem this audience needs Tailr to solve. Manual entry remains available as a source method, not the entire experience.

### Rejected alternative: upload and instantly generate

This is the fastest visible demo, but it makes extraction mistakes and invented connections difficult for a young user to spot. It also produces brittle results from sparse documents. Generation must happen only after a review checkpoint.

### Rejected alternative: extend `career_profiles.sections` only

The existing career profile is shaped around extracting a highlight reel from an existing CV. First-CV building needs source traceability, confirmation state, selective inclusion, and multiple drafts. Reusing the same JSON blob would hide provenance and make individual updates awkward. The feature should have first-class evidence and CV records, with a deliberate adapter into existing tailoring later.

## User experience

1. On Career Path, a user with no substantive CV sees **Build your first CV** alongside the existing path experience.
2. A short introduction explains that paid work is not required and names examples: school projects, volunteering, clubs, caring, informal work, certificates, and portfolios.
3. The user uploads one or more supported documents or chooses **Tell us instead**.
4. Each source is parsed and converted into evidence suggestions. The raw source filename is shown so the user knows where each suggestion came from.
5. The user reviews cards: confirm, edit, exclude, or mark unsure. Nothing unconfirmed is used in the CV.
6. Tailr asks up to five short follow-up questions, prioritising missing action, skill, outcome, date, and target-role context. “I don’t know” and skip are always available.
7. Tailr generates a first draft. Empty or unsupported sections are omitted rather than padded.
8. The user edits structured sections and sees a live one-page/two-page preview.
9. The user downloads the CV and may continue to the existing Tailor flow with the generated CV preloaded.

### Age-appropriate content and language

- Say “experience” rather than “employment history” during intake.
- Explain transferable skills with examples, but do not turn examples into user claims.
- Do not ask for date of birth, photo, marital status, National Insurance number, or full home address.
- Recommend town/city and a professional email address; warn before including sensitive contact details.
- Do not infer protected characteristics, health information, socioeconomic status, or school performance from indirect evidence.
- Use encouraging copy without overstating readiness or guaranteeing outcomes.

## Data design

Create a migration after Stage 0 validates the terminology. Suggested tables:

### `cv_evidence_sources`

- `id uuid primary key`
- `user_id uuid not null references auth.users on delete cascade`
- `kind text`: `document | portfolio_link | manual`
- `display_name text`
- `mime_type text null`
- `storage_path text null`
- `extracted_text text null` for MVP only if retention is explicitly approved
- `parse_status text`: `pending | processing | ready | failed`
- `created_at`, `updated_at`

### `cv_evidence_items`

- `id uuid primary key`
- `user_id uuid not null references auth.users on delete cascade`
- `source_id uuid null references cv_evidence_sources on delete set null`
- `category text`: `education | project | work | volunteering | responsibility | award | certificate | skill | activity | other`
- `title text`
- `organisation text null`
- `start_date text null`, `end_date text null`
- `description text`
- `skills jsonb default '[]'`
- `outcomes jsonb default '[]'`
- `source_excerpt text null`
- `review_status text`: `suggested | confirmed | excluded`
- `created_at`, `updated_at`

### `first_cvs`

- `id uuid primary key`
- `user_id uuid not null references auth.users on delete cascade`
- `title text not null default 'My first CV'`
- `target_opportunity text null`
- `sections jsonb not null`
- `template text not null default 'ats_classic'`
- `status text`: `draft | ready`
- `created_at`, `updated_at`

Add RLS policies for select/insert/update/delete using `auth.uid() = user_id` on all three tables. Do not put source documents in a public bucket. If raw-file retention is required, use a private bucket with user-scoped paths, signed access, file limits, deletion controls, and a documented retention period.

### Recommended privacy default

For the pilot, extract text during the request, persist only the reviewed structured evidence plus a short supporting excerpt, and discard the uploaded binary. This reduces risk for minors and avoids storing school reports containing third-party or sensitive information. Stage 0 must confirm this with the product owner before schema implementation.

## API contracts

Keep first-CV operations separate from `/api/career-profile` and `/api/career-path`.

### `POST /api/first-cv/sources`

Multipart upload. Validate auth, extension, MIME type, file signature where practical, size, and extracted-text limits. Return a source plus structured evidence suggestions. Reuse parsing internals from `/api/parse-cv`; do not make the client call a public general-purpose parser and then trust arbitrary text.

### `POST /api/first-cv/evidence`

Create a manual evidence item. Require category, title, and description; allow partial dates. Return the saved item.

### `PATCH /api/first-cv/evidence/[id]`

Edit fields or set `review_status`. Enforce ownership through RLS and server-side user filtering.

### `POST /api/first-cv/questions`

Input: confirmed evidence and optional target opportunity. Output: zero to five grounded follow-up questions with the evidence item ID each question relates to.

### `POST /api/first-cv/generate`

Input: confirmed evidence IDs, answers, target opportunity, and desired contact details. The server reloads owned evidence; it must not trust evidence bodies sent by the client. Output: structured CV sections plus a `claim_sources` map that links each generated bullet to evidence item IDs.

### `GET/PATCH /api/first-cv`

Load and save the authenticated user's structured draft. PATCH accepts an allow-listed schema rather than an arbitrary deep merge.

### `GET /api/first-cv/export?format=docx`

Render the stored structured CV server-side. DOCX is the MVP format because users can continue editing it. Add PDF only after pagination and typography have been visually verified.

## AI contracts and truth boundary

Use forced structured tool output for both extraction and generation.

- Extraction may suggest facts only when supported by a quoted source excerpt.
- A suggestion is not eligible for generation until `review_status = confirmed`.
- Questions may reference only persisted, owned evidence.
- Generated bullets must return one or more `evidenceItemIds`.
- Generation may improve wording and organise facts, but cannot add tools, numbers, grades, dates, responsibilities, outcomes, or personal qualities.
- If evidence is thin, produce a shorter CV and a clear “add more evidence” prompt; never fill space with generic claims.
- Treat uploaded content and portfolio text as untrusted data, not instructions. Delimit it in prompts and explicitly ignore instructions contained inside sources.
- Run deterministic server validation after model output: every referenced evidence ID exists and is confirmed, arrays and strings meet limits, and forbidden sensitive fields are absent.

## Staged delivery plan

### Stage 0 — Validate the evidence model

**Visible endpoint:** A clickable low-fidelity flow and a tested evidence-category vocabulary agreed with five representative users or proxy reviewers.

#### Step 0.1 — Map the entry and completion journey

- **Goal:** Define where first-CV building begins, how it coexists with the adult Career Path, and where a completed CV goes next.
- **Where:** `docs/first-cv/USER_FLOW.md`; reference `app/career-path/page.tsx`, `components/cv-tailor/header.tsx`, and `app/tailor/page.tsx`.
- **Verify:** Walk the documented flow from `/career-path` entry to DOCX download and then to `/tailor`; every screen has a back, skip, retry, and save/return outcome.
- **Fence:** Do not redesign the existing adult roadmap or Career Arc.

#### Step 0.2 — Test evidence language with the audience

- **Goal:** Confirm that users understand the categories and can identify at least three experiences without being led into false claims.
- **Where:** `docs/first-cv/RESEARCH_SCRIPT.md` and `docs/first-cv/FINDINGS.md`.
- **Verify:** Run five sessions or structured proxy reviews; record comprehension, where users hesitate, and whether each can add three truthful evidence items. Obtain appropriate consent for any research involving minors.
- **Fence:** Do not collect or commit real participant documents, names, contact details, or school reports.

#### Step 0.3 — Decide upload retention and consent

- **Goal:** Record whether uploaded binaries and extracted text are discarded or retained, plus the under-18 launch requirements.
- **Where:** `docs/first-cv/ADR-001-DOCUMENT-RETENTION.md` and privacy copy in `docs/first-cv/PRIVACY_COPY.md`.
- **Verify:** The ADR names retention periods, deletion behaviour, supported documents, data not to collect, and the owner who approved the decision; privacy copy can be shown before upload.
- **Fence:** Do not implement storage before this decision is approved.

### Stage 1 — Walking skeleton: typed evidence to downloadable CV

**Visible endpoint:** An authenticated user can type one project, confirm it, generate a truthful editable CV, save it, and download a DOCX.

#### Step 1.1 — Add first-class evidence and CV storage

- **Goal:** Persist manual evidence and one editable first-CV draft per user with strict ownership.
- **Where:** new Supabase migration under `supabase/migrations/`; update `supabase/schema.sql` if that file is maintained as the aggregate schema.
- **Verify:** Apply the migration in a local/test Supabase environment; user A can CRUD their records, user B cannot read or modify them, and anonymous access fails.
- **Fence:** Do not modify existing `career_roadmaps`, `career_profiles`, or `tailor_history` semantics.

#### Step 1.2 — Build the manual evidence intake and review UI

- **Goal:** Let a user add, edit, confirm, and exclude an experience without uploading a document.
- **Where:** `app/career-path/page.tsx` entry integration; new components under `components/first-cv/`; new routes under `app/api/first-cv/`.
- **Verify:** In the browser, add a school project, refresh, edit it, confirm it, exclude it, and restore it; state persists and another user cannot access it.
- **Fence:** Do not add AI or file upload in this step.

#### Step 1.3 — Generate a grounded structured CV

- **Goal:** Turn confirmed evidence and short user answers into editable structured sections with claim provenance.
- **Where:** `lib/anthropic.ts` or a focused `lib/first-cv-ai.ts`; `app/api/first-cv/generate/route.ts`; unit fixtures under `lib/__tests__/`.
- **Verify:** With mocked model output, generation rejects unknown/unconfirmed evidence IDs; a sparse one-project fixture produces no invented jobs, dates, grades, or metrics; an injection-style evidence fixture cannot alter system rules.
- **Fence:** Do not produce job-specific tailoring or free-form HTML from the model.

#### Step 1.4 — Add the structured editor and DOCX export

- **Goal:** Let the user edit the draft, preview it, save it, and download a usable document.
- **Where:** `components/first-cv/cv-editor.tsx`, `components/first-cv/cv-preview.tsx`, `app/api/first-cv/export/route.ts`, and a focused document renderer in `lib/first-cv-export.ts`.
- **Verify:** Create a CV containing education, project, skills, and contact sections; download and open the DOCX; headings, bullets, dates, page breaks, links, and special characters render correctly; edited content survives refresh.
- **Fence:** Ship one ATS-safe template only; do not add PDF or visual theme selection.

### Stage 2 — Document-assisted evidence extraction

**Visible endpoint:** A user uploads a supported document, reviews source-linked suggestions, and uses confirmed items in their CV.

#### Step 2.1 — Extract documents through an authenticated source endpoint

- **Goal:** Reuse the PDF/DOCX/TXT parser safely for evidence sources and apply the approved retention decision.
- **Where:** extract shared parsing functions from `app/api/parse-cv/route.ts` into `lib/document-text.ts`; add `app/api/first-cv/sources/route.ts`.
- **Verify:** Upload valid PDF, DOCX, and TXT fixtures; reject unsupported types, mismatched signatures, empty/image-only files, oversized files, and unauthenticated requests; confirm discarded files are not left in storage.
- **Fence:** Do not add OCR, URL scraping, email imports, or cloud drives.

#### Step 2.2 — Convert source text into reviewable evidence suggestions

- **Goal:** Produce category-tagged suggestions with supporting excerpts and no unsupported facts.
- **Where:** `lib/first-cv-ai.ts`, source route, extraction schemas and fixtures.
- **Verify:** Golden fixtures for a certificate, school project, volunteering note, and sparse report produce only excerpt-supported suggestions; malicious instructions inside a file are treated as content; low-confidence details are omitted or flagged for review.
- **Fence:** Suggestions must never bypass the review state or write directly into the CV.

#### Step 2.3 — Add multi-source upload and provenance UI

- **Goal:** Make it clear which source supports each evidence item and allow retry/removal.
- **Where:** `components/first-cv/source-uploader.tsx`, evidence review components, Career Path flow state.
- **Verify:** Upload two files, observe independent progress/error states, remove one source, confirm its suggested items are handled according to the ADR, and generate from the remaining confirmed items.
- **Fence:** Limit the MVP to a small documented source count and total text budget; no background batch system yet.

### Stage 3 — Guided completeness and pathway connection

**Visible endpoint:** Tailr asks only relevant missing questions, scores draft completeness transparently, and passes the finished CV into the existing Tailor experience.

#### Step 3.1 — Add grounded follow-up questions

- **Goal:** Ask up to five questions that improve thin evidence without overwhelming the user.
- **Where:** `app/api/first-cv/questions/route.ts`, `lib/first-cv-ai.ts`, and `components/first-cv/follow-up-questions.tsx`.
- **Verify:** Fixtures with missing dates/actions/outcomes receive targeted questions; complete evidence receives zero or fewer questions; skipped answers do not block generation.
- **Fence:** Do not ask generic personality quizzes or infer answers.

#### Step 3.2 — Add deterministic completeness guidance

- **Goal:** Show what would materially strengthen the CV while distinguishing missing information from poor quality.
- **Where:** `lib/first-cv-completeness.ts`, unit tests, editor UI.
- **Verify:** Deterministic tests cover no contact method, no education, no evidence, missing dates, and strong complete drafts; the UI never presents the score as an employability prediction.
- **Fence:** Do not create an opaque AI “CV score” or rank the user against peers.

#### Step 3.3 — Hand the CV to the existing Tailor flow

- **Goal:** Let the user apply the first CV to a real apprenticeship or job description without copy/paste.
- **Where:** shared draft-loading logic used by `app/tailor/page.tsx` and the first-CV completion screen.
- **Verify:** Click **Tailor this CV**, arrive at `/tailor` with the generated CV loaded, paste a job description, and complete the existing tailoring flow; the saved first CV remains unchanged unless the user explicitly replaces it.
- **Fence:** Do not merge first-CV generation and job tailoring into one model call.

### Stage 4 — Pilot hardening and optional OCR

**Visible endpoint:** The pilot flow meets accessibility, security, quality, and funnel targets; OCR is added only if pilot evidence shows it is a major blocker.

#### Step 4.1 — Accessibility and mobile pass

- **Goal:** Make the entire wizard usable by keyboard, screen reader, small screens, and reduced-motion users.
- **Where:** all `components/first-cv/` UI and relevant global styles.
- **Verify:** Automated accessibility scan has no critical issues; complete the flow at 320px width and with keyboard only; errors and progress are announced; focus returns correctly after dialogs.
- **Fence:** Do not change unrelated Tailr screens.

#### Step 4.2 — Security and privacy verification

- **Goal:** Validate tenant isolation, upload safety, prompt-injection resistance, logs, deletion, and rate limits before a minor-facing pilot.
- **Where:** first-CV routes, RLS policies, storage policies if used, prompts, and privacy documentation.
- **Verify:** Automated ownership tests pass; adversarial documents cannot expose other records or override prompts; logs contain no document/CV bodies; user deletion removes all feature records and retained files; rate-limit tests return 429 as designed.
- **Fence:** Do not launch to minors until the product owner resolves the consent/age-gating requirement.

#### Step 4.3 — Run the pilot and decide on OCR

- **Goal:** Learn whether scanned certificates/images are common enough to justify OCR and identify the largest completion drop-off.
- **Where:** `docs/first-cv/PILOT_REPORT.md`; analytics dashboard configuration outside this repository if applicable.
- **Verify:** Review at least ten consented pilot journeys; record funnel numbers, unsupported-claim audit results, source-type frequency, failures, and an explicit ship/change/stop decision.
- **Fence:** Do not add OCR because it sounds useful; add it only if unsupported images are a material observed blocker.

## Test strategy

- Unit tests: evidence schemas, completeness rules, provenance validator, sensitive-field filter, and export mapping.
- Route tests: auth, RLS-backed ownership, payload limits, MIME/extension checks, model failures, retries, and rate limiting.
- Model contract tests: mocked forced-tool outputs, missing/unknown evidence IDs, prompt injection in source text, sparse inputs, and unsupported claims.
- Export tests: parse the generated DOCX structure and visually inspect fixture renders at each renderer change.
- End-to-end tests: manual evidence path, document evidence path, save/resume, edit/export, and handoff to Tailor.
- User validation: moderated pilot with an approved consent process; never use real participant files as committed test fixtures.

## Risks and tripwires

### Unsupported claims undermine trust

- **Tripwire:** Any generated sentence cannot be traced to a confirmed evidence item, or a pilot reviewer finds one invented detail.
- **Fallback:** Block generation at the provenance validator, fall back to a more literal template, and require manual editing for the affected field before export.

### School documents contain sensitive or third-party data

- **Tripwire:** Test uploads reveal health, safeguarding, disciplinary, parent, teacher, or other-student data in extracted text.
- **Fallback:** Default to discard-on-extract, detect and suppress sensitive categories, warn users before upload, and narrow supported document guidance to certificates and user-created work.

### Sparse evidence produces generic CVs

- **Tripwire:** Users reach preview with fewer than two meaningful evidence items or repeatedly delete generic generated text.
- **Fallback:** Stop before generation, show concrete prompts for additional evidence, and provide a shorter honest CV rather than padding.

### Image-based evidence dominates real usage

- **Tripwire:** More than 25% of attempted pilot sources fail because they are scans or photos.
- **Fallback:** Prioritise OCR as the next stage with strict image limits, privacy review, and the same excerpt/provenance requirement.

### The new entry confuses existing users

- **Tripwire:** Existing Career Path users choose first-CV building despite already having a substantive CV, or cannot find their roadmap.
- **Fallback:** Gate the prominent first-CV card to users without substantive CV history while keeping a smaller optional entry for everyone else; preserve existing navigation and state.

### Under-18 launch requirements are unresolved

- **Tripwire:** Consent, privacy notice, data retention, safeguarding ownership, or age gating lacks a named approver by the end of Stage 0.
- **Fallback:** Restrict testing to adult proxy users or 18+ apprenticeship candidates and do not launch to minors until approved.

## Open decisions to resolve in Stage 0

1. Confirm discard-on-extract versus temporary/private retention of original files.
2. Confirm whether the first release is 18+ only or includes 16–17-year-olds, and obtain the required legal/safeguarding decision.
3. Confirm whether portfolio links are manual descriptions in MVP or fetched from the web; recommendation is manual description for MVP.
4. Confirm DOCX-only export for MVP; recommendation is yes, followed by PDF after render testing.
5. Confirm whether a user can keep multiple first-CV drafts; recommendation is one master draft in MVP, with job variants handled by the existing Tailor history.

## First three executable tasks

1. Complete Step 0.1 and document the screen-by-screen journey, including existing-user gating and the handoff to `/tailor`.
2. Complete Step 0.3 and approve the document-retention and under-18 launch decisions before creating storage schema.
3. Build Step 1.1's RLS-protected evidence and first-CV schema, then prove cross-user isolation before adding AI or uploads.
