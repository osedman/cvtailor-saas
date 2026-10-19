/**
 * Step 05 after Figma board 26 (node 528:2, signed off 24 Sep 2026): the
 * shortlist rail, the one verb per person, "add in one go", and the
 * recommendation tab carrying decisions.
 *
 * The line the board keeps, and these guards keep with it: nothing is
 * decided for the recruiter. Every add — single or bulk — is their click,
 * through the same human-only path. The recommendation writes nothing by
 * itself. Confirm sends nothing; it opens step 07 exactly as "Build
 * submission" did. And the word on screen for the stored value "reject" is
 * "pass" — the stored value and the API do not change.
 *
 * Source scans, per the repo's habit: every assertion below was checked
 * against the pre-board code to make sure it would have failed there.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { countWord, countWordCap } from "@/components/agency/count-word"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const PAGE = read("app/agencies/roles/[roleId]/page.tsx")
const PANEL = read("components/agency/recommendation-panel.tsx")
const SLOT = read("components/agency/decision-slot.tsx")
const RAIL = read("components/agency/shortlist-rail.tsx")
const CSS = readFileSync(join(process.cwd(), "app/agencies/agencies.css"), "utf8")

/** The compare step's render only — between its guard and step 07's. */
function compareStep(): string {
  const start = PAGE.indexOf('step === "compare" && (() => {')
  const end = PAGE.indexOf('step === "submission" && (() => {', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return PAGE.slice(start, end)
}

/** JSX text nodes: what sits between a closing `>` and the next tag or brace. */
const jsxText = (src: string) => [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1])

describe("the header and the bar", () => {
  const step = compareStep()

  it("the header is the title alone (frame 45) — Build submission has left it", () => {
    expect(step).not.toContain("Build submission")
    const head = step.slice(step.indexOf('className="ag-screen-head"'), step.indexOf("ag-cmp-layout"))
    expect(head).toMatch(/<h1 className="ag-title">Compare<\/h1>/)
    // One Back: the top nav's. The screen head's second one is gone.
    expect(head).not.toMatch(/>Back</)
    expect(head).not.toMatch(/ag-btn-primary/)
  })

  it("the decisions bar loses Continue to submission and carries the tally, with the keys behind its ⓘ", () => {
    expect(step).not.toContain("Continue to submission")
    const bar = step.slice(step.indexOf('className="ag-decisions-bar"'))
    expect(bar).toMatch(/<Hint\s+info\s+content=\{[\s\S]*?<kbd className="ag-kbd">S<\/kbd>[\s\S]*?Keys\s*<\/Hint>/)
    // In flow, not sticky: frame 45 found it covering the cards at 1440.
    expect(CSS).toMatch(/\.ag-decisions-bar \{ position: static; box-shadow: none; flex-wrap: wrap; \}\n@media \(min-width: 901px\)/)
    expect(bar).toMatch(/add \/ remove/)
    expect(bar).toMatch(/<kbd className="ag-kbd">H<\/kbd> hold/)
    expect(bar).toMatch(/<kbd className="ag-kbd">R<\/kbd> pass/)
    expect(bar).not.toMatch(/ag-btn/)
  })

  it("the tally names the states in the board's words", () => {
    expect(PAGE).toMatch(/shortlisted · \$\{decisionCounts\.hold\} on hold · \$\{decisionCounts\.reject\} passed/)
  })
})

describe("the rail", () => {
  it("is one component, rendered beside both tabs and again as the phone bar", () => {
    const step = compareStep()
    expect(step).toMatch(/<ShortlistRail \{\.\.\.railProps\} \/>/)
    expect(step).toMatch(/<ShortlistBar \{\.\.\.railProps\} \/>/)
    // The rail sits outside the tab switch, so it does not re-mount per tab.
    const railAt = step.indexOf("<ShortlistRail")
    const tabSwitch = step.lastIndexOf('compareTab === "board" ? (')
    expect(tabSwitch).toBeGreaterThan(-1)
    expect(railAt).toBeGreaterThan(tabSwitch)
  })

  it("Confirm opens the submission step and nothing else", () => {
    expect(compareStep()).toMatch(/onConfirm: \(\) => setStep\("submission"\)/)
    expect(RAIL).toMatch(/onClick=\{onConfirm\}[\s\S]{0,120}Confirm shortlist →/)
    expect(RAIL).not.toMatch(/fetch\(/)
    // Frame 43 (13 Oct 2026) removed board 40's next-stage caption: the
    // stage bar already names what comes next.
    expect(RAIL).not.toContain("Next: choose what else the client reads, then send.")
  })

  it("carries frame 45's words", () => {
    expect(RAIL).toContain(">Nobody yet<")
    expect(RAIL).toMatch(/Shortlist · \{n\}<\/h2>/)
    // Board 29's disclosure stays in full: the client sees names as they are added.
    expect(RAIL).toMatch(/sees each name as you add it\. The CV, evidence and scores wait for\s+the submission\./)
    // Held and passed are counts that open their list, through a view filter only.
    expect(RAIL).toMatch(/onShowList\?\.\("hold"\)[\s\S]{0,80}On hold · \{holdCount\}/)
    expect(RAIL).toMatch(/onShowList\?\.\("reject"\)[\s\S]{0,80}Passed · \{passedCount\}/)
    expect(compareStep()).toMatch(/onShowList: \(which: "hold" \| "reject"\) => \{\s*setCompareTab\("board"\)\s*setCandFilter\(which\)\s*\}/)
    for (const gone of ["Your next add lands here", "Kept for later. Never sent.", "Internal record only.", "in score order"]) {
      expect(RAIL).not.toContain(gone)
    }
    expect(RAIL).toMatch(/disabled=\{n === 0\}/)
  })

  it("removing from the rail goes through the single decision writer", () => {
    expect(compareStep()).toMatch(/onRemove: \(id: string\) => decide\(id, "shortlist"\)/)
  })

  it("the sheet keeps focus inside itself and silences S/H/R behind it", () => {
    // aria-modal promises nothing else is reachable; Tab wraps and the page is inert.
    expect(RAIL).toMatch(/if \(e\.key !== "Tab" \|\| !sheet\) return/)
    expect(RAIL).toMatch(/sheet\.querySelectorAll<HTMLElement>\(FOCUSABLE\)/)
    expect(RAIL).toMatch(/el\.setAttribute\("inert", ""\)/)
    expect(RAIL).toMatch(/el\.removeAttribute\("inert"\)/)
    // The page's key map does not fire while a modal dialog is up.
    const keys = PAGE.slice(PAGE.indexOf("const onKey = (e: KeyboardEvent) => {"), PAGE.indexOf("decide(target, next)"))
    expect(keys).toContain(`if (document.querySelector('[role="dialog"][aria-modal="true"]')) return`)
  })

  it("the phone bar names first names and opens the same rail as a sheet", () => {
    expect(RAIL).toMatch(/Shortlist · \{n\}/)
    expect(RAIL).toMatch(/\+\$\{firsts\.length - 3\} more/)
    expect(RAIL).toMatch(/role="dialog"/)
    expect(RAIL).toMatch(/<ShortlistRail\s+\{\.\.\.props\}[\s\S]{0,160}variant="sheet"\s*\/>/)
    expect(CSS).toMatch(/\.ag-sl-bar, \.ag-sl-scrim, \.ag-sl-sheet \{ display: none; \}/)
    expect(CSS).toMatch(/@media \(max-width: 900px\) \{[\s\S]*\.ag-cmp-rail \{ display: none; \}[\s\S]*\.ag-sl-bar \{[\s\S]*position: fixed/)
  })
})

describe("the cards", () => {
  it("the three-way segmented control is gone; the slot is the one control", () => {
    const step = compareStep()
    expect(step).not.toMatch(/\["shortlist", "hold", "reject"\]\.map/)
    expect(step).toMatch(/<DecisionSlot[\s\S]{0,200}onDecide=\{\(d\) => decide\(c\.id, d\)\}/)
  })

  it("the slot renders the three shapes with the board's words", () => {
    expect(SLOT).toMatch(/>\s*Add to shortlist\s*</)
    expect(SLOT).toContain("✓ Shortlisted")
    expect(SLOT).toMatch(/>\s*Remove\s*</)
    expect(SLOT).toContain('"On hold ✓" : "Hold"')
    expect(SLOT).toContain('"Passed ✓" : "Pass"')
    // Held or passed: the Add is the secondary button, not the primary.
    expect(SLOT).toMatch(/d \? "ag-btn-secondary" : "ag-btn-primary"/)
    // It never writes; every click goes back through onDecide.
    expect(SLOT).not.toMatch(/fetch\(/)
  })

  it("frame 45: one card is name, Fit ⓘ, Must-haves, Call done, Gap and the decision row", () => {
    const step = compareStep()
    const card = step.slice(step.indexOf('{view === "cards" ? ('), step.indexOf('className="ag-mx-head"'))
    expect(card).toMatch(/<FitHint score=\{s\} \/>/)
    expect(card).toMatch(/<MustHaves hit=\{s\.must_have_hit\} total=\{s\.must_have_total\} \/>/)
    expect(card).toContain(">Call done<")
    expect(card).toContain("`Gap: ${gap.text}`")
    expect(card).toMatch(/<DecisionSlot\s+layout="row"/)
    // What moved behind the ⓘ or went: no breakdown, no rank, no eyebrows.
    for (const gone of ["<ScoreBreakdown", "<ConfidenceBars", "Top risk", "unevidenced:", "#{rank + 1}", "ag-field-label", "initials("]) {
      expect(card, gone).not.toContain(gone)
    }
    // One view at a time: the matrix renders only in the other branch.
    expect(step).toContain('const view = boardView ?? (candidates.length >= 6 ? "matrix" : "cards")')
  })

  it("the row slot: the shortlisted pill is its own toggle, Hold · Pass stay quiet", () => {
    const row = SLOT.slice(SLOT.indexOf('if (layout === "row")'), SLOT.indexOf("return (", SLOT.indexOf('if (layout === "row")') + 40))
    expect(row).toMatch(/onClick=\{\(\) => onDecide\(IN\)\}[\s\S]{0,200}aria-pressed=\{inShortlist\}/)
    expect(row).toContain('{inShortlist ? "✓ Shortlisted" : "Add"}')
    expect(row).toContain('"On hold ✓" : "Hold"')
    expect(row).toContain('"Passed ✓" : "Pass"')
  })

  it("the primary Add is at least 44px tall on a phone", () => {
    expect(CSS).toMatch(/@media \(max-width: 900px\) \{[\s\S]*\.ag-decision-add \{ min-height: 44px; \}/)
  })
})

describe("the word on screen is pass, never reject", () => {
  const visible = [
    ["compare step", compareStep()],
    ["panel", PANEL],
    ["slot", SLOT],
    ["rail", RAIL],
  ] as const

  for (const [name, src] of visible) {
    it(`${name}: no JSX text or capitalised label says reject`, () => {
      const offenders = jsxText(src).filter((t) => /\breject/i.test(t))
      expect(offenders, offenders.join(" | ")).toEqual([])
      expect(src).not.toMatch(/>Reject</)
      expect(src).not.toMatch(/["'`]Reject/)
      expect(src.toLowerCase()).not.toMatch(/\brejected\b/)
    })
  }

  it("the stored value and the key map are unchanged", () => {
    expect(PAGE).toContain('{ s: "shortlist", h: "hold", r: "reject" }')
    expect(SLOT).toContain('const PASS = "reject"')
  })
})

describe("add in one go", () => {
  const step = compareStep()

  it("the must-have item counts people with every must-have who are not in yet, and hides at zero", () => {
    expect(step).toMatch(/s\.must_have_total > 0 && s\.must_have_hit === s\.must_have_total && decisions\[c\.id\] !== "shortlist"/)
    expect(step).toMatch(/\{mustHaveReady\.length > 0 && \(/)
    expect(step).toContain("Everyone with all must-haves ({mustHaveReady.length})")
  })

  it("is one \"Add in bulk ▾\" menu (frame 45), shown only when it has something to add", () => {
    expect(step).toMatch(/<summary className="ag-btn ag-btn-secondary">Add in bulk ▾<\/summary>/)
    expect(step).toContain("(mustHaveReady.length > 0 || !reco.result || recommendedNotIn.length > 0) && (")
    // Each item closes the menu, then adds through the same one-click paths.
    expect(step).toMatch(/closeBulkMenu\(\)\s*addMany\(mustHaveReady\.map\(\(c\) => c\.id\)\)/)
    expect(step).toMatch(/closeBulkMenu\(\)\s*void addRecommended\(\)/)
  })

  it("the recommendation item runs it first when nothing has been generated, and says so", () => {
    expect(step).toContain("`The recommended ones (${recommendedNotIn.length})`")
    expect(step).toContain(': "The recommended ones"}')
    expect(step).toMatch(/"No recommendation has been generated yet\. This runs it first/)
    expect(step).toMatch(/const r = await reco\.generate\(\)/)
  })

  /** applyDecisions' body only. */
  const applyFn = () => {
    const start = PAGE.indexOf("async function applyDecisions(")
    const end = PAGE.indexOf("function addMany(", start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return PAGE.slice(start, end)
  }

  it("bulk adds are one decision per person on the recruiter's click, with an exact undo", () => {
    const fn = applyFn()
    expect(fn).toMatch(/fetch\(`\/api\/agency\/roles\/\$\{roleId\}\/decisions`, \{\s*method: "PATCH"/)
    expect(fn).toMatch(/body: JSON\.stringify\(\{ changes \}\)/)
    expect(PAGE).toMatch(/void applyDecisions\(undo\.previous, \{ undoable: false \}\)/)
    expect(PAGE).toMatch(/setTimeout\(\(\) => setUndo\(null\), 8000\)/)
    expect(step).toContain("Added {undo.n} to the shortlist")
  })

  it("undo is built from the server's previous value per person, not the click-time map", () => {
    const fn = applyFn()
    // The route returns updated[].previous for exactly this; the client uses it.
    expect(fn).toMatch(/const updated: Array<\{ candidateId: string; previous: string \| null \}> = Array\.isArray\(body\?\.updated\)/)
    expect(fn).toMatch(/const serverPrevious = new Map\(updated\.map\(\(u\) => \[u\.candidateId, u\.previous \?\? null\]\)\)/)
    expect(fn).toMatch(/serverPrevious\.has\(p\.candidateId\) \? serverPrevious\.get\(p\.candidateId\) \?\? null : p\.decision/)
  })

  it("reads decisions through a ref, so an add after an await does not see a stale map", () => {
    expect(PAGE).toMatch(/const decisionsRef = useRef<Record<string, string \| null>>\(\{\}\)\s*decisionsRef\.current = decisions/)
    expect(applyFn()).toMatch(/const current = decisionsRef\.current\s*const previous = changes\.map\(\(ch\) => \(\{ candidateId: ch\.candidateId, decision: current\[ch\.candidateId\] \?\? null \}\)\)/)
    const addMany = PAGE.slice(PAGE.indexOf("function addMany("), PAGE.indexOf("function undoLast("))
    expect(addMany).toMatch(/const current = decisionsRef\.current/)
    expect(addMany).toMatch(/\.filter\(\(id\) => current\[id\] !== "shortlist"\)/)
    expect(addMany).not.toMatch(/decisions\[id\]/)
  })

  it("a single decision inside the undo window drops that person from the pending undo", () => {
    const decide = PAGE.slice(PAGE.indexOf("async function decide("), PAGE.indexOf("async function applyDecisions("))
    expect(decide).toMatch(/setUndo\(\(u\) => \{/)
    expect(decide).toMatch(/u\.previous\.filter\(\(p\) => p\.candidateId !== candidateId\)/)
    expect(decide).toMatch(/previous\.length === 0 \? null : \{ n: previous\.length, previous \}/)
  })

  it("falls back to the single writer only when the bulk route is absent, and reloads on anything else", () => {
    const fn = applyFn()
    // The per-person path exists, gated on 404/405 alone.
    expect(fn).toMatch(/if \(res\.status === 404 \|\| res\.status === 405\) \{[\s\S]*?changes\.map\(\(ch\) =>\s*fetch\(`\/api\/agency\/candidates\/\$\{ch\.candidateId\}\/decision`/)
    // A 500 means part of the batch may be saved: put back, then reload from the server.
    const tail = fn.slice(fn.lastIndexOf("rollback(everyone)"))
    expect(tail).toMatch(/await loadCandidates\(\)/)
    expect(tail).toContain("Some of those may have saved; the board has been reloaded.")
    expect(tail).not.toMatch(/fetch\(/)
    // A thrown fetch reloads too.
    expect(fn).toMatch(/\} catch \{[\s\S]{0,200}rollback\(everyone\)\s*await loadCandidates\(\)/)
    // 403 is view-only, never a retry.
    expect(fn).toMatch(/if \(res\.status === 403\) \{\s*rollback\(everyone\)\s*setError\("You have view-only access to this agency\."\)/)
  })

  it("the undo notice rides in the decisions bar, where the eye is", () => {
    const bar = step.slice(step.indexOf('className="ag-decisions-bar"'), step.indexOf("<ShortlistBar"))
    // The live region is mounted before it has anything to say (screen
    // readers announce a change, not an arrival); the notice renders inside it.
    expect(bar).toMatch(/<div className="ag-undo" role="status" data-empty=\{!undo\}>\s*\{undo && \(/)
    expect(CSS).toMatch(/\.ag-undo\[data-empty="true"\] \{ position: absolute;/)
    // And nowhere above the cards.
    const aboveCards = step.slice(0, step.indexOf('className="ag-decisions-bar"'))
    expect(aboveCards).not.toContain('className="ag-undo"')
    // On a phone the bar is static; the notice is fixed above the shortlist bar.
    expect(CSS).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\.ag-decisions-bar \.ag-undo \{\s*position: fixed;/)
  })

  it("decide() stays the single-person writer", () => {
    expect(PAGE).toMatch(/async function decide\(candidateId: string, decision: string \| null\)/)
  })
})

describe("the recommendation tab carries decisions", () => {
  it("state is lifted to the page and shared with the matrix chip", () => {
    expect(PAGE).toMatch(/const reco = useRecommendation\(roleId\)/)
    expect(PANEL).not.toMatch(/fetch\(/)
    expect(PANEL).toMatch(/result: RecommendationResult \| null/)
  })

  it("renders an Add button per item and a group-level add", () => {
    const rows = PANEL.slice(PANEL.indexOf("items.map((item) =>"), PANEL.indexOf("result.unasked.length"))
    expect(rows).toMatch(/<DecisionSlot[\s\S]{0,260}onDecide=\{\(d\) => onDecide\(item\.candidate_id, d\)\}/)
    expect(PANEL).toMatch(/n === total \? `Add all \$\{n\}` : `Add the other \$\{n\}`/)
    expect(PANEL).toMatch(/\{verb\} to the shortlist/)
    // Nothing when everyone in the group is already in.
    expect(PANEL).toMatch(/const verb = n === 0 \? null/)
  })

  it("the third group is collapsed by default behind Show the N", () => {
    expect(PANEL).toMatch(/const \[showNotYet, setShowNotYet\] = useState\(false\)/)
    expect(PANEL).toMatch(/group === "not_yet" && !showNotYet/)
    expect(PANEL).toMatch(/`Show the \$\{countWord\(total\)\} ↓`/)
  })

  it("keeps the groups in fixed order with reasons and traces, and hides nobody", () => {
    expect(PANEL).toMatch(/GROUP_ORDER\.map/)
    expect(PANEL).toMatch(/item\.reason/)
    expect(PANEL).toMatch(/item\.traces\.map/)
    expect(PANEL).not.toMatch(/\.filter\(\(i\) => i\.group === group\)\.filter/)
  })

  it("says once, in How it works, that a re-run never changes a decision", () => {
    // Frame 43 (13 Oct 2026): the reading sub and the foot narrated what the
    // one verb already shows; the re-run promise moved into the hint.
    expect(PANEL).toContain("Running it again re-reads everything and never changes a decision you have made.")
    expect(PANEL).not.toMatch(/A reading of your own notes, not a filter/)
    expect(PANEL).not.toMatch(/ag-reco-foot/)
  })
})

describe("nothing new pins a monospace face", () => {
  it("the new components reuse the label classes", () => {
    for (const src of [PANEL, SLOT, RAIL]) {
      expect(src).not.toMatch(/--ag-mono/)
      expect(src).not.toMatch(/fontFamily/)
    }
  })

  it("the board-26 stylesheet block names no font family but the display face", () => {
    const block = CSS.slice(CSS.indexOf("STEP 05 · THE SHORTLIST RAIL AND THE ONE VERB"))
    expect(block.length).toBeGreaterThan(1000)
    expect(block).not.toMatch(/--ag-mono/)
    expect(block).not.toMatch(/monospace/)
  })
})

describe("counts as words", () => {
  it("writes small counts out and falls back to digits", () => {
    expect(countWord(4)).toBe("four")
    expect(countWord(13)).toBe("thirteen")
    expect(countWord(21)).toBe("21")
    expect(countWordCap(4)).toBe("Four")
  })
})
