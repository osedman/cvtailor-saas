/**
 * Interview capacity (lib/calendar/capacity.ts) and the rules behind it.
 *
 * Ose's line, 10 Sep 2026: "do not allow Tailr to invite 12 candidates when
 * only seven slots exist without a clear warning." Pure, so the arithmetic
 * is the whole contract — and the verdict must never be a block.
 */
import { describe, it, expect } from "vitest"
import { assessCapacity, recommendedSlots } from "../calendar/capacity"
import { normalise, DEFAULT_SETTINGS } from "../agency/interview-rules"

const NOW = new Date("2030-01-07T09:00:00Z")
const slot = (dayOffset: number, hour: number, minutes = 45) => {
  const start = new Date(NOW)
  start.setUTCDate(NOW.getUTCDate() + dayOffset)
  start.setUTCHours(hour, 0, 0, 0)
  return { start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString() }
}
const RULES = { durationMinutes: 45, minNoticeHours: 24, maxPerDay: 4 }

describe("recommendedSlots", () => {
  it("is one each plus a little room to choose", () => {
    expect(recommendedSlots(8)).toBe(10)
    expect(recommendedSlots(4)).toBe(5)
  })
})

describe("assessCapacity", () => {
  it("says short, and by how many, when the cohort cannot be seated", () => {
    const windows = [slot(2, 9), slot(2, 11), slot(3, 9)]
    const c = assessCapacity(windows, 8, RULES, NOW)
    expect(c.level).toBe("short")
    expect(c.usable).toBe(3)
    expect(c.spare).toBe(-5)
    expect(c.headline).toContain("8 candidates")
    expect(c.headline).toContain("3 usable slots")
  })

  it("refuses slots inside the notice period, and counts them", () => {
    // Same day: inside 24 hours' notice.
    const c = assessCapacity([slot(0, 14), slot(3, 9), slot(4, 9)], 2, RULES, NOW)
    expect(c.rejected.tooSoon).toBe(1)
    expect(c.usable).toBe(2)
  })

  it("refuses windows shorter than the interview", () => {
    const c = assessCapacity([slot(2, 9, 20), slot(3, 9)], 1, RULES, NOW)
    expect(c.rejected.tooShort).toBe(1)
    expect(c.usable).toBe(1)
  })

  it("counts slots beyond the daily cap as unusable, not as capacity", () => {
    const sameDay = [slot(2, 9), slot(2, 10), slot(2, 11), slot(2, 12), slot(2, 13), slot(2, 14)]
    const c = assessCapacity(sameDay, 6, { ...RULES, maxPerDay: 4 }, NOW)
    expect(c.rejected.overDailyCap).toBe(2)
    expect(c.usable).toBe(4)
    expect(c.level).toBe("short")
    expect(c.perDay[0].overCap).toBe(2)
  })

  it("is tight when it fits with no room to choose, and ok with room", () => {
    const many = [2, 3, 4, 5].flatMap((d) => [slot(d, 9), slot(d, 11)])
    expect(assessCapacity(many.slice(0, 4), 4, RULES, NOW).level).toBe("tight")
    expect(assessCapacity(many, 4, RULES, NOW).level).toBe("ok")
  })

  it("says something useful before anyone is chosen", () => {
    expect(assessCapacity([], 0, RULES, NOW).headline).toMatch(/Choose who/)
  })
})

describe("the rules validator", () => {
  it("is the one validator, and every bound matches the migration", () => {
    const wild = normalise({ durationMinutes: 9999, minNoticeHours: -5, maxPerDay: 0, bufferMinutes: 10_000 })
    expect(wild.durationMinutes).toBe(480)
    expect(wild.minNoticeHours).toBe(0)
    expect(wild.maxPerDay).toBe(1)
    expect(wild.bufferMinutes).toBe(240)
  })

  it("falls back rather than throwing on nonsense", () => {
    expect(normalise(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalise({ locationKind: "telepathy" }).locationKind).toBe("video")
    expect(normalise({ reschedulePolicy: "whenever" }).reschedulePolicy).toBe("until_notice")
  })

  it("puts a reversed date range back in order rather than failing the check", () => {
    const r = normalise({ windowFrom: "2030-02-10", windowTo: "2030-02-01" })
    expect(r.windowFrom).toBe("2030-02-01")
    expect(r.windowTo).toBe("2030-02-10")
  })

  it("rejects a malformed date instead of passing it to Postgres", () => {
    expect(normalise({ windowFrom: "next tuesday" }).windowFrom).toBeNull()
  })
})

describe("the rules module stays browser-safe", () => {
  it("imports nothing that would drag the service-role key into the bundle", async () => {
    // The client screen renders DEFAULT_SETTINGS, and a runtime constant
    // imported from a module reaching agencyAdmin pulls next/headers into
    // the browser bundle and fails the build. It did, on 10 Sep 2026.
    const { readFileSync } = await import("node:fs")
    const src = readFileSync(new URL("../agency/interview-rules.ts", import.meta.url), "utf8")
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/agencyAdmin/)
    expect(code).not.toMatch(/next\/headers/)
    expect(code).not.toMatch(/^\s*import\s/m)
  })

  it("the client screen imports the rules, never the persistence", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const page = readFileSync(join(process.cwd(), "app/hiring/roles/[roleId]/interviews/page.tsx"), "utf8")
    expect(page).toMatch(/from "@\/lib\/agency\/interview-rules"/)
    expect(page).not.toMatch(/from "@\/lib\/agency\/interview-settings"/)
  })
})
