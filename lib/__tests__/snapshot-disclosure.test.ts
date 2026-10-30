/**
 * One disclosure rule for every door (29 Sep 2026).
 *
 * The token portal returned the raw submission snapshot while the workspace
 * applied the recruiter's switches, so a name-withheld candidate's name — and
 * scores, evidence, notes and logistics switched off — reached the portal's
 * browser. These tests pin the rule and that both doors use it.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { discloseEntry, disclosePortalSnapshot, readDisclosure } from "@/lib/agency/snapshot-disclosure"

const root = join(__dirname, "..", "..")

const entry = {
  ref: "CAN-21",
  full_name: "Amara Okonkwo",
  current_title: "Senior Business Analyst",
  years: 8,
  location: "London",
  redacted: false,
  reviewed: true,
  overall: 97,
  original_overall: 91,
  categories: { skills: 30, domain: 20 },
  confidence_level: "high",
  must_have_hit: 6,
  must_have_total: 7,
  narrative: "Strong on discovery.",
  strengths: [{ requirement: "Requirements elicitation", quote: "Ran 40+ discovery sessions." }],
  gaps: [{ requirement: "Power BI", weight: "must" }],
  probe_areas: ["What did you not build?"],
  availability: "4 weeks",
  salary_confirm: "£70k confirmed",
}

const snap = (disclosure: Record<string, unknown> | undefined, e: Record<string, unknown> = entry) => ({
  generated_at: "2026-09-24T10:21:56Z",
  disclosure,
  intro: "Hi",
  role: { ref: "ROL-2419", title: "Business Analyst", company: "Meridian", location: "London", salary_band: "£65–75k" },
  shortlisted: [e],
  not_submitted_count: 4,
})

describe("readDisclosure", () => {
  it("an old snapshot with no switches reads the builder's defaults, and NO CV", () => {
    expect(readDisclosure({})).toEqual({ scores: true, evidence: true, probes: true, notes: false, logistics: true, cv: false })
  })
  it("reads what was frozen", () => {
    expect(readDisclosure({ disclosure: { scores: false, notes: true, cv: true } })).toMatchObject({ scores: false, notes: true, cv: true })
  })
})

describe("discloseEntry", () => {
  it("a name-withheld candidate's name never leaves the server", () => {
    const x = discloseEntry({ ...entry, redacted: true }, readDisclosure({}))
    expect(x.fullName).toBe("")
    expect(JSON.stringify(x)).not.toContain("Amara")
  })

  it("every switch off: every gated field is null — withheld, not zero or empty", () => {
    const off = readDisclosure({ disclosure: { scores: false, evidence: false, probes: false, notes: false, logistics: false } })
    const x = discloseEntry(entry, off)
    for (const k of ["overall", "originalOverall", "mustHaveHit", "mustHaveTotal", "narrative", "strengths", "gaps", "probeAreas", "availability", "salaryConfirm"] as const) {
      expect(x[k], k).toBeNull()
    }
    const wire = JSON.stringify(x)
    for (const leak of ["97", "Strong on discovery", "Ran 40+", "Power BI", "4 weeks", "£70k"]) expect(wire).not.toContain(leak)
  })

  it("switches on: the values come through", () => {
    const x = discloseEntry(entry, readDisclosure({ disclosure: { notes: true } }))
    expect(x.overall).toBe(97)
    expect(x.narrative).toBe("Strong on discovery.")
    expect(x.strengths).toHaveLength(1)
    expect(x.availability).toBe("4 weeks")
  })
})

describe("disclosePortalSnapshot is an allow-list", () => {
  it("recruiter-internal snapshot fields never reach the portal", () => {
    const wire = JSON.stringify(disclosePortalSnapshot(snap({ scores: true })))
    for (const internal of ["categories", "confidence_level", "not_submitted_count", "salary_band", "£65–75k"]) {
      expect(wire, internal).not.toContain(internal)
    }
  })
  it("a missing or broken snapshot is null, not a crash", () => {
    expect(disclosePortalSnapshot(null)).toBeNull()
    expect(disclosePortalSnapshot("x")).toBeNull()
    expect(disclosePortalSnapshot({})?.shortlisted).toEqual([])
  })
})

describe("both doors use the one rule", () => {
  it("the portal route never returns the raw snapshot", () => {
    const route = tsCode(readFileSync(join(root, "app/api/portal/[token]/route.ts"), "utf8"))
    expect(route).toMatch(/snapshot: disclosePortalSnapshot\(submission\?\.snapshot\)/)
    expect(route).not.toMatch(/snapshot: submission\?\.snapshot/)
  })
  it("the workspace mapper reads through the same functions", () => {
    const lib = tsCode(readFileSync(join(root, "lib/agency/client-shortlist.ts"), "utf8"))
    expect(lib).toMatch(/readDisclosure\(snapshot\)/)
    expect(lib).toMatch(/discloseEntry\(e, disclosure\)/)
  })
  it("the portal page says when a score or the evidence was not shared", () => {
    const page = tsCode(readFileSync(join(root, "app/portal/[token]/page.tsx"), "utf8"))
    expect(page).toMatch(/Score not shared/)
    expect(page).toMatch(/Withheld, not missing/)
    expect(page).not.toMatch(/full_name/)
  })
})
