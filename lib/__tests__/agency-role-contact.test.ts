/**
 * The brief is the recruiter's job description (smooth-flow plan, Wave 5a):
 * the hiring-manager contact, the planned rounds and the start target are
 * set at intake. Source scans pin the one line that matters — a role can
 * never point at another agency's contact — and that the tie reaches the
 * client's workspace and the header's client name.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const read = (p: string) => tsCode(readFileSync(join(process.cwd(), p), "utf8"))

describe("the role's contact", () => {
  it("is checked against the caller's agency before it is written", () => {
    const src = read("app/api/agency/roles/[roleId]/route.ts")
    expect(src).toMatch(/from\("client_contacts"\)[\s\S]{0,120}\.eq\("agency_id", auth\.ctx\.agencyId\)[\s\S]{0,60}\.eq\("id", body\.contact_id\)/)
    expect(src).toMatch(/That contact is not in your agency/)
  })
  it("planned rounds stay inside the schema's 1–6, or null", () => {
    const src = read("app/api/agency/roles/[roleId]/route.ts")
    expect(src).toMatch(/body\.planned_rounds >= 1 && body\.planned_rounds <= 6/)
  })
  it("ties the role to the client's workspace", () => {
    const src = read("lib/agency/client-header.ts")
    expect(src).toMatch(/from\("job_roles"\)\.select\("id, agency_id, contact_id"\)\.in\("contact_id", contactIds\)/)
  })
  it("names the client on the header from the role first, then the brief", () => {
    const src = read("lib/agency/role-facts.ts")
    expect(src).toMatch(/\(role\.contact_id as string \| null\) \?\? \(brief\.data\?\.contact_id as string \| null\)/)
  })
  it("a client-written brief copies its contact onto the minted role, so both paths converge", () => {
    const src = read("lib/agency/briefs.ts")
    expect(src).toMatch(/contact_id: \(brief\.contact_id as string \| null\) \?\? null/)
  })
  it("intake names the hiring manager, the planned rounds and the start target", () => {
    const src = read("app/agencies/roles/[roleId]/page.tsx")
    expect(src).toMatch(/id="role-contact"/)
    expect(src).toMatch(/id="role-rounds"/)
    expect(src).toMatch(/Start target/)
    expect(src).toMatch(/fetch\("\/api\/agency\/clients"\)/)
  })
  it("the migration is additive and set-null", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260905100000_role_contact.sql"), "utf8")
    expect(sql).toMatch(/add column if not exists contact_id uuid references agency\.client_contacts on delete set null/)
  })
})
