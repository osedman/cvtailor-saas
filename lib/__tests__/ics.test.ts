/**
 * iCalendar output, against the parts of RFC 5545 that actually break clients.
 *
 * Calendar apps are the least forgiving consumers in the product and the least
 * communicative: Outlook silently ignores a file with bare newlines rather
 * than saying anything, so a broken invite looks exactly like a candidate who
 * did not bother adding it. These are the four things worth asserting.
 */
import { describe, it, expect } from "vitest"
import { buildIcs, foldLine } from "../ics"

const NOW = new Date("2026-08-22T09:00:00.000Z")
const START = new Date("2026-08-27T13:30:00.000Z")
const END = new Date("2026-08-27T14:15:00.000Z")

const base = { uid: "round-1@gettailr.com", start: START, end: END, summary: "Interview", now: NOW }

describe("buildIcs", () => {
  it("uses CRLF everywhere, including a trailing one", () => {
    const ics = buildIcs(base)
    expect(ics.endsWith("\r\n")).toBe(true)
    // No bare LF anywhere: every \n must be preceded by \r.
    const bareLf = [...ics.matchAll(/(^|[^\r])\n/g)]
    expect(bareLf, "a bare newline makes Outlook ignore the file silently").toHaveLength(0)
  })

  it("stamps times as UTC basic format, so no VTIMEZONE is needed", () => {
    const ics = buildIcs(base)
    expect(ics).toContain("DTSTART:20260827T133000Z")
    expect(ics).toContain("DTEND:20260827T141500Z")
    expect(ics).toContain("DTSTAMP:20260822T090000Z")
  })

  it("escapes the characters that are special inside a TEXT value", () => {
    const ics = buildIcs({
      ...base,
      summary: "Interview, round 2; with A&B",
      description: "Line one\nLine two \\ backslash",
    })
    expect(ics).toContain("SUMMARY:Interview\\, round 2\; with A&B")
    expect(ics).toContain("Line one\\nLine two \\\\ backslash")
  })

  it("is an invitation to add, not an RSVP — the answering happens on the doorway", () => {
    // METHOD:REQUEST would put Accept/Decline buttons in the mail client, and
    // a decline there cannot give the client's slot back.
    expect(buildIcs(base)).toContain("METHOD:PUBLISH")
    expect(buildIcs(base)).not.toContain("METHOD:REQUEST")
  })
})

describe("line folding", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Interview")).toBe("SUMMARY:Interview")
  })

  it("folds past 75 octets with a leading space on continuations", () => {
    const line = "DESCRIPTION:" + "a".repeat(200)
    const folded = foldLine(line)
    const parts = folded.split("\r\n")
    expect(parts.length).toBeGreaterThan(1)
    expect(parts[0]!.length).toBe(75)
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true)
    // Unfolding must give the original back.
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(line)
  })

  it("never splits a multi-byte character across a fold", () => {
    // Folding counts BYTES. A naive slice at 75 characters would cut one of
    // these in half and produce mojibake or a rejected file.
    const line = "SUMMARY:" + "é".repeat(80)
    const folded = foldLine(line)
    for (const part of folded.split("\r\n")) {
      const stripped = part.startsWith(" ") ? part.slice(1) : part
      // A round-trip through a byte buffer proves nothing was cut mid-char.
      expect(Buffer.from(stripped, "utf8").toString("utf8")).toBe(stripped)
      expect(stripped).not.toContain("�")
    }
    const parts = folded.split("\r\n")
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(line)
  })

  it("keeps every folded line within the octet limit", () => {
    const line = "DESCRIPTION:" + "ü".repeat(120)
    for (const part of foldLine(line).split("\r\n")) {
      expect(Buffer.from(part, "utf8").length).toBeLessThanOrEqual(75)
    }
  })
})
