/**
 * The cohort scheduling board (11 Sep 2026). Status is derived from the
 * round and never stored, so the derivation is the whole contract — and one
 * component renders it for both hats, so they cannot disagree about who is
 * booked.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import {
  CHASE_AFTER_HOURS,
  STATUS_LABEL,
  cohortStatus,
  cohortSummary,
  needsChasing,
  statusRank,
  type CohortRoundFacts,
} from "../agency/cohort-status"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))
const NOW = new Date("2030-03-10T12:00:00Z")
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * 3_600_000).toISOString()

const round = (over: Partial<CohortRoundFacts> = {}): CohortRoundFacts => ({
  status: "scheduled",
  candidateResponse: "pending",
  scheduledAt: null,
  hasDebrief: false,
  createdAt: at(-1),
  ...over,
})

describe("cohortStatus", () => {
  it("an invitation with no time is awaiting a choice", () => {
    expect(cohortStatus(round(), NOW)).toBe("awaiting")
  })

  it("a chosen time in the future is booked", () => {
    expect(cohortStatus(round({ scheduledAt: at(48), candidateResponse: "confirmed" }), NOW)).toBe("booked")
  })

  it("a booked time that has passed reads as a write-up due, not as upcoming", () => {
    expect(cohortStatus(round({ scheduledAt: at(-2), candidateResponse: "confirmed" }), NOW)).toBe("feedback_due")
  })

  it("a completed round is complete only once its write-up exists", () => {
    expect(cohortStatus(round({ status: "completed" }), NOW)).toBe("feedback_due")
    expect(cohortStatus(round({ status: "completed", hasDebrief: true }), NOW)).toBe("complete")
  })

  it("a decline is 'no suitable time' and outranks the round being cancelled", () => {
    // Declining cancels the round, so both facts are true at once; the one
    // that explains WHY is the one a person needs.
    expect(cohortStatus(round({ candidateResponse: "declined", status: "cancelled" }), NOW)).toBe("no_suitable_time")
  })

  it("names no status after a judgement of a person", () => {
    for (const label of Object.values(STATUS_LABEL)) {
      expect(label.toLowerCase()).not.toMatch(/reject|unsuitable|fail|poor/)
    }
  })
})

describe("chasing", () => {
  it("only an unanswered invitation, and only after it has waited", () => {
    expect(needsChasing(round({ createdAt: at(-1) }), NOW)).toBe(false)
    expect(needsChasing(round({ createdAt: at(-CHASE_AFTER_HOURS - 1) }), NOW)).toBe(true)
    // Somebody who booked is never chased.
    expect(needsChasing(round({ scheduledAt: at(48), createdAt: at(-200) }), NOW)).toBe(false)
  })
})

describe("the board's order", () => {
  it("puts what needs somebody above what is settled", () => {
    expect(statusRank("feedback_due")).toBeLessThan(statusRank("booked"))
    expect(statusRank("no_suitable_time")).toBeLessThan(statusRank("booked"))
    expect(statusRank("awaiting")).toBeLessThan(statusRank("complete"))
  })
  it("summarises without inventing a number", () => {
    expect(cohortSummary([])).toMatch(/Nobody has been invited/)
    expect(cohortSummary(["booked", "awaiting", "no_suitable_time"])).toBe(
      "1 booked · 1 still to book · 1 found no suitable time."
    )
  })
})

describe("one board, two hats", () => {
  it("both screens render the same component from the same derivation", () => {
    for (const p of [
      "app/hiring/roles/[roleId]/interviews/page.tsx",
      "app/agencies/roles/[roleId]/interviews/page.tsx",
    ]) {
      expect(read(p), p).toMatch(/<CohortBoard/)
    }
    expect(read("lib/agency/cohort.ts")).toMatch(/export async function getCohortBoard/)
  })

  it("the recruiter's route cannot seat anyone", () => {
    // Visibility, not control: candidates book themselves, so there is no
    // POST here and nothing that writes a slot.
    const src = read("app/api/agency/roles/[roleId]/cohort/route.ts")
    expect(src).not.toMatch(/export async function POST/)
    expect(src).not.toMatch(/slot_id/)
  })

  it("the status module stays browser-safe", () => {
    const src = readFileSync(join(process.cwd(), "lib/agency/cohort-status.ts"), "utf8")
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/^\s*import\s/m)
    expect(code).not.toMatch(/agencyAdmin/)
  })
})

describe("sending a link again", () => {
  it("mints a fresh one and says the old stops working", () => {
    const src = read("lib/agency/cohort.ts")
    const fn = src.slice(src.indexOf("export async function remindCohortMember"))
    expect(fn).toMatch(/mintBookingToken/)
    expect(fn).toMatch(/action: "booking_reminded"/)
    // Nothing to remind somebody of once they hold a time.
    expect(fn).toMatch(/if \(round\.slot_id\) return \{ sent: false, reason: "already_booked" \}/)
    expect(read("components/agency/cohort-board.tsx")).toMatch(/The earlier one no longer works/)
  })
})
