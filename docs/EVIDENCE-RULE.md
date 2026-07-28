# The Evidence Rule — gap referencing and everything after it

**Decided 28 July 2026 (Ose), following the 27 July product sync.**

## The rule

> AI may only write a line into a user's CV that cites evidence already
> present in their history — their CV text, their tailor runs, their uploaded
> documents, their passed evidence reviews. It may **reframe** what exists.
> It may **never invent** what doesn't.

If the user lacks a skill, the answer is a career-path item, not a CV line.

## Why this is a product decision, not a style preference

Tailr now runs two loops that pull in opposite directions:

1. **Presentation** — tailor the CV, close the wording gap, lift the match.
2. **Development** — put the real gap on the career path, close it with work,
   verify it with evidence.

Gap referencing (discussed 27 Jul: "take a gap, tell Tailr to add a line to
your CV relating to it") sits exactly on the fault line. Done wrong, it lets
the presentation loop eat the development loop: every gap becomes a paragraph
instead of a plan, the career path becomes decorative, and readiness scores
stop meaning anything.

And the contradiction is now commercial, not just philosophical: the
recruitment prototype scores candidates on **evidence strength (25%)** and
**confidence (10%)**. We cannot sell recruiters a tool for detecting inflated
CVs while selling candidates a tool that inflates them. One rule has to govern
both sides, and this is it.

## What the rule means concretely

**Allowed** — the model, given the gap "no Salesforce experience":
- Finds the user's CRM migration project in their history and surfaces it as
  transferable: *"Migrated 4,000 customer records between CRM platforms"* —
  real work, reframed toward the gap.
- Cites a skill closed on the career path **with a passed evidence review**
  (the Quick Wins evidence gate, shipped 27 Jul, already enforces this:
  `loadProvenSkills` only weaves in verified closes).

**Not allowed**:
- Writing *"Familiar with Salesforce administration"* because the JD wants it.
- Padding a weak bullet with capability claims the source text doesn't carry.
- Promoting a self-ticked (unverified) skill close into CV language.

**The boundary case** — the user insists: "just add it, I do know Salesforce."
Then the *user* types it. Hand-editing is theirs; the editor exists for
exactly this. The rule binds what **Tailr generates**, not what users write.
We are not the truth police for user-authored text; we are responsible for
machine-authored text.

## Where it's already enforced (verified in code, 28 Jul)

| Surface | Mechanism |
|---|---|
| Tailor pipeline | Prompt guardrails: every fact from source text, empty over guessed |
| Career Arc extraction | "never invent facts" instruction, pure CV extraction |
| Evidence edge → future CVs | `loadProvenSkills` — only PASSED evidence reviews are woven in; self-ticked closes never add a line and never lift the match |
| Score integrity | Evidence block is part of the tailor cache hash — unverified closes provably can't move the score |

## What it requires of gap referencing (when built)

1. The generation prompt for a gap-referenced line must receive **only** the
   user's own history as source material, with the same no-invention
   guardrails as the tailor pipeline, and must return **empty** when no
   transferable evidence exists.
2. An empty result renders as a career-path handoff — *"Nothing in your
   history covers this yet — add it to your path"* — never as a weaker,
   vaguer generated line.
3. Every generated line carries provenance (which history item it reframes)
   so the user can see the receipt, and so the recruitment product's evidence
   scoring stays coherent end to end.

## One sentence, for prompts and PRs

*Tailr reframes evidence; it never manufactures it. Empty beats invented.*
