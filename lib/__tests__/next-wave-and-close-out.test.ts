/**
 * Two things a round decision has to change, found on a walk-through
 * 20 September 2026 after writing up round 1 and declining one candidate.
 *
 * 1. THE NEXT WAVE. The hiring manager's interview setup offered the declined
 *    candidate again for round 2 — "3 shortlisted · 3 chosen", windows sized
 *    for 3 — while the header two inches above it correctly read "offer
 *    interview times for 2 candidates". The selection was seeded from the
 *    SHORTLIST action, chosen before round 1 existed, and never consulted
 *    what the rounds had since decided.
 *
 *    The fix unselects them and says why. It does NOT hide them: declining is
 *    a signal, never a removal, so they stay on the list with the reason
 *    written on the row.
 *
 * 2. THE CLOSE-OUT DOOR. "No round is in the diary" is not "the loop is
 *    finished". After round 1 of a two-round plan, everyone written up and
 *    decided, nothing is booked — so the card offered close-out while two
 *    advanced candidates were waiting on their round 2.
 *
 * Both are the same mistake in different clothes: a screen inferring where
 * the process stands from something adjacent, rather than from the ladder
 * that already knows.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { loopState, type RoundFacts } from "@/lib/agency/next-action"

const ROOT = process.cwd()
const HM_SETUP = "app/hiring/roles/[roleId]/interviews/page.tsx"
const RECRUITER = "app/agencies/roles/[roleId]/interviews/page.tsx"

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

describe("the ladder already knows who is still owed a round", () => {
  const planned = 2

  it("an advanced candidate after round 1 of 2 is still to book", () => {
    const s = loopState([round({ roundNumber: 1, decision: "advance", decidedAt: "2026-09-02T11:00:00Z" })], planned)
    expect(s?.kind).toBe("to-book")
    expect(s?.kind === "to-book" && s.nextRound).toBe(2)
  })

  it("a declined candidate is finished, whatever the plan says", () => {
    const s = loopState([round({ roundNumber: 1, decision: "decline", decidedAt: "2026-09-02T11:00:00Z" })], planned)
    expect(s?.kind).toBe("declined")
  })

  it("only reaches close-out once the planned rounds are done", () => {
    const two = [
      round({ roundNumber: 1, decision: "advance", decidedAt: "2026-09-02T11:00:00Z" }),
      round({ roundNumber: 2, decision: "advance", decidedAt: "2026-09-09T11:00:00Z" }),
    ]
    expect(loopState(two, planned)?.kind).toBe("close-out")
  })

  it("a null or nonsense plan never reads as zero rounds", () => {
    // `1 >= null` is `1 >= 0` in JavaScript, so an unset plan would send every
    // advanced candidate straight to close-out the moment round 1 was
    // decided. job_roles.planned_rounds IS null on real roles. Both callers
    // default to 2; loopState defends itself as well, because the failure is
    // silent and lands on the most consequential rung in the ladder.
    const one = [round({ roundNumber: 1, decision: "advance", decidedAt: "2026-09-02T11:00:00Z" })]
    for (const bad of [null, undefined, 0, NaN]) {
      expect(loopState(one, bad as unknown as number)?.kind).toBe("to-book")
    }
    expect(loopState(one, 1)?.kind).toBe("close-out")
  })
})

describe("the close-out door waits for the loop, not the diary", () => {
  const src = tsCode(readFileSync(join(ROOT, RECRUITER), "utf8"))

  it("an empty diary alone no longer opens it", () => {
    // The whole original condition: some rounds exist, none is scheduled.
    expect(src).toContain("waiting.length > 0")
    // ...now joined by the real test.
    expect(src).toContain("midFlight.length > 0")
  })

  it("counts every state that means somebody is still in the loop", () => {
    for (const kind of ["to-book", "invited", "booked", "happening-now", "write-up-due", "decision-due"]) {
      expect(src).toContain(`"${kind}"`)
    }
  })

  it("reads the ladder rather than a fifth derivation of it", () => {
    expect(src).toContain("loopRows.filter")
  })
})

describe("a declined candidate is not offered the next wave", () => {
  const raw = readFileSync(join(ROOT, HM_SETUP), "utf8")
  const src = tsCode(raw)

  it("reads the round decision, not just the shortlist action", () => {
    expect(src).toContain("roundDecision")
    expect(src).toContain('decision === "decline"')
  })

  it("takes the dashboard rounds from inside `dashboard`", () => {
    // The same wrapped-payload trap that silently emptied the shortlist's
    // round chips earlier today.
    expect(src).toContain("payload?.dashboard?.rounds")
    expect(src).not.toMatch(/payload\??\.rounds\b/)
  })

  it("unselects rather than hides — declining is a signal, never a removal", () => {
    // They stay in the rendered list with the reason on the row.
    expect(raw).toContain("not in the next wave")
    expect(src).not.toMatch(/entries\.filter\([^)]*decline/)
  })

  it("only unselects somebody who was going to be interviewed", () => {
    // Guards against clobbering a hold or an explicit choice the hiring
    // manager has just made on this screen.
    expect(src).toContain('next[ref] === "interview"')
  })
})
