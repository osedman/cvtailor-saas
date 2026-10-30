/**
 * Character or HR — and the two forms that follow from it (23 Sep 2026).
 *
 * Ose: references need to be either a character reference or an HR one, the
 * recruiter picks, and the character link should ask a simple date and two
 * questions about the experience.
 *
 * The thing most worth protecting here is not the question wording; it is
 * that ANSWER KEYS ARE STABLE. Answers are stored against their key, so
 * reusing a key for a different question silently re-labels something a
 * referee already said about a real person — the kind of error nobody
 * notices until it is quoted back in a handover pack.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { asReferenceKind, REFERENCE_KINDS, KIND_LABEL } from "@/lib/agency/references"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const page = read("app/reference/[token]/page.tsx")
const refs = read("lib/agency/references.ts")
const route = read("app/api/agency/candidates/[candidateId]/references/route.ts")
/**
 * Comments state the rules, so scanning them is scanning our own prose. This
 * file's first cut failed on the word "unknown" — inside the migration's own
 * comment explaining why 'unknown' was NOT used. Same trap as the scan that
 * matched its own documentation, logged in the b2b skill.
 */
const sqlCode = (src: string) => src.replace(/^\s*--.*$/gm, "")
const migration = sqlCode(read("supabase/migrations/20260923090000_reference_kind.sql"))

describe("the kind guard", () => {
  it("accepts the two kinds and nothing else", () => {
    expect(REFERENCE_KINDS).toEqual(["character", "hr"])
    expect(asReferenceKind("hr")).toBe("hr")
    expect(asReferenceKind("character")).toBe("character")
  })

  it("reads anything unrecognised as character, the safer of the two", () => {
    // An HR team asked the character questions is a nuisance; a character
    // referee asked only for dates loses the reference entirely.
    for (const v of [undefined, null, "", "HR", "Character", "manager", 7, {}, []]) {
      expect(asReferenceKind(v)).toBe("character")
    }
  })

  it("labels both in words a recruiter would use", () => {
    expect(KIND_LABEL.character).toBe("Character reference")
    expect(KIND_LABEL.hr).toBe("HR reference")
  })
})

describe("answer keys never move", () => {
  /**
   * Q1 was "How did you work with them, and for how long?" — now the dates.
   * Q3 was "Is there anything the employer should know?" — dropped from the
   * character form. Neither key may be reused for a new question, or an
   * answer given in August gets a September label.
   */
  it("does not reuse Q1 or Q3 for a new question", () => {
    const character = page.slice(page.indexOf("character: ["), page.indexOf("/** Facts only"))
    expect(character).toContain('key: "Q2"')
    expect(character).toContain('key: "Q4"')
    expect(character).not.toContain('key: "Q1"')
    expect(character).not.toContain('key: "Q3"')
  })

  it("keys the HR questions in their own space", () => {
    const hr = page.slice(page.indexOf("hr: ["))
    expect(hr).toContain('key: "H1"')
    expect(hr).toContain('key: "H2"')
  })

  it("keys the dates rather than positioning them", () => {
    expect(page).toMatch(/DATE_KEYS = \{ from: "D1", to: "D2", current: "D3" \}/)
  })
})

describe("the character form", () => {
  const character = page.slice(page.indexOf("character: ["), page.indexOf("/** Facts only"))

  it("asks exactly two questions", () => {
    expect(character.match(/key: "/g)).toHaveLength(2)
  })

  it("asks what they were like to work with, and whether they would again", () => {
    expect(character).toMatch(/What were they like to work with\?/)
    expect(character).toMatch(/Would you work with them again, and why\?/)
  })

  it("asks the date in plain language, not as a date picker", () => {
    expect(page).toMatch(/When did you start working together\?/)
    expect(page).toMatch(/Month and year is plenty/)
    // A date input would demand a day nobody remembers.
    expect(page).not.toMatch(/type="date"/)
  })
})

describe("the HR form asks for facts and not for an opinion", () => {
  const hr = page.slice(page.indexOf("hr: ["))

  it("asks the title and a factual note", () => {
    expect(hr).toMatch(/What was their job title\?/)
    expect(hr).toMatch(/Anything factual we should know\?/)
  })

  it("never asks what they were like to work with", () => {
    expect(hr).not.toMatch(/like to work with/)
    expect(hr).not.toMatch(/did they do well/)
  })

  it("says so in the email too, before they click", () => {
    expect(route).toMatch(/not asking for an opinion/)
  })
})

describe("the kind travels the whole way", () => {
  it("is stored on the referee, not inferred later", () => {
    expect(refs).toMatch(/kind: asReferenceKind\(input\.kind\)/)
    expect(migration).toMatch(/add column if not exists kind text not null default 'character'/)
    expect(migration).toMatch(/check \(kind in \('character', 'hr'\)\)/)
  })

  it("reaches the referee's page, which cannot guess it", () => {
    expect(refs).toMatch(/kind: asReferenceKind\(ref\.kind\)/)
    expect(page).toMatch(/const kind: ReferenceKind = view\?\.kind === "hr" \? "hr" : "character"/)
  })

  it("reaches the request email's subject and body", () => {
    expect(route).toMatch(/Confirming \$\{request\.candidateName\}'s employment/)
    expect(route).toMatch(/kind: request\.kind/)
  })

  /**
   * 23 Sep 2026: the first cut of this migration put a subquery inside a
   * CHECK and Postgres refused the whole script (0A000). Ose found it by
   * running it. A CHECK is row-local and immutable; `select` inside one is
   * never legal, so this scans every CHECK in the migration for one.
   */
  it("puts no subquery inside a check constraint", () => {
    const checks = migration.match(/check\s*\(([\s\S]*?)\)\s*;/gi) ?? []
    expect(checks.length).toBeGreaterThan(0)
    for (const c of checks) expect(c).not.toMatch(/\bselect\b/i)
  })

  it("names the four legal values of references_wanted, character first", () => {
    expect(migration).toMatch(/references_wanted = array\['character', 'hr'\]::text\[\]/)
    expect(migration).not.toMatch(/array\['hr', 'character'\]/)
  })

  it("defaults existing rows to character rather than inventing a third state", () => {
    // Every reference taken before today WAS asked the character questions.
    expect(migration).toMatch(/default 'character'/)
    expect(migration).not.toMatch(/'unknown'/)
  })
})

describe("what the two forms still share", () => {
  it("keeps the verbatim promise and the equal-weight refusal", () => {
    expect(page).toMatch(/exactly as you write them/)
    expect(page).toMatch(/I&apos;d prefer not to/)
    expect(page).toMatch(/cs-btn-quiet/)
  })

  it("sends only answers somebody actually gave", () => {
    expect(page).toMatch(/\.filter\(\(a\) => a\.answer\.trim\(\)\.length > 0\)/)
  })

  it("does not send an end date and 'still there' at the same time", () => {
    expect(page).toMatch(/answer: stillThere \? "" : answers\[DATE_KEYS\.to\] \?\? ""/)
  })
})
