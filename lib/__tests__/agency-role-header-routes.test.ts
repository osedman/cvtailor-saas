/**
 * The two header routes and the facts assembler behind them, pinned by
 * source scan — the same way the hiring payload's disclosure line is pinned.
 *
 * The client's header is the same ladder projected for the hiring manager,
 * and that only holds if three things stay true in the source: the route
 * never serialises the facts, it coarsens the shortlist phase, and a role
 * that is not theirs is "not found" rather than "forbidden".
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode as stripComments } from "./helpers/source-scan"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("the client's header route", () => {
  const src = stripComments(read("app/api/hiring/roles/[roleId]/header/route.ts"))

  it("checks the role is the contact's before reading anything about it", () => {
    for (const table of ["role_briefs", "submission_recipients", "interview_rounds", "availability_slots"]) {
      expect(src, `${table} tie missing`).toMatch(new RegExp(`from\\("${table}"\\)[\\s\\S]{0,200}\\.in\\("contact_id", contactIds\\)`))
    }
    expect(src).toMatch(/if \(!tie\) return NextResponse\.json\(\{ error: "Role not found" \}, \{ status: 404 \}\)/)
  })

  it("answers 'not found', never 'forbidden', for a role that is not theirs", () => {
    expect(src).not.toMatch(/status: 403[^\n]*Role/)
    expect((src.match(/"Role not found"/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it("never serialises the facts, only the projection", () => {
    // Only the response literal matters: `facts.x` reads are fine inside it,
    // `facts,` or `facts }` (the whole object) are not.
    const response = src.slice(src.lastIndexOf("return NextResponse.json({"))
    expect(response).not.toMatch(/\bfacts\s*[,}]/)
    for (const field of ["candidates", "reviewed", "undecided", "failures", "ownerId"]) {
      expect(src, `${field} would reach the client`).not.toMatch(new RegExp(`\\b${field}:`))
    }
  })

  it("coarsens the shortlist phase to SHORTLIST IN PROGRESS", () => {
    expect(src).toMatch(/inShortlist \? \{ key: "shortlist-in-progress", chip: "SHORTLIST IN PROGRESS" \}/)
  })

  it("projects for the client hat", () => {
    expect(src).toMatch(/nextAction\(facts, "client", roleId\)/)
  })
})

describe("the recruiter's header route", () => {
  const src = stripComments(read("app/api/agency/roles/[roleId]/header/route.ts"))
  it("projects for the recruiter hat from the same assembler", () => {
    expect(src).toMatch(/getRoleFacts\(auth\.ctx, roleId\)/)
    expect(src).toMatch(/nextAction\(facts, "recruiter", roleId\)/)
  })
})

describe("the facts assembler", () => {
  const src = stripComments(read("lib/agency/role-facts.ts"))

  it("resolves the owner to a name, never an email", () => {
    expect(src).toMatch(/from\("profiles"\)\.select\("full_name"\)/)
    expect(src).not.toMatch(/profile\?\.email/)
  })

  it("reuses the round and slot reads rather than copying them", () => {
    expect(src).toMatch(/listRoundsForRole\(ctx, roleId\)/)
    expect(src).toMatch(/listOpenSlots\(ctx, roleId\)/)
    expect(src).not.toMatch(/from\("interview_rounds"\)/)
    expect(src).not.toMatch(/from\("availability_slots"\)/)
  })

  it("derives the phase from the same two facts as everywhere else", () => {
    expect(src).toMatch(/derivePhase\(\{ hasSubmission: !!submission\.data, hasHandoverPack: !!packs\.data \}\)/)
  })

  it("counts client signals by ref, which survives purge", () => {
    expect(src).toMatch(/candidate_ref, action, created_at/)
    expect(src).toMatch(/a\.action === "interview" \|\| a\.action === "approve"/)
  })
})
