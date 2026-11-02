/**
 * Proposing interview windows (lib/calendar/windows.ts). Pure, so the sizing
 * rule and the "never through a busy span" rule are the whole contract.
 */
import { describe, it, expect } from "vitest"
import { proposeWindows, windowsWanted, type Interval } from "../calendar/windows"

// A Monday, local time, well in the future so "already passed" never trips.
const MONDAY = new Date(2030, 0, 7)
const at = (dayOffset: number, h: number, m = 0) => {
  const d = new Date(MONDAY)
  d.setDate(MONDAY.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}
const iso = (d: Date) => d.toISOString()
const overlaps = (a: Interval, b: Interval) => Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end)

describe("windowsWanted", () => {
  it("is one per candidate plus half again, never fewer than two", () => {
    expect(windowsWanted(0)).toBe(2)
    expect(windowsWanted(1)).toBe(2)
    expect(windowsWanted(2)).toBe(3)
    expect(windowsWanted(3)).toBe(5)
    expect(windowsWanted(4)).toBe(6)
  })
})

describe("proposeWindows", () => {
  it("proposes the wanted number, each one interview long, spread over at least two days", () => {
    const p = proposeWindows({ candidates: 3, durationMinutes: 45, busy: [], from: MONDAY })
    expect(p.wanted).toBe(5)
    expect(p.windows).toHaveLength(5)
    expect(p.short).toBe(false)
    for (const w of p.windows) expect(Date.parse(w.end) - Date.parse(w.start)).toBe(45 * 60_000)
    const days = new Set(p.windows.map((w) => new Date(w.start).toDateString()))
    expect(days.size).toBeGreaterThanOrEqual(2)
  })

  it("keeps inside working hours and off the weekend", () => {
    const p = proposeWindows({ candidates: 6, durationMinutes: 60, busy: [], from: at(4, 0), days: 10, workingHours: { start: 9, end: 12 } })
    for (const w of p.windows) {
      const s = new Date(w.start)
      const e = new Date(w.end)
      expect(s.getDay()).not.toBe(0)
      expect(s.getDay()).not.toBe(6)
      expect(s.getHours()).toBeGreaterThanOrEqual(9)
      expect(e.getHours() * 60 + e.getMinutes()).toBeLessThanOrEqual(12 * 60)
    }
  })

  it("never lands on a busy span, even an overlapping messy one", () => {
    const busy: Interval[] = [
      { start: iso(at(0, 9)), end: iso(at(0, 11)) },
      { start: iso(at(0, 10, 30)), end: iso(at(0, 12)) },
      { start: iso(at(1, 9)), end: iso(at(1, 17)) },
    ]
    const p = proposeWindows({ candidates: 2, durationMinutes: 45, busy, from: MONDAY })
    for (const w of p.windows) for (const b of busy) expect(overlaps(w, b), `${w.start} overlaps ${b.start}`).toBe(false)
    // Tuesday is fully busy, so nothing proposed there.
    expect(p.windows.some((w) => new Date(w.start).getDate() === at(1, 9).getDate())).toBe(false)
  })

  it("leaves the buffer between consecutive windows on the same day", () => {
    const p = proposeWindows({ candidates: 4, durationMinutes: 30, bufferMinutes: 15, busy: [], from: MONDAY, perDayMax: 3 })
    const byDay = new Map<string, Interval[]>()
    for (const w of p.windows) {
      const k = new Date(w.start).toDateString()
      byDay.set(k, [...(byDay.get(k) ?? []), w])
    }
    for (const ws of byDay.values()) {
      for (let i = 1; i < ws.length; i++) {
        expect(Date.parse(ws[i].start) - Date.parse(ws[i - 1].end)).toBeGreaterThanOrEqual(15 * 60_000)
      }
    }
  })

  it("says so when the horizon cannot fit the wanted number, rather than inventing times", () => {
    const busy: Interval[] = []
    for (let d = 0; d < 14; d++) busy.push({ start: iso(at(d, 0)), end: iso(at(d, 23, 59)) })
    const p = proposeWindows({ candidates: 3, durationMinutes: 45, busy, from: MONDAY, days: 10 })
    expect(p.windows).toHaveLength(0)
    expect(p.short).toBe(true)
  })

  it("caps a single day so the candidate is not offered one wall of slots", () => {
    const p = proposeWindows({ candidates: 8, durationMinutes: 30, bufferMinutes: 0, busy: [], from: MONDAY, perDayMax: 3 })
    const counts = new Map<string, number>()
    for (const w of p.windows) {
      const k = new Date(w.start).toDateString()
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(3)
  })
})
