/**
 * A cancelled round is never held, so its number is still owed — and the
 * unique key means that number is taken by reusing the cancelled row.
 * 21 Sep 2026: a declined round-1 booking made the re-invite "round 2", and
 * the loop reached close-out one real interview early.
 */
import { describe, it, expect } from "vitest"
import { nextRoundNumber } from "@/lib/agency/round-number"

describe("nextRoundNumber", () => {
  it("first round is 1", () => {
    expect(nextRoundNumber([])).toEqual({ roundNumber: 1, reuseId: null })
  })
  it("a declined round-1 booking is re-offered as round 1, reusing its row", () => {
    expect(nextRoundNumber([{ id: "r1", round_number: 1, status: "cancelled" }])).toEqual({ roundNumber: 1, reuseId: "r1" })
  })
  it("after a held round 1, the next is round 2 on a fresh row", () => {
    expect(nextRoundNumber([{ id: "r1", round_number: 1, status: "completed" }])).toEqual({ roundNumber: 2, reuseId: null })
  })
  it("a cancelled round 2 after a held round 1 is re-offered as round 2", () => {
    expect(
      nextRoundNumber([
        { id: "r1", round_number: 1, status: "completed" },
        { id: "r2", round_number: 2, status: "cancelled" },
      ])
    ).toEqual({ roundNumber: 2, reuseId: "r2" })
  })
})
