/**
 * There is ONE assessment of a CV against requirements, and both paths use it.
 *
 * Quiet matching lets a recruiter set a minimum score, and consumer users are
 * scanned against it. That number only means something if the scan and the
 * recruiter's own ingestion judge a person identically — same prompt, same
 * tool schema, same clamp, same model. Two copies would drift within a
 * release, and the drift would be invisible: both sides would go on returning
 * plausible scores that quietly no longer agreed, and the threshold would
 * silently stop meaning what the recruiter was told.
 *
 * A source scan, in the manner of typography-consistency.test.ts — crude on
 * purpose. It cannot check the two produce equal scores at runtime; it checks
 * the much stronger structural property that there is only one of them.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

/** Everything under lib/ and app/, excluding this test's own directory. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry.startsWith(".") || entry === "node_modules" || entry === "__tests__") continue
    const rel = `${dir}/${entry}`
    if (statSync(join(ROOT, rel)).isDirectory()) sourceFiles(rel, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel)
  }
  return out
}

describe("the CV assessment lives in exactly one place", () => {
  const files = [...sourceFiles("lib"), ...sourceFiles("app")]

  it("scans a believable number of files", () => {
    // Guards against the walk silently returning nothing and the assertions
    // below passing vacuously.
    expect(files.length).toBeGreaterThan(100)
  })

  it("defines the extraction tool only in lib/agency/assessment.ts", () => {
    const definers = files.filter((f) => read(f).includes('name: "submit_candidate_assessment"'))
    expect(definers).toEqual(["lib/agency/assessment.ts"])
  })

  it("writes the assessment prompt only in lib/agency/assessment.ts", () => {
    const authors = files.filter((f) => read(f).includes("Assess the candidate CV below against"))
    expect(authors).toEqual(["lib/agency/assessment.ts"])
  })

  it("has ingestion import the shared extractor rather than its own", () => {
    const ingest = read("lib/agency/ingest.ts")
    expect(ingest).toMatch(/import\s*\{[^}]*extractAssessment[^}]*\}\s*from\s*["']\.\/assessment["']/)
    expect(ingest).not.toMatch(/async function extractAssessment/)
  })

  it("keeps the verbatim-quote cap with the extraction that produces the quotes", () => {
    // The cap matches the DB constraint on evidence quotes. It travelled with
    // the extractor so a second caller cannot truncate differently.
    expect(read("lib/agency/assessment.ts")).toMatch(/QUOTE_LIMIT\s*=\s*1000/)
    const definers = files.filter((f) => /(?:const|let|var)\s+QUOTE_LIMIT\s*=/.test(read(f)))
    expect(definers).toEqual(["lib/agency/assessment.ts"])
  })
})
