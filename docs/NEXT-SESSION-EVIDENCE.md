# Next session: the evidence record still speaks the old language

_Written 14 September 2026, at the end of the session that rebuilt the other half._

## Paste this as the opening prompt

> Rebuild the evidence surface on candidate detail (step 06) so it speaks the
> same language as the screening card we shipped on 14 Sep. Read
> `docs/NEXT-SESSION-EVIDENCE.md` first — it has what is wrong, the shape that
> must NOT change, and how to verify. Read the `tailr-playbook` and `tailr-b2b`
> skills before touching anything.
>
> This is a UI change, so per CLAUDE.md it goes to Figma first and needs my
> sign-off on the frame before implementation.

## There are two evidence surfaces and only one was rebuilt

| | step 04 · screening | step 06 · candidate detail |
|---|---|---|
| class | `.ag-ev-card` | `.ag-evrow` |
| shape | one card per requirement | one **row** per requirement, expanding |
| strength | **labelled** — `STRONG 1.0` … | a bare coloured dot |
| legend | deleted, each option carries its own | **none anywhere on the screen** |
| the quote | body size, quoted, always visible | hidden behind a disclosure |
| an override | "Tailr read this as partial. You marked it strong." | a `Your call` chip |
| rebuilt | ✅ 14 Sep (`7119752`) | ❌ untouched |

`grep -c "ag-ev-pick\|strengthWeightLabel" components/agency/candidate-detail.tsx`
returns **0**. The two screens a recruiter moves between describe the same
four strengths in two different visual languages.

And step 06 now matters more than it did: since `7119752` it also renders as
a modal over compare, so it is the surface you land on most often.

## What is actually wrong

1. **Strength is colour alone, and here there is no legend at all.** Step 04
   at least had one above the list. This screen has nothing — the only cue
   that a requirement is `transferable` rather than `strong` is a hollow 8px
   circle versus a filled one. It is the same WCAG 1.4.1 fault we just fixed,
   in its worse form.

2. **The requirement text is truncated to one line.**
   `.ag-evrow-text { white-space: nowrap; text-overflow: ellipsis }` — on a
   screen whose whole job is reading the record. R02 on ROL-2411 is 140
   characters; you cannot read it without expanding the row.

3. **The quote is behind a click, one at a time.** `setOpen(isOpen ? null : req.id)`
   is an accordion, so reading the evidence for ten requirements is ten
   clicks and you can never see two at once. The quote is the thing the
   record exists for.

4. **`weightPoints` is a fourth copy of the weights.** `lib/agency/strengths.ts`
   now owns `STRENGTH_VALUE` and `strengthWeightLabel()`; this screen still
   has its own map. Same trap as the legend that was just deleted.

## The shape that must NOT change

**Do not turn it into nine stacked cards.** The compact row was a deliberate
choice — the CSS says so in as many words: _"One line per requirement,
opening to its source. Compact so nine of them read as a map rather than nine
stacked cards."_ Step 04 is a WORKING surface (one candidate, on a call,
making decisions); step 06 is a READING surface (the record, the whole map at
once). Sharing the vocabulary is the task. Sharing the shape is the failure.

So: the same words and weights, the same quote treatment, the same
override sentence — inside a row that still lets you see ten requirements
without scrolling.

Worth considering rather than assuming: whether the quote should be visible
inline at a reduced size instead of hidden, and whether the accordion should
allow more than one open. Both change how the map reads; decide deliberately.

## What must not regress

- **MISSING keeps its copy.** _"No evidence found in the CV for this
  requirement. Marked MISSING. Confirm on the screening call rather than
  assuming either way."_ That sentence does real work — it refuses to let an
  absence read as a negative judgement. Keep it, and keep `.ag-missing-chip`.
- **The evidence map is read-only here.** Overrides belong to step 04. This
  screen shows `Your call` where one was made; it must not grow a picker.
- **`evidence.find()` must never return inside a row.** The performance
  invariant in the `tailr-b2b` skill: evidence is indexed into a Map once per
  data change. Note `content-visibility` is on `.ag-mx-row` and `.ag-ev-card`
  but NOT on `.ag-evrow` — if rows grow taller, that is worth adding rather
  than assuming it is already there.
- **The screen is two files now.** `page.tsx` is a 74-line shell;
  `components/agency/candidate-detail.tsx` draws it. Guards use
  `screenSource()` from `lib/__tests__/helpers/source-scan.ts`, which reads
  both — three tests broke on 14 Sep because they read only the page.
- **It renders in two places.** Anything added must work inside
  `.ag-modal-body` as well as on the page. `inModal` suppresses page chrome
  and nothing else.

## Files

- `components/agency/candidate-detail.tsx` — the surface, around line 238
- `app/agencies/agencies.css` — `.ag-evrow*` (≈883), `.ag-ev-*` (≈401, the
  new vocabulary to borrow), `.ag-det-side` (≈862)
- `lib/agency/strengths.ts` — `STRENGTHS`, `STRENGTH_VALUE`,
  `strengthWeightLabel()`. One definition. Do not make a fifth.
- `lib/__tests__/candidate-detail-modal.test.ts` — the modal's 14 pins
- Figma `AWRRbEOX6rLsltutFDL3zs`, frame `06 · The evidence card` (365:2) —
  the language to extend; frame `07` (369:2) for the modal it lives in

## Seeded data to test against

**ROL-2411 · AI & Automation Consultant**, 10 requirements, seeded 14 Sep:

| | overall | musts | spread |
|---|---|---|---|
| CAN-01 Priya Raman | 94 | 5/5 | 9 strong, 1 partial |
| CAN-02 Marcus Bell | 56 | 3/5 | 4 strong, 4 partial, 2 missing |
| CAN-03 Ada Okonkwo | 30 | 0/5 | 1 strong, 2 transferable, 2 partial, 5 missing |
| CAN-04 Tom Vance | 18 | 1/5 | 1 strong, 2 partial, 7 missing |

CAN-03 is the one to design against: every strength appears, five gaps.
All four are `SEEDED FIXTURE` with `o.oifoh+seed-*@gmail.com` addresses.

## Verify

- Typecheck, `npx vitest run`, production build with placeholder env.
- **Render it, do not read it back.** Two things that cost time on 14 Sep:
  `var(--ag-bg)` does not exist in that stylesheet and resolved to nothing,
  so a panel was transparent and nobody could tell from the source; and CSS
  edits were confirmed by curling the served chunk, not the file, because
  Turbopack has served a stale `globals.css` before.
- **A harness must reproduce the ancestor chain.** `.ag-app` is
  `display: flex`, so a test wrapper with an explicit width shrinks to
  content; and every design token is scoped to `.ag-app`, so anything
  rendered outside it computes every `var()` to nothing. Both look exactly
  like broken CSS and both nearly caused a fix to working code.
- **Probe every guard.** Introduce the regression deliberately and watch the
  test fail. Two pins shipped this week that could not fail: one asserted a
  string existed "somewhere in the file" while the writer's copy was gutted,
  and one accepted `CONCURRENCY = 1` as a bounded pool.
- Walk it on staging at desktop and at 375px, and inside the modal as well as
  on the page. Run the `web-design-guidelines` skill on the changed screen.

## Still open, and not this task

- **The signed-in walk-through has never happened.** Nobody has pressed
  "That's all my decisions" as a hiring manager, recorded an off-process
  placement, or seen the matched cards with two accounts discoverable.
- **The capture/enrichment half of the DPIA gate is closed.** Interview
  capture, transcription and per-round enrichment stay unbuilt;
  `round_artifacts.kind` still has no `transcript` writer.
