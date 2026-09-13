/**
 * Step 07 — the screen where the recruiter's work leaves the building.
 *
 * Three faults, found on 13 Sep 2026 by reading the screen and the route
 * rather than by guessing, and pinned here so none of them can come back:
 *
 *   1. A completed state that was still armed. The primary read
 *      "✓ Submission sent" and stayed enabled, so a second click minted a
 *      second snapshot, fresh portal links and another email to the client.
 *   2. Derived lists rebuilt on every render, inside the pane's IIFE, while
 *      `intro` was component state — so writing the client introduction
 *      rebuilt every row on every keystroke.
 *   3. A rescore loop that ran one candidate at a time against maxDuration 60.
 *
 * Every scan here strips comments first: the notes in those files name the
 * very strings being scanned for, and a guard that matches its own
 * documentation is one this project has already shipped once.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const PAGE = "app/agencies/roles/[roleId]/page.tsx"
const ROUTE = "app/api/agency/roles/[roleId]/submission/route.ts"

describe("a sent submission is a fact, not a button", () => {
  const page = read(PAGE)

  it("never renders a primary wired to the send once it has gone", () => {
    // The whole bug in one line: "✓ Submission sent" WAS the primary.
    expect(page).not.toContain("Submission sent")
    const bar = page.slice(page.indexOf("Back to compare"))
    // The sent BRANCH only — the else branch below it is the unsent state and
    // is allowed its primary, which is the whole distinction being pinned.
    const sentStart = bar.indexOf("alreadySent ?")
    const sent = bar.slice(sentStart, bar.indexOf(") : (", sentStart))
    expect(sent).toMatch(/ag-sent-chip/)
    expect(sent).toMatch(/Send\s+again…/)
    // The re-send route out is a SECONDARY, and it opens the ask rather than
    // sending. If this ever reads ag-btn-primary again, the fault is back.
    expect(sent).not.toMatch(/ag-btn-primary/)
    expect(sent).toMatch(/setResendAsk\(true\)/)
  })

  it("the sent state survives a reload, not just this session", () => {
    // `snap` is only set by a send in THIS session, so gating on it alone
    // showed a live "Send to client" on a role that had already gone out.
    expect(page).toMatch(/const alreadySent = Boolean\(snap\) \|\| \(phase !== null && phase !== "shortlist"\)/)
  })

  it("sending a second time has to be asked for, and says what it does", () => {
    const ask = page.slice(page.indexOf("resendAsk &&"), page.indexOf("representAsk &&"))
    expect(ask).toMatch(/role="alertdialog"/)
    expect(ask).toMatch(/second\s+snapshot/)
    expect(ask).toMatch(/fresh\s+portal\s+links/)
    expect(ask).toMatch(/Cancel/)
    // Nothing is pre-selected and the destructive option is not the default
    // shape used elsewhere for a safe action.
    expect(ask).toMatch(/Send\s+a\s+second\s+submission/)
  })
})

describe("step 07 does not rebuild itself on every keystroke", () => {
  const page = read(PAGE)

  it("the derived lists are memoised at component level", () => {
    for (const name of ["submissionRows", "submissionShortlisted", "submissionHeld", "submissionMusts"]) {
      expect(page, `${name} is not memoised`).toMatch(new RegExp(`const ${name} = useMemo`))
    }
  })

  it("the introduction is not an input to any of them", () => {
    // This is the whole point: `intro` changes on every keypress, so if it
    // ever becomes a dependency the rows rebuild letter by letter again.
    const rows = page.slice(page.indexOf("const submissionRows = useMemo"))
    const deps = rows.slice(rows.indexOf("[submissionSnap"), rows.indexOf("]", rows.indexOf("[submissionSnap")) + 1)
    expect(deps).not.toMatch(/\bintro\b/)
    expect(deps).toMatch(/submissionSnap/)
    expect(deps).toMatch(/effectiveStrength/)
  })

  it("the pane's IIFE derives nothing of its own any more", () => {
    const pane = page.slice(page.indexOf('step === "submission" && (() => {'))
    const prelude = pane.slice(0, pane.indexOf("const alreadySent"))
    // It may alias the memoised values; it may not recompute them.
    expect(prelude).not.toMatch(/rankedCandidates\.filter/)
    expect(prelude).not.toMatch(/requirements\.filter/)
    expect(prelude).toMatch(/const rows = submissionRows/)
  })
})

describe("the submission route does not rescore one at a time", () => {
  const route = read(ROUTE)

  it("runs the shortlist through a bounded pool", () => {
    expect(route).not.toMatch(/for \(const decision of shortlisted\)/)
    expect(route).toMatch(/const CONCURRENCY = \d+/)
    expect(route).toMatch(/Promise\.all\(/)
  })

  it("keeps the pre-sort ordering the sequential version had", () => {
    // Written back at their own index, never pushed as they resolve —
    // otherwise candidates on equal scores would reorder run to run.
    expect(route).toMatch(/built\[i\] = await buildEntry\(shortlisted\[i\]\)/)
    expect(route).not.toMatch(/entries\.push\(/)
    expect(route).toMatch(/entries\.sort\(/)
  })

  it("still skips a candidate erased mid-run rather than rendering stale", () => {
    // The purge race guard has to survive the rewrite; it returns null into
    // the slot now instead of `continue`.
    expect(route).toMatch(/if \(raceError instanceof AgencyAccessError\) return null/)
    expect(route).toMatch(/if \(!candidate\) return null/)
    expect(route).toMatch(/e is NonNullable/)
  })

  it("stops re-reading role-level requirements once per candidate", () => {
    expect(route).toMatch(/recomputeAndStore\(admin, auth\.ctx\.agencyId, decision\.candidate_id, requirements \?\? \[\]\)/)
    const rescore = read("lib/agency/rescore.ts")
    expect(rescore).toMatch(/presetRequirements\?: ScoringRequirements/)
    expect(rescore).toMatch(/presetRequirements\s*\n?\s*\? Promise\.resolve\(presetRequirements\)/)
  })
})
