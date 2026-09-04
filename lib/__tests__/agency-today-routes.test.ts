/**
 * Today, on both hats, and the client projection behind the client's routes.
 * Source scans, the same way the hiring payload's disclosure line is pinned:
 * both queues must come from the one ladder, and the client's must go
 * through the tie check and the coarsening in lib/agency/client-header.ts.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

describe("the recruiter's Today route", () => {
  const src = read("app/api/agency/today/route.ts")
  it("derives every row from the ladder, never from a stage column", () => {
    expect(src).toMatch(/getRoleFacts\(auth\.ctx, r\.id as string, now\)/)
    expect(src).toMatch(/nextAction\(facts, "recruiter", facts\.roleId\)/)
    expect(src).not.toMatch(/stage_state/)
  })
  it("leaves closed roles out", () => {
    expect(src).toMatch(/\.neq\("status", "closed"\)/)
  })
})

describe("the client projection", () => {
  const src = read("lib/agency/client-header.ts")
  it("ties a role to the caller through the four tables, checked against the caller's own ids", () => {
    for (const t of ["role_briefs", "submission_recipients", "interview_rounds", "availability_slots"]) {
      expect(src, t).toMatch(new RegExp(`from\\("${t}"\\)[\\s\\S]{0,160}\\.in\\("contact_id", contactIds\\)`))
    }
    expect(src).toMatch(/ctx\.links\.find\(\(l\) => l\.contactId === contactId && l\.agencyId === agencyId\)/)
  })
  it("coarsens the shortlist phase and projects for the client hat", () => {
    expect(src).toMatch(/nextAction\(facts, "client", tie\.roleId\)/)
    expect(src).toMatch(/chip: "SHORTLIST IN PROGRESS"/)
    expect(src).toMatch(/handoff: inShortlist \? null/)
  })
  it("never serialises the recruiter's counts", () => {
    const response = src.slice(src.lastIndexOf("return {"))
    for (const field of ["candidates", "reviewed", "undecided", "failures", "ownerId"]) {
      expect(response, field).not.toMatch(new RegExp(`\\b${field}:`))
    }
  })
})

describe("the client's routes go through the projection", () => {
  it.each(["app/api/hiring/roles/[roleId]/header/route.ts", "app/api/hiring/today/route.ts"])("%s", (p) => {
    const src = read(p)
    expect(src).toMatch(/listClientRoles\(auth\.ctx\)/)
    expect(src).toMatch(/getClientRoleHeader\(auth\.ctx/)
    expect(src).not.toMatch(/getRoleFacts\(/)
    expect(src).not.toMatch(/status: 403[^\n]*Role/)
  })
})

describe("the header renders where the plan says", () => {
  it.each([
    "app/agencies/roles/[roleId]/page.tsx",
    "app/agencies/roles/[roleId]/candidates/[candidateId]/page.tsx",
    "app/agencies/roles/[roleId]/interviews/page.tsx",
    "app/agencies/roles/[roleId]/close-out/page.tsx",
    "app/agencies/roles/[roleId]/candidates/[candidateId]/dossier/page.tsx",
  ])("%s — recruiter", (p) => {
    const src = read(p)
    expect(src).toMatch(/<RoleHeader roleId=\{roleId\} hat="recruiter" \/>/)
    // The header owns the owner select now; the sidebar box that held it goes.
    expect(src).not.toMatch(/ag-active-role/)
  })
  it("the client's role page — client", () => {
    expect(read("app/hiring/roles/[roleId]/page.tsx")).toMatch(/<RoleHeader roleId=\{roleId\} hat="client" \/>/)
  })
  it("both homes read their queue from the ladder's routes", () => {
    expect(read("app/agencies/page.tsx")).toMatch(/fetch\("\/api\/agency\/today"\)/)
    expect(read("app/hiring/page.tsx")).toMatch(/fetch\("\/api\/hiring\/today"\)/)
  })
})

describe("the header component", () => {
  const src = read("components/agency/role-header.tsx")
  it("renders nothing until loaded", () => {
    expect(src).toMatch(/if \(!data\) return null/)
  })
  it("refreshes on focus and on the role-changed event", () => {
    expect(src).toMatch(/addEventListener\("focus", onFocus\)/)
    expect(src).toMatch(/addEventListener\(ROLE_CHANGED, onFocus\)/)
  })
  it("only a writer sees the owner select", () => {
    expect(src).toMatch(/data\.callerRole !== "viewer"/)
  })
})
