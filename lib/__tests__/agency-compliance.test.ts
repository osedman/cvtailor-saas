/**
 * Right-to-work capture — the lines it must hold.
 *
 * The one that matters most is still the last: eligibility is recorded as a
 * fact and NEVER filters a candidate. "No automatic rejection, ever" is the
 * product's first non-negotiable, and a compliance field is the most tempting
 * place to break it politely.
 *
 * New here, and learned the expensive way: the grants test used to assert
 * only that `authenticated` cannot write. That was true, it passed, and it
 * was HALF the invariant — nothing asserted that the role which does write
 * the table can. service_role had no grant at all, so every save failed 42501
 * on deployed staging while these tests stayed green, because they mock
 * Supabase and therefore agree with the code rather than with Postgres.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import path, { join } from "path"
import {
  RTW_EVIDENCE,
  RTW_SPONSORSHIP,
  EMPLOYER_CHECK_NOTICE,
  EVIDENCE_LABEL,
  SPONSORSHIP_LABEL,
} from "@/lib/agency/compliance-vocab"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
// Scans read CODE, not the comments documenting the prohibitions — the
// migration says "there is deliberately no not_eligible" in prose, and a
// naive scan fails on its own documentation. Fifth time this trap has bitten.
// Shared: this trap has bitten six times across three guards, so the helper
// lives in ./helpers/source-scan rather than being copied again.
import { tsCode, sqlCode } from "./helpers/source-scan"

const lib = read("lib/agency/compliance.ts")
const vocab = read("lib/agency/compliance-vocab.ts")
const card = read("components/agency/candidate-compliance.tsx")
const grantsMigration = read("supabase/migrations/20260822090000_service_role_write_grants.sql")
const axesMigration = read("supabase/migrations/20260822100000_rtw_two_axes.sql")
const axesCode = sqlCode(axesMigration)

describe("two axes, not one", () => {
  it("evidence records an act; sponsorship records what the candidate said", () => {
    expect(RTW_EVIDENCE).toEqual(["not_checked", "seen"])
    expect(RTW_SPONSORSHIP).toEqual(["not_asked", "not_required", "required", "unsure"])
  })

  it("offers no 'not eligible' on either axis, in values or in words", () => {
    expect(axesCode).not.toMatch(/not_eligible|ineligible/)
    expect(tsCode(vocab)).not.toMatch(/not_eligible|ineligible/i)
    for (const label of [...Object.values(EVIDENCE_LABEL), ...Object.values(SPONSORSHIP_LABEL)]) {
      expect(label).not.toMatch(/ineligible|not eligible|illegal|refused|failed/i)
    }
  })

  /**
   * The rename is the point of migration 27, not cosmetics. 'verified' read as
   * the employer's statutory check, which the agency cannot perform and does
   * not confer. If it ever comes back as a stored value, this fails.
   */
  it("never stores the word 'verified' as a state again", () => {
    expect(RTW_EVIDENCE as readonly string[]).not.toContain("verified")
    const checkLine = axesCode.match(/check \(rtw_evidence in \([^)]*\)\)/)?.[0] ?? ""
    expect(checkLine).toBeTruthy()
    expect(checkLine).not.toMatch(/verified/)
  })

  it("the sponsorship labels attribute the answer to the candidate", () => {
    // Every label that carries an answer says whose answer it is, so the card
    // cannot be misread as the agency ruling on somebody's status.
    for (const key of ["not_required", "required", "unsure"] as const) {
      expect(SPONSORSHIP_LABEL[key]).toMatch(/\bthey\b/i)
    }
  })
})

describe("the employer's check is never claimed", () => {
  it("the notice names the employer and the fact it is not done here", () => {
    expect(EMPLOYER_CHECK_NOTICE).toMatch(/employer/i)
    expect(EMPLOYER_CHECK_NOTICE).toMatch(/statutory/i)
    expect(EMPLOYER_CHECK_NOTICE).toMatch(/before employment starts/i)
  })

  it("the card renders it, not a tooltip or a title attribute", () => {
    const code = tsCode(card)
    expect(code).toMatch(/\{EMPLOYER_CHECK_NOTICE\}/)
    // A title= or aria-label= would satisfy a naive "is the string present"
    // scan while showing the recruiter nothing.
    expect(code).not.toMatch(/(title|aria-label)=\{EMPLOYER_CHECK_NOTICE\}/)
  })
})

describe("an expiry date is a fact about evidence", () => {
  it("the database refuses an expiry with no evidence behind it", () => {
    expect(axesCode).toMatch(
      /check \(rtw_expires_on is null or rtw_evidence = 'seen'\)/
    )
  })

  it("the writer refuses it too, rather than relying on the constraint", () => {
    expect(tsCode(lib)).toMatch(/expiresOn && !seen/)
  })

  it("a malformed date is rejected, never coerced", () => {
    expect(tsCode(lib)).toMatch(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/)
  })
})

describe("the write is audit-coupled", () => {
  it("the table grants authenticated SELECT only", () => {
    const rtw = read("supabase/migrations/20260820150000_brief_process_and_rtw.sql")
    expect(rtw).toMatch(/grant select on agency\.candidate_compliance to authenticated/)
    expect(rtw).not.toMatch(/grant (insert|update|delete)[\s\S]{0,80}candidate_compliance/i)
    expect(sqlCode(grantsMigration)).not.toMatch(/to authenticated/)
  })

  /**
   * THE OTHER HALF, missing until 22 Aug. A table nothing can write is not
   * "safe", it is broken — and the previous version of this file could not
   * tell the difference, because it only ever asked about `authenticated`.
   */
  it("the service role can write the tables whose routes own them", () => {
    const code = sqlCode(grantsMigration)
    for (const table of ["candidate_compliance", "placements"]) {
      const line = code
        .split("\n")
        .find((l) => l.includes(`agency.${table}`) && l.includes("service_role"))
      expect(line, `no service_role grant for agency.${table}`).toBeTruthy()
      expect(line).toMatch(/\binsert\b/)
      expect(line).toMatch(/\bupdate\b/)
    }
  })

  /**
   * `grant all on all tables in schema agency to service_role` in
   * 20260805120000_agency_core.sql reads like a rule for the schema and is a
   * point-in-time snapshot — pg_default_acl holds nothing for this schema, so
   * a table created later inherits nothing. Two migrations forgot, and those
   * two tables were the only ones of thirty-two that service_role could not
   * touch. This makes forgetting fail the build.
   */
  it("every agency table created after the blanket grant has its own", () => {
    const dir = join(process.cwd(), "supabase/migrations")
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()

    const BLANKET = "20260805120000_agency_core.sql"
    const created: Record<string, string> = {}
    let granted = new Set<string>()

    for (const f of files) {
      const src = sqlCode(read(`supabase/migrations/${f}`))
      for (const m of src.matchAll(
        /create table if not exists\s+agency\.([a-z_]+)/gi
      )) {
        // The blanket grant covers whatever existed when it ran.
        if (f > BLANKET) created[m[1]] = f
      }
      for (const m of src.matchAll(/grant[\s\S]{0,300}?to\s+[^;]*service_role/gi)) {
        for (const t of m[0].matchAll(/agency\.([a-z_]+)/gi)) granted.add(t[1])
      }
    }

    const ungranted = Object.entries(created)
      .filter(([t]) => !granted.has(t))
      .map(([t, f]) => `agency.${t} (created in ${f})`)

    expect(
      ungranted,
      `these tables postdate the blanket grant and never got their own:\n${ungranted.join("\n")}`
    ).toEqual([])
  })

  it("the writer asserts ownership and writes the audit row", () => {
    expect(lib).toMatch(/candidate\.agency_id !== ctx\.agencyId/)
    expect(lib).toMatch(/action: "compliance_recorded"/)
  })

  it("the audit row carries shape, never the note's content or the date", () => {
    const audit = lib.slice(lib.indexOf('action: "compliance_recorded"'))
    const block = audit.slice(0, audit.indexOf("},\n  })") + 2)
    expect(block).toMatch(/has_note/)
    expect(block).toMatch(/has_expiry/)
    // An expiry date IS somebody's immigration position. Shape, not substance.
    expect(block).not.toMatch(/rtw_note:|rtw_expires_on:/)
    expect(block).not.toMatch(/expiresOn(?!\s*!==\s*null)/)
  })
})

describe("the vocabulary has exactly one definition", () => {
  /**
   * The card used to re-declare `type RtwStatus = "unverified" | ...` because
   * it could not import from compliance.ts without dragging agencyAdmin into
   * the browser bundle. When the server vocabulary changed, the card went on
   * sending the old value and TypeScript said nothing — two copies have no
   * relationship to check.
   */
  it("no surface re-declares the unions locally", () => {
    for (const [name, src] of [
      ["card", card],
      ["lib", lib],
    ] as const) {
      const code = tsCode(src)
      // A local union literal of these values is the shape to forbid.
      expect(code, `${name} re-declares the evidence union`).not.toMatch(
        /type\s+RtwEvidence\s*=\s*["']/
      )
      expect(code, `${name} re-declares the sponsorship union`).not.toMatch(
        /type\s+RtwSponsorship\s*=\s*["']/
      )
      expect(code, `${name} hardcodes the old vocabulary`).not.toMatch(
        /["']needs_sponsorship["']|["']unverified["']/
      )
    }
  })

  it("the vocabulary module pulls in nothing server-only", () => {
    // If this ever imports ./db (or anything reaching next/headers), a client
    // component importing a constant from it fails the production build.
    //
    // Stripped, because the module's own header explains WHY it must not
    // reach agencyAdmin — and an unstripped scan fails on that explanation.
    // That is the fifth or sixth time a file has failed a scan for the word
    // it exists to prohibit; strip first, always.
    const code = tsCode(vocab)
    expect(code).not.toMatch(/from\s+["']\.\/db["']/)
    expect(code).not.toMatch(/next\/headers|agencyAdmin|SERVICE_ROLE/)
    // It should import nothing at all today; if that changes, the import must
    // still be type-only or another vocab-style module.
    for (const imp of code.match(/^import .*$/gm) ?? []) {
      expect(imp, `unexpected import in compliance-vocab: ${imp}`).toMatch(/^import type /)
    }
  })
})

describe("compliance never filters a candidate", () => {
  it("no agency source narrows a query or a list by any compliance column", () => {
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
      ...walk(path.join(process.cwd(), "components/agency")),
    ]

    const COLS = ["rtw_evidence", "rtw_sponsorship", "rtw_expires_on"]
    const CAMEL = ["rtwEvidence", "rtwSponsorship", "rtwExpiresOn"]
    const offenders: string[] = []

    for (const f of files) {
      const text = tsCode(readFileSync(f, "utf8"))
      const rel = path.relative(process.cwd(), f)
      // compliance.ts legitimately reads its own row by candidate_id; what is
      // forbidden is narrowing a LIST by a compliance value.
      for (const col of COLS) {
        if (new RegExp(`\\.(eq|neq|in|gt|lt|gte|lte|order)\\(\\s*["']${col}`).test(text)) {
          offenders.push(`${rel}: query narrowed by ${col}`)
        }
      }
      for (const c of CAMEL) {
        // [^\n]* not [^)]*: `.filter((r) => r.rtwEvidence...)` closes a [^)]*
        // scan at the arrow parameter's paren, before the column name. Found
        // via the represent guardrail's probe mutant, which shares this shape.
        if (new RegExp(`\\.(filter|find|some|every|sort)\\([^\\n]*${c}`).test(text)) {
          offenders.push(`${rel}: list narrowed by ${c}`)
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })

  it("the derived deadline is advisory and cannot gate a save", () => {
    const code = tsCode(lib)
    const fn = code.slice(code.indexOf("async function deriveRequiredBy"))
    const body = fn.slice(0, fn.indexOf("\n}\n") + 2)
    // It reads a placement and returns a date. It must not throw, and it must
    // not be consulted before the write.
    expect(body).not.toMatch(/throw/)
    const setter = code.slice(code.indexOf("export async function setCandidateCompliance"))
    const beforeUpsert = setter.slice(0, setter.indexOf(".upsert("))
    expect(beforeUpsert).not.toMatch(/deriveRequiredBy/)
  })
})
