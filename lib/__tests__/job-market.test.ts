import { describe, it, expect } from "vitest"
import {
  normaliseRoleKey, salaryBand, mentionsSkill, computeUnlocks, topCompanies, isFresh,
  type MarketJob,
} from "@/lib/job-market"

const job = (over: Partial<MarketJob> = {}): MarketJob => ({
  title: "Product Operations Lead",
  company: "Monzo",
  location: "London",
  salaryMin: 60000,
  salaryMax: 75000,
  url: "https://example.com/1",
  description: "You will own the roadmap and run SQL analysis.",
  ...over,
})

describe("normaliseRoleKey", () => {
  it("collapses case and whitespace so the cache isn't split", () => {
    expect(normaliseRoleKey("  Product   Operations Lead ", "gb"))
      .toBe(normaliseRoleKey("product operations lead", "GB"))
  })
})

describe("salaryBand", () => {
  it("returns percentiles from advertised salaries", () => {
    const b = salaryBand([50000, 60000, 70000, 80000, 90000])!
    expect(b.median).toBe(70000)
    expect(b.p25).toBe(60000)
    expect(b.p75).toBe(80000)
    expect(b.sampleSize).toBe(5)
  })

  it("returns null rather than inventing a range when nothing is advertised", () => {
    expect(salaryBand([])).toBeNull()
    expect(salaryBand([0, NaN])).toBeNull()
  })
})

describe("mentionsSkill", () => {
  it("matches on word boundaries, not substrings", () => {
    expect(mentionsSkill("Experience with SQL required", "SQL")).toBe(true)
    expect(mentionsSkill("We use MySQLite here", "SQL")).toBe(false)
  })

  it("matches the distinctive head of a long skill label", () => {
    expect(mentionsSkill("You will lead capacity planning for the team", "Capacity planning basics (spreadsheets)")).toBe(true)
  })

  it("is case-insensitive", () => {
    expect(mentionsSkill("python scripting", "Python")).toBe(true)
  })
})

describe("computeUnlocks", () => {
  const jobs = [
    job({ description: "SQL and Python required" }),
    job({ description: "Strong SQL skills" }),
    job({ description: "Stakeholder management focus" }),
  ]

  it("counts live postings per open skill, most impactful first", () => {
    expect(computeUnlocks(jobs, ["Python", "SQL"])).toEqual([
      { skill: "SQL", roles: 2 },
      { skill: "Python", roles: 1 },
    ])
  })

  it("drops zero-mention skills — never show '0 roles', it reads as a scolding", () => {
    expect(computeUnlocks(jobs, ["Kubernetes"])).toEqual([])
  })
})

describe("topCompanies", () => {
  it("ranks employers by frequency", () => {
    const jobs = [job({ company: "Monzo" }), job({ company: "Cleo" }), job({ company: "Monzo" })]
    expect(topCompanies(jobs)).toEqual(["Monzo", "Cleo"])
  })
})

describe("isFresh", () => {
  const now = new Date("2026-07-26T12:00:00Z")

  it("treats snapshots under a week old as fresh", () => {
    expect(isFresh("2026-07-22T12:00:00Z", now)).toBe(true)
  })

  it("expires snapshots older than a week", () => {
    expect(isFresh("2026-07-10T12:00:00Z", now)).toBe(false)
  })

  it("treats an unparseable timestamp as stale", () => {
    expect(isFresh("not-a-date", now)).toBe(false)
  })
})
