/**
 * An absence must not be explained by guessing at its cause.
 *
 * The candidate's booking doorway had exactly one empty-state sentence —
 * "Every time has been taken" — but `listOpenWindows` drops a window for
 * three different reasons and only one of them is "taken". The other two are
 * the desk's own settings: inside the minimum notice, or shorter than the
 * interview.
 *
 * On 15 September 2026 every remaining window on staging was merely too
 * soon, and three candidates holding a live invitation were told that other
 * people had taken all the times. That is worse than saying nothing: it
 * invents a race they lost. Verified at the time against the deployed data —
 * nine slots, six past, three future and all three inside the 24h notice, so
 * the doorway offered nothing and explained it wrongly.
 *
 * The second half is the divergence that let it happen. `listOpenSlots` (the
 * recruiter's list) and `listOpenWindows` (the candidate's) read the same
 * table through different filters, so a recruiter could offer a window no
 * candidate could ever pick. The recruiter keeps seeing it — booking
 * somebody in by hand is the documented exception for the candidate who
 * cannot self-book — but it is now labelled rather than silent.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

const BOOKING = "lib/agency/booking.ts"
const ROUNDS = "lib/agency/rounds.ts"
const DOORWAY = "app/booking/[token]/page.tsx"

describe("the doorway says why there are no times", () => {
  const door = read(DOORWAY)

  it("never asserts 'taken' unconditionally", () => {
    // The whole bug in one line: the sentence existed with nothing deciding
    // whether it was true.
    const taken = door.indexOf("Every time has been taken")
    expect(taken).toBeGreaterThan(-1)
    const before = door.slice(Math.max(0, taken - 400), taken)
    expect(before).toMatch(/noWindowsBecause\s*===\s*"all_taken"/)
  })

  it("has a distinct sentence for 'too soon to book here'", () => {
    expect(door).toMatch(/noWindowsBecause\s*===\s*"unbookable"/)
    expect(door).toMatch(/too soon to book here/)
  })

  it("and for nothing offered yet", () => {
    expect(door).toMatch(/No times have been offered yet/)
  })

  it("reassures in every branch, because none of them is the candidate's fault", () => {
    // "nothing about your application has changed" was the one good thing
    // about the original sentence and must survive into all three.
    const matches = door.match(/nothing about\s+your application has changed|nothing\s+about your application has changed/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })

  it("does not restate the server's shape by hand", () => {
    // The copy of BookingView in this file is how it stayed ignorant of the
    // reason the server had learned. Types are erased, so importing it drags
    // no server code into the browser bundle.
    expect(read(DOORWAY)).toMatch(/import type \{ BookingView \}/)
    expect(read(DOORWAY)).not.toMatch(/type Booking = \{/)
  })
})

describe("the server supplies the reason", () => {
  const booking = read(BOOKING)

  it("listOpenWindows returns windows AND why there are none", () => {
    expect(booking).toMatch(/return \{ windows, reason \}/)
    expect(booking).toMatch(/export type NoWindowsReason/)
  })

  it("tells 'none offered' apart from 'all taken' apart from 'unbookable'", () => {
    for (const reason of ["none_offered", "all_taken", "unbookable"]) {
      expect(booking).toMatch(new RegExp(`"${reason}"`))
    }
  })

  it("only reports a reason when it actually showed no windows", () => {
    // A reason attached to a full list would be read as an error state.
    expect(booking).toMatch(/showWindows && openWindows\.length === 0 \? open\.reason : null/)
  })
})

describe("the two lists no longer disagree in silence", () => {
  const rounds = read(ROUNDS)

  it("the recruiter's list marks what a candidate cannot take", () => {
    expect(rounds).toMatch(/selfBookable/)
    expect(rounds).toMatch(/notSelfBookableBecause/)
  })

  it("using the candidate's own two rules, from the same settings", () => {
    expect(rounds).toMatch(/minNoticeHours/)
    expect(rounds).toMatch(/durationMinutes/)
    expect(rounds).toMatch(/getInterviewSettings/)
  })

  it("but does not hide the window from the recruiter", () => {
    // Booking by hand is the exception for the candidate who cannot
    // self-book. Filtering these out would delete that capability.
    //
    // NOT `/filter\([^)]*selfBookable/` — the arrow parameter's own closing
    // paren in `filter((s) => s.selfBookable)` ends the `[^)]*` run, so that
    // pattern matches nothing and the guard passes while the capability is
    // gone. This repo has now been bitten by that exact regex twice; the
    // probe is what caught it both times.
    expect(rounds).not.toMatch(/\.filter\([\s\S]{0,60}?selfBookable/)
    // And the list must still be built from every free slot.
    expect(rounds).toMatch(/return free\.map\(/)
  })
})
