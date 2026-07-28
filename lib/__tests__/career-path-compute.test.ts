import { describe, it, expect } from "vitest"
import type { RequirementMapping } from "@/lib/anthropic"
import {
  skillMatches,
  deriveTargetRole,
  rankGapsByUnlock,
  computeReadiness,
  readinessFromTargetSkills,
  splitByEffort,
  forecastReadyDate,
  daysSinceLastStitch,
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
    expect(computeReadiness("Data Lead", [], [])).toEqual({ pct: 0, have: 0, total: 0, missing: [], haveList: [] })
  })
})

describe("readinessFromTargetSkills", () => {
  const t = (skill: string, have: boolean) => ({ skill, have })

  it("splits the role's skill set into have and missing", () => {
    const r = readinessFromTargetSkills([t("SQL", true), t("Python", false), t("Stakeholder management", true)], [])
    expect(r.total).toBe(3)
    expect(r.have).toBe(2)
    expect(r.pct).toBe(67)
    expect(r.haveList).toEqual(["SQL", "Stakeholder management"])
    expect(r.missing).toEqual(["Python"])
  })

  it("counts a path-closed skill as evidenced (fuzzy match)", () => {
    const r = readinessFromTargetSkills([t("Python", false), t("dbt", false)], ["python"])
    expect(r.have).toBe(1)
    expect(r.haveList).toEqual(["Python"])
    expect(r.missing).toEqual(["dbt"])
    expect(r.pct).toBe(50)
  })

  it("returns zero for an empty target set", () => {
    expect(readinessFromTargetSkills([], ["sql"])).toEqual({ pct: 0, have: 0, total: 0, missing: [], haveList: [] })
  })

  it("have + missing always cover the full set — nothing hidden", () => {
    const skills = [t("A", true), t("B", false), t("C", false), t("D", true), t("E", false)]
    const r = readinessFromTargetSkills(skills, [])
    expect(r.haveList.length + r.missing.length).toBe(skills.length)
  })
})

describe("forecastReadyDate", () => {
  const now = new Date("2026-07-25T12:00:00Z")

  it("forecasts from open skills and pace (10h per skill)", () => {
    const f = forecastReadyDate(3, 5, now) // 30h / 5h = 6 weeks
    expect(f.weeks).toBe(6)
    expect(f.readyByLabel).toBe("September 2026")
  })

  it("defaults to 3 hrs/week when pace is unset", () => {
    expect(forecastReadyDate(3, null, now).weeks).toBe(10)
  })

  it("returns no date when the path is complete — nothing to be behind on", () => {
    expect(forecastReadyDate(0, 5, now)).toEqual({ readyByLabel: null, weeks: 0 })
  })

  it("never forecasts less than one week", () => {
    expect(forecastReadyDate(1, 40, now).weeks).toBe(1)
  })
})

describe("daysSinceLastStitch", () => {
  const now = new Date("2026-07-25T12:00:00Z")

  it("uses the most recent touchedAt", () => {
    const items = [{ touchedAt: "2026-07-10T12:00:00Z" }, { touchedAt: "2026-07-22T12:00:00Z" }, {}]
    expect(daysSinceLastStitch(items, now)).toBe(3)
  })

  it("returns null when nothing has ever been touched", () => {
    expect(daysSinceLastStitch([{}, {}], now)).toBeNull()
  })
})

describe("splitByEffort", () => {
  const item = (skill: string, effortHours?: number) => ({ skill, effortHours })

  it("captures small skills and defers larger ones", () => {
    const { quick, candidates } = splitByEffort([
      item("Stakeholder mapping", 3),
      item("AWS Solutions Architect cert", 40),
      item("Pivot tables", 5),
      item("Kubernetes", 25),
    ])
    expect(quick.map((i) => i.skill)).toEqual(["Stakeholder mapping", "Pivot tables"])
    expect(candidates.map((i) => i.skill)).toEqual(["AWS Solutions Architect cert", "Kubernetes"])
  })

  it("treats the threshold as inclusive", () => {
    expect(splitByEffort([item("a", 5)]).quick).toHaveLength(1)
    expect(splitByEffort([item("a", 5.1)]).candidates).toHaveLength(1)
  })

  // When in doubt, ask. A missing or nonsense estimate must never let a
  // multi-week commitment slip silently onto someone's list.
  it("defers anything without a usable estimate", () => {
    const { quick, candidates } = splitByEffort([
      item("no estimate"),
      item("zero", 0),
      item("negative", -3),
      item("nonsense", Number.NaN),
      item("infinite", Number.POSITIVE_INFINITY),
    ])
    expect(quick).toHaveLength(0)
    expect(candidates).toHaveLength(5)
  })

  it("honours a custom threshold", () => {
    const { quick } = splitByEffort([item("a", 8)], 10)
    expect(quick).toHaveLength(1)
  })

  it("returns empty lists for empty input", () => {
    expect(splitByEffort([])).toEqual({ quick: [], candidates: [] })
  })
})

