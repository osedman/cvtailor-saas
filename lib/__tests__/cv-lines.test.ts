import { describe, it, expect } from "vitest"
import {
  isDateOnlyLine, isStackedCompanyLine, isStackedRoleTitleLine, isStackedDateLine,
} from "@/lib/cv-lines"
import { buildCvHtml } from "@/lib/word"

// The exact shape from the 4 Aug prod report: three stacked lines per job.
const STACKED = [
  "Lead Business Analyst, Transformation / Automation",
  "Fairmatic (Insurance Services)",
  "March 2025, September 2025",
  "• Led requirements gathering and migration for a new Policy Administration System",
  "Senior Business Analyst, Automation / AI (UiPath)",
  "YOOX NET-A-PORTER",
  "July 2021, January 2023",
]

describe("stacked role/company/dates classification", () => {
  it("recognises a date-only line but not prose containing a year", () => {
    expect(isDateOnlyLine("March 2025, September 2025")).toBe(true)
    expect(isDateOnlyLine("2019 - Present")).toBe(true)
    expect(isDateOnlyLine("Senior Analyst, Northwind — 2021 to Present")).toBe(false)
  })

  it("classifies every company the same, capitals or not", () => {
    expect(isStackedCompanyLine(STACKED, 1)).toBe(true) // Fairmatic (mixed case)
    expect(isStackedCompanyLine(STACKED, 5)).toBe(true) // YOOX (ALL CAPS)
    expect(isStackedRoleTitleLine(STACKED, 0)).toBe(true)
    expect(isStackedRoleTitleLine(STACKED, 4)).toBe(true)
    expect(isStackedDateLine(STACKED, 2)).toBe(true)
    expect(isStackedCompanyLine(STACKED, 3)).toBe(false) // bullet
  })

  it("leaves section headings and single-line roles alone", () => {
    const cv = ["EXPERIENCE", "Senior Analyst, Northwind — 2021 to Present", "Northwind Group, London"]
    expect(isStackedCompanyLine(cv, 0)).toBe(false)
    expect(isStackedCompanyLine(cv, 1)).toBe(false)
    expect(isStackedDateLine(cv, 1)).toBe(false)
  })
})

describe("Word export matches the preview for stacked blocks", () => {
  const html = buildCvHtml(`JANE DOE\njane@example.com\n\nEXPERIENCE\n\n${STACKED.join("\n")}`)

  it("renders an ALL-CAPS company as a bold company line, not a section heading", () => {
    // A heading would carry text-transform/border styling; the company line is
    // a plain bold paragraph. Assert YOOX appears exactly once, un-headinged.
    const yoox = html.split("\n").filter((l) => l.includes("YOOX NET-A-PORTER"))
    expect(yoox).toHaveLength(1)
    expect(yoox[0]).toContain("font-weight:bold")
    expect(yoox[0]).not.toContain("text-transform")
  })

  it("renders the mixed-case company bold and the date line unbolded", () => {
    const fairmatic = html.split("\n").find((l) => l.includes("Fairmatic"))
    expect(fairmatic).toContain("font-weight:bold")
    const dates = html.split("\n").find((l) => l.includes("March 2025, September 2025"))
    expect(dates).not.toContain("font-weight:bold")
  })
})
