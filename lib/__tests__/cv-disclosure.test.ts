/**
 * The redaction is the whole promise: the client reads the CV, and still
 * cannot reach the candidate without the recruiter. Probe it in both
 * directions — what must go, and what must survive. A test that only checks
 * the first half would pass on a function that deleted the document.
 */

import { describe, it, expect } from "vitest"
import { redactContactDetails, anythingRemoved } from "@/lib/agency/cv-disclosure"

describe("redactContactDetails — what must never survive", () => {
  it("removes an email address", () => {
    const r = redactContactDetails("Priya Raman\npriya.raman@example.com\nData Engineer")
    expect(r.text).not.toContain("priya.raman@example.com")
    expect(r.text).not.toContain("example.com")
    expect(r.removed.emails).toBe(1)
  })

  it("removes emails with plus-aliases and subdomains", () => {
    const r = redactContactDetails("p.raman+jobs@mail.corp.example.co.uk")
    expect(r.text).not.toContain("@")
    expect(r.removed.emails).toBe(1)
  })

  it.each([
    "07700 900123",
    "07700900123",
    "+44 7700 900123",
    "+447700900123",
    "(0161) 496 0123",
    "0161 496 0123",
    "0161-496-0123",
  ])("removes the phone number %s", (phone) => {
    const r = redactContactDetails(`Call me on ${phone} any time`)
    expect(r.text).not.toMatch(/\d{6,}/)
    expect(r.removed.phones).toBeGreaterThan(0)
  })

  it("removes personal links", () => {
    const r = redactContactDetails("linkedin: https://www.linkedin.com/in/priya-raman and github.com work at www.github.com/praman")
    expect(r.text).not.toContain("linkedin.com/in")
    expect(r.text).not.toContain("www.github.com/praman")
    expect(r.removed.links).toBe(2)
  })

  it("removes a UK postcode, full or outward-and-inward spaced", () => {
    const full = redactContactDetails("14 Bridge Street, Manchester M1 4AB")
    expect(full.text).not.toContain("M1 4AB")
    expect(full.removed.postcodes).toBe(1)
    const tight = redactContactDetails("Leeds LS29JT")
    expect(tight.text).not.toContain("LS29JT")
  })

  it("removes every occurrence, not just the first", () => {
    const r = redactContactDetails("a@b.com then c@d.com then e@f.com")
    expect(r.removed.emails).toBe(3)
    expect(r.text).not.toContain("@")
  })
})

describe("redactContactDetails — what must survive", () => {
  it("keeps the working history, which is the point of reading it", () => {
    const cv = [
      "Lead Data Engineer, Northbank — 2021 to present",
      "Rebuilt the ingestion layer in PySpark, moving 40m events a day.",
      "Owned the Snowflake migration across 14 source systems.",
      "BSc Computer Science, University of Leeds, 2014",
    ].join("\n")
    const r = redactContactDetails(cv)
    expect(r.text).toBe(cv)
    expect(anythingRemoved(r)).toBe(false)
  })

  it("keeps date ranges, headcounts, salaries and percentages", () => {
    const cv = "2018-2021 · managed 12 engineers · £65,000 · cut latency 40% · 99.95% uptime"
    const r = redactContactDetails(cv)
    expect(r.text).toBe(cv)
  })

  it("keeps the city, which is a fact about the role, and drops the postcode", () => {
    const r = redactContactDetails("Manchester M1 4AB")
    expect(r.text).toContain("Manchester")
    expect(r.text).not.toContain("M1 4AB")
  })

  it("keeps the candidate's name — the name is disclosed, the way to reach them is not", () => {
    const r = redactContactDetails("Priya Raman\nSenior Data Engineer")
    expect(r.text).toContain("Priya Raman")
  })

  it("does not mistake a version or a year for a phone number", () => {
    const cv = "Airflow 2.5.1, Python 3.11, since 2019, ISO 27001"
    expect(redactContactDetails(cv).text).toBe(cv)
  })
})

describe("redactContactDetails — the empty and the absent", () => {
  it("treats null and undefined as empty rather than throwing", () => {
    expect(redactContactDetails(null).text).toBe("")
    expect(redactContactDetails(undefined).text).toBe("")
    expect(redactContactDetails("").removed.emails).toBe(0)
  })

  it("counts only — it never returns what it removed", () => {
    const r = redactContactDetails("priya.raman@example.com 07700 900123")
    expect(JSON.stringify(r)).not.toContain("priya.raman")
    expect(JSON.stringify(r)).not.toContain("900123")
  })
})
