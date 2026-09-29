/**
 * Two leaks found 22 Sep 2026: the UI hid them, the payload did not.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (f: string) => tsCode(readFileSync(join(process.cwd(), f), "utf8"))

describe("what reaches the hiring manager's browser", () => {
  it("an erased candidate's name is blanked in the shortlist payload, not just the UI", () => {
    // The rule moved to the one module every door uses (29 Sep 2026); the
    // workspace mapper must go through it, and it must blank the name.
    expect(read("lib/agency/client-shortlist.ts")).toMatch(/discloseEntry\(e, disclosure\)/)
    expect(read("lib/agency/snapshot-disclosure.ts")).toMatch(/fullName: redacted \? "" :/)
  })
  it("the client cohort board carries only people sent to them, named from their snapshot", () => {
    const route = read("app/api/hiring/roles/[roleId]/cohort/route.ts")
    const get = route.slice(route.indexOf("export async function GET"))
    expect(get).toMatch(/\.filter\(\(m\) => sent\.has\(m\.candidateRef\)\)/)
    expect(get).toMatch(/candidateName: e\.redacted \|\| !e\.fullName \? m\.candidateRef : e\.fullName/)
    expect(get).not.toMatch(/NextResponse\.json\(\{ \.\.\.board, wave/)
  })
})
