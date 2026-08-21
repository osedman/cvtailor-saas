/**
 * Placements — the money record.
 *
 * The rebate window is tested on values because it is arithmetic somebody
 * will rely on to know their exposure; the rest are structural promises,
 * scanned rather than mocked.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import path, { join } from "path"
import { rebateWindow, PLACEMENT_STATUSES } from "@/lib/agency/placements"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sqlCode = (src: string) => src.replace(/^\s*--.*$/gm, "")
const lib = read("lib/agency/placements.ts")
const migration = read("supabase/migrations/20260820180000_agency_placements.sql")

describe("the rebate window", () => {
  it("is start date plus the weeks, to the day", () => {
    // 12 weeks = 84 days. 1 Sep + 84 = 24 Nov.
    expect(rebateWindow("2026-09-01", 12).until).toBe("2026-11-24")
  })

  it("is open before that date and closed after it", () => {
    expect(rebateWindow("2026-09-01", 12, new Date("2026-10-01T00:00:00Z")).open).toBe(true)
    expect(rebateWindow("2026-09-01", 12, new Date("2026-12-01T00:00:00Z")).open).toBe(false)
  })

  it("is nothing at all without both a start date and a term", () => {
    expect(rebateWindow(null, 12)).toEqual({ until: null, open: false })
    expect(rebateWindow("2026-09-01", null)).toEqual({ until: null, open: false })
  })

  it("is derived, never stored — a corrected start date cannot strand it", () => {
    expect(migration).not.toMatch(/rebate_until/)
  })
})

describe("a placement is an outcome, never a judgement", () => {
  it("declining is a status, and no source filters or ranks on it", () => {
    expect(PLACEMENT_STATUSES).toContain("declined")
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
    const offenders = files.filter((f) => {
      const t = readFileSync(f, "utf8")
      // Narrowing a candidate query by placement outcome, in either idiom.
      return /\.(eq|neq|in)\(\s*["']status["']\s*,\s*["']declined/.test(t) ||
        /candidates[\s\S]{0,200}placement[\s\S]{0,60}filter/.test(t)
    })
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([])
  })

  it("a fall-through must say what happened", () => {
    expect(lib).toMatch(/teaches nobody anything/)
  })
})

describe("the write is audit-coupled", () => {
  it("the table grants authenticated SELECT only", () => {
    const code = sqlCode(migration)
    expect(code).toMatch(/grant select on agency\.placements to authenticated/)
    expect(code).not.toMatch(/grant (insert|update|delete)/i)
  })

  it("asserts ownership, then writes the audit row", () => {
    expect(lib).toMatch(/candidate\.agency_id !== ctx\.agencyId/)
    expect(lib).toMatch(/action: existing \? "placement_updated" : "placement_recorded"/)
  })

  it("one placement per candidate per role", () => {
    expect(migration).toMatch(/unique index[\s\S]{0,80}placements \(role_id, candidate_id\)/)
  })
})

describe("recording a placement never closes the role", () => {
  it("nothing in the module touches role status or the retention clock", () => {
    const code = lib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/status:\s*["']closed["']|closed_at|retention_expires_at/)
  })

  it("timestamps stamp once — re-saving does not move the day it happened", () => {
    expect(lib).toMatch(/existing\?\.status !== "accepted"/)
    expect(lib).toMatch(/existing\?\.status !== "started"/)
  })
})
