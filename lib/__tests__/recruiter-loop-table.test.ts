/**
 * The recruiter's loop table runs the SAME ladder as everything else.
 *
 * Frame 13 band C asked for the recruiter's side of the interview loop: who is
 * stuck, and on whom. Most of it already existed on the role's Interviews
 * screen — per-candidate rows, the round lanes, "Book round N+1" and "Take to
 * close-out". What it also had was an if/else chain deriving "what happens
 * next" INLINE: a second implementation of loopState, rendered on the same
 * screen as the role header that runs the first.
 *
 * Two derivations of "where is this person" do not stay equal. They disagree
 * the first time either is changed, and here they would have disagreed in
 * front of the recruiter, on one screen, about one candidate. So loopState is
 * exported and both read it.
 *
 * THE WORDS stay local on purpose: a recruiter and a hiring manager need
 * different sentences about the same fact. It is the FACT that is computed
 * once, not the phrasing.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { loopState, type RoundFacts } from "../agency/next-action"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const SCREEN = "app/agencies/roles/[roleId]/interviews/page.tsx"

const round = (o: Partial<RoundFacts> & { roundNumber: number }): RoundFacts => ({
  candidateRef: "CAN-01",
  status: "completed",
  createdAt: "2026-09-01T09:00:00Z",
  scheduledAt: "2026-09-02T09:00:00Z",
  endsAt: "2026-09-02T09:45:00Z",
  candidateResponse: "confirmed",
  hasDebrief: true,
  decision: null,
  decidedAt: null,
  ...o,
})

describe("one ladder, not two", () => {
  const screen = read(SCREEN)

  it("the screen imports the shared ladder", () => {
    expect(screen).toMatch(/import \{ loopState, type LoopState, type RoundFacts \}/)
  })

  it("and no longer reimplements it inline", () => {
    // The chain that was here derived the same six states by hand. These are
    // the two tells it is back: a local `let nextLine` built from round
    // fields, and a hand-rolled "did they clear the planned rounds" test.
    expect(screen).not.toMatch(/let nextLine: string/)
    expect(screen).not.toMatch(/last\.roundNumber >= planned/)
  })

  it("the row's state comes from loopState", () => {
    expect(screen).toMatch(/loopRows\.find\(\(x\) => x\.ref === c\.ref\)\?\.state/)
  })

  it("orders by what is yours, not by candidate", () => {
    // A list in candidate order buries the one row that needs the recruiter.
    expect(screen).toMatch(/\.sort\(\(a, b\) => \{[\s\S]{0,200}rank\(sa\)/)
  })
})

describe("the ladder says the right thing at each rung", () => {
  it("names the round still to book after an advance", () => {
    const s = loopState([round({ roundNumber: 1, decision: "advance", decidedAt: "2026-09-03T09:00:00Z" })], 3)
    expect(s?.kind).toBe("to-book")
    expect(s?.kind === "to-book" && s.nextRound).toBe(2)
  })

  it("ends the loop when the advance is at the planned count", () => {
    const s = loopState([round({ roundNumber: 3, decision: "advance", decidedAt: "2026-09-03T09:00:00Z" })], 3)
    expect(s?.kind).toBe("close-out")
  })

  it("and does NOT end it a round early — the bug 'of 2' would have caused", () => {
    // With planned hardcoded to 2, a three-round process hit close-out after
    // round 2. This is that failure as a test.
    const s = loopState([round({ roundNumber: 2, decision: "advance", decidedAt: "2026-09-03T09:00:00Z" })], 3)
    expect(s?.kind).toBe("to-book")
  })

  it("waits on the client's write-up before their decision", () => {
    expect(loopState([round({ roundNumber: 1, hasDebrief: false })], 2)?.kind).toBe("write-up-due")
    expect(loopState([round({ roundNumber: 1, hasDebrief: true })], 2)?.kind).toBe("decision-due")
  })

  it("a decline anywhere in the loop settles it", () => {
    const s = loopState(
      [round({ roundNumber: 1, decision: "decline", decidedAt: "x" }), round({ roundNumber: 2 })],
      3
    )
    expect(s?.kind).toBe("declined")
  })
})

describe("no button that cannot do anything", () => {
  const screen = read(SCREEN)

  it("offers no nudge for a write-up or a decision, because none exists", () => {
    // remindCohortMember re-sends a BOOKING link and refuses once a slot is
    // held — there is no endpoint that chases a client for a write-up. Frame
    // 13 drew "Nudge Owen"; it is not real, and a dead control is worse than
    // none. The row carries the wait instead.
    expect(read("lib/agency/cohort.ts")).toMatch(/already_booked/)
    const says = screen.slice(screen.indexOf("function says"), screen.indexOf("function fmtDay"))
    expect(says).toMatch(/waiting on the client's write-up/)
    expect(says).toMatch(/waiting on the client's decision/)
    expect(says).not.toMatch(/Nudge|Chase the client/i)
  })

  it("keeps close-out to the state that actually ended", () => {
    expect(screen).toMatch(/state\?\.kind === "close-out"/)
  })

  it("still says a decline is a signal, not a removal", () => {
    expect(screen).toMatch(/their signal, not a removal/)
    const says = screen.slice(screen.indexOf("function says"), screen.indexOf("function fmtDay"))
    expect(says).toMatch(/a signal, not a removal/)
  })
})
