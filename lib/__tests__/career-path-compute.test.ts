import { describe, it, expect } from "vitest"
import type { RequirementMapping } from "@/lib/anthropic"
import {
  skillMatches,
  deriveTargetRole,
  rankGapsByUnlock,
  computeReadiness,
  type HistoryEntry,
  type TrackerJob,
} from "@/lib/career-path-compute"

const req = (
  keywords: string[],
  strength: RequirementMapping["strength"],
  type: RequirementMapping["type"] = "must",
): RequirementMapping => ({ requirement: keywords[0], type, keywords, strength, evidence: "" })

const entry = (historyId: string, jobTitle: string, createdAt: string, coverage: RequirementMapping[]): HistoryEntry =>
  ({ historyId, jobTitle, createdAt, coverage })

describe("skillMatches", () => {
  it("matches case-insensitively and both directions", () => {
    expect(skillMatches("SQL", "sql")).toBe(true)
    expect(skillMatches("stakeholder", "stakeholder management")).toBe(true)
    expect(skillMatches("stakeholder management", "stakeholder")).toBe(true)
  })
  it("does not match unrelated skills or blanks", () => {
    expect(skillMatches("python", "tableau")).toBe(false)
    expect(skillMatches("", "sql")).toBe(false)
  })
})

describe("deriveTargetRole", () => {
  it("returns the most frequent title", () => {
    const h = [
      entry("1", "Data Analyst", "2026-01-01", []),
      entry("2", "Data Analyst", "2026-02-01", []),
      entry("3", "Product Manager", "2026-03-01", []),
    ]
    expect(deriveTargetRole(h)).toBe("Data Analyst")
  })
  it("breaks ties by most recent", () => {
    const h = [
      entry("1", "Data Analyst", "2026-01-01", []),
      entry("2", "Data Lead", "2026-05-01", []),
    ]
    expect(deriveTargetRole(h)).toBe("Data Lead")
  })
  it("returns empty string for no history", () => {
    expect(deriveTargetRole([])).toBe("")
  })
})

describe("rankGapsByUnlock", () => {
  const history = new Map<string, HistoryEntry>([
    ["h1", entry("h1", "Data Lead", "2026-01-01", [req(["python"], "none"), req(["sql"], "strong")])],
    ["h2", entry("h2", "Data Lead", "2026-02-01", [req(["python"], "partial")])],
    ["h3", entry("h3", "Analyst", "2026-03-01", [req(["tableau"], "none")])],
  ])
  const tracker: TrackerJob[] = [
    { historyId: "h1", status: "saved", jobTitle: "Data Lead at A" },
    { historyId: "h2", status: "applied", jobTitle: "Data Lead at B" },
    { historyId: "h3", status: "interview", jobTitle: "Analyst at C" }, // not active → ignored
  ]

  it("counts only active (saved/applied) jobs that need the skill", () => {
    const ranked = rankGapsByUnlock(["python", "tableau"], tracker, history)
    const python = ranked.find((r) => r.skill === "python")!
    const tableau = ranked.find((r) => r.skill === "tableau")!
    expect(python.unlockCount).toBe(2)
    expect(python.sourceJobs).toEqual(["Data Lead at A", "Data Lead at B"])
    expect(tableau.unlockCount).toBe(0) // its job is in interview stage, not active
  })

  it("sorts by unlock count descending", () => {
    const ranked = rankGapsByUnlock(["tableau", "python"], tracker, history)
    expect(ranked[0].skill).toBe("python")
  })
})

describe("computeReadiness", () => {
  it("counts strong/transferable and closed skills as evidence", () => {
    const history = [
      entry("h1", "Data Lead", "2026-01-01", [
        req(["sql"], "strong"),       // have (strong)
        req(["python"], "none"),      // missing unless closed
        req(["dbt"], "transferable"), // have (transferable)
      ]),
    ]
    const r = computeReadiness("Data Lead", history, ["python"]) // python closed on the path
    expect(r.total).toBe(3)
    expect(r.have).toBe(3) // sql + dbt evidenced, python closed
    expect(r.pct).toBe(100)
    expect(r.missing).toEqual([])
  })

  it("reports the missing requirements when not fully ready", () => {
    const history = [
      entry("h1", "Data Lead", "2026-01-01", [req(["sql"], "strong"), req(["python"], "none")]),
    ]
    const r = computeReadiness("Data Lead", history, [])
    expect(r.total).toBe(2)
    expect(r.have).toBe(1)
    expect(r.pct).toBe(50)
    expect(r.missing).toEqual(["python"])
  })

  it("returns zero when there is no relevant history", () => {
    expect(computeReadiness("Data Lead", [], [])).toEqual({ pct: 0, have: 0, total: 0, missing: [] })
  })
})
