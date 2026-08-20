/**
 * Right-to-work capture — the lines it must hold.
 *
 * The one that matters most is the last: eligibility is recorded as a fact
 * and NEVER filters a candidate. "No automatic rejection, ever" is the
 * product's first non-negotiable, and a compliance field is the most
 * tempting place to break it politely.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import path, { join } from "path"
import { RTW_STATUSES } from "@/lib/agency/compliance"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
// Scans read CODE, not the comments documenting the prohibitions — the
// migration says "there is deliberately no not_eligible" in prose, and a
// naive scan fails on its own documentation. Fourth time this trap has bitten.
const sqlCode = (src: string) => src.replace(/^\s*--.*$/gm, "")
const lib = read("lib/agency/compliance.ts")
const migration = read("supabase/migrations/20260820150000_brief_process_and_rtw.sql")
const migrationCode = sqlCode(migration)
const briefs = read("lib/agency/briefs.ts")

describe("statuses are facts, not conclusions", () => {
  it("offers no 'not eligible' — that is a decision about a person", () => {
    expect(RTW_STATUSES).toEqual(["unverified", "verified", "needs_sponsorship"])
    expect(migrationCode).not.toMatch(/not_eligible|ineligible/)
  })

  it("a checked status requires a note saying how", () => {
    expect(lib).toMatch(/rtwStatus !== "unverified" && !note/)
  })
})

describe("the write is audit-coupled", () => {
  it("the table grants authenticated SELECT only", () => {
    expect(migration).toMatch(/grant select on agency\.candidate_compliance to authenticated/)
    expect(migration).not.toMatch(/grant (insert|update|delete)[\s\S]{0,80}candidate_compliance/i)
  })

  it("the writer asserts ownership and writes the audit row", () => {
    expect(lib).toMatch(/candidate\.agency_id !== ctx\.agencyId/)
    expect(lib).toMatch(/action: "compliance_recorded"/)
  })

  it("the audit row carries shape, never the note's content", () => {
    const audit = lib.slice(lib.indexOf('action: "compliance_recorded"'))
    const block = audit.slice(0, audit.indexOf("})") + 2)
    expect(block).toMatch(/has_note/)
    expect(block).not.toMatch(/rtw_note:|note,/)
  })
})

describe("rtw_status never filters a candidate", () => {
  it("no agency source narrows a query or a list by rtw_status", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, out)
        else if (/\.tsx?$/.test(entry) && !full.includes("__tests__")) out.push(full)
      }
      return out
    }
    const files = [
      ...walk(path.join(process.cwd(), "lib/agency")),
      ...walk(path.join(process.cwd(), "app/agencies")),
      ...walk(path.join(process.cwd(), "app/api/agency")),
    ]
    const offenders: string[] = []
    for (const f of files) {
      const text = readFileSync(f, "utf8")
      // Filtering shapes: .eq/.neq/.in on the column, or JS filters keyed on it.
      if (/\.(eq|neq|in)\(\s*["']rtw_status/.test(text) || /filter\([^)]*rtwStatus/.test(text)) {
        offenders.push(path.relative(process.cwd(), f))
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })
})

describe("the brief's process facts stay advisory", () => {
  it("rounds ride brief → role as planned_rounds, and nothing enforces them", () => {
    expect(briefs).toMatch(/planned_rounds: \(brief\.interview_rounds/)
    // Round numbers remain derived from actual rounds; the plan must never
    // gate booking.
    const rounds = read("lib/agency/rounds.ts")
    expect(rounds).not.toMatch(/planned_rounds/)
  })
})
