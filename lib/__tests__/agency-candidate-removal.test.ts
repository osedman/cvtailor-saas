/**
 * Removing a candidate added in error.
 *
 * Ose's walk-through, 22 Aug: a CV goes to the wrong role or the wrong file
 * gets picked, and there was no way back — the person stayed on the role, in
 * the count, and on their way to a notice telling them they were being
 * considered for something nobody meant to consider them for.
 *
 * THE REASON IS THE WHOLE DESIGN. purge_candidate also writes a
 * notice_suppression when the reason is 'erasure_request' or 'objection',
 * which blocks that identity from ever being processed by this agency again.
 * Correct when the PERSON asked. Catastrophic when the RECRUITER mis-clicked
 * — it would quietly blacklist somebody for a mistake that was not theirs.
 * So removal passes 'added_in_error', and this test is what keeps it there.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import path from "path"
import { tsCode, sqlCode } from "./helpers/source-scan"

const route = readFileSync(
  path.join(process.cwd(), "app/api/agency/roles/[roleId]/candidates/route.ts"),
  "utf8"
)
const DELETE = route.slice(route.indexOf("export async function DELETE"))
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260805160000_agency_retention.sql"),
  "utf8"
)

describe("removing a candidate", () => {
  it("erases through the one implementation, never a soft delete", () => {
    // A soft delete leaves somebody's CV in an agency's database because a
    // recruiter mis-clicked.
    expect(DELETE).toContain('rpc("purge_candidate"')
    expect(DELETE).not.toMatch(/\.update\(\{[^}]*deleted/)
    expect(DELETE).not.toMatch(/hidden|archived/i)
  })

  it("passes a reason that does NOT suppress the person", () => {
    // Assert the CALL, not the file: the doc comment legitimately names the
    // suppressing reasons while explaining why they are excluded, and a scan
    // that cannot tell prose from code would fail on its own explanation.
    // Comments stripped: the call carries an inline note explaining WHY the
    // suppressing reasons are excluded, and a raw scan fails on it.
    const code = tsCode(DELETE)
    const call = code.slice(code.indexOf('rpc("purge_candidate"'))
    const args = call.slice(0, call.indexOf("})"))
    expect(args).toContain('p_reason: "added_in_error"')
    expect(args).not.toContain("erasure_request")
    expect(args).not.toContain("objection")
  })

  it("and the database agrees those are the suppressing reasons", () => {
    // Pinned against the migration so the test cannot drift from the rule it
    // is protecting: if purge_candidate ever starts suppressing on more
    // reasons, this fails and someone re-reads the route.
    const sql = sqlCode(migration)
    const fn = sql.slice(sql.indexOf("create or replace function agency.purge_candidate"))
    const body = fn.slice(0, fn.indexOf("$$;"))
    const guard = body.slice(body.indexOf("if p_reason in ("))
    const line = guard.slice(0, guard.indexOf(")"))
    expect(line).toContain("erasure_request")
    expect(line).toContain("objection")
    expect(line).not.toContain("added_in_error")
  })

  it("removes the CV blob too, and says so loudly if that fails", () => {
    // A row gone with its blob left behind is a CV nobody can see and nobody
    // will ever delete.
    expect(DELETE).toMatch(/storage[\s\S]{0,40}\.from\("agency-cvs"\)[\s\S]{0,60}\.remove\(/)
    expect(DELETE).toMatch(/console\.error\([\s\S]{0,40}storage removal failed/)
  })

  it("refuses once the candidate has been told they are being considered", () => {
    expect(DELETE).toContain('notice?.status === "sent"')
    expect(DELETE).toMatch(/status: 409/)
    // And the refusal tells the recruiter what to do instead.
    expect(DELETE).toContain("decline them on the role instead")
  })

  it("is scoped to the caller's agency AND this role", () => {
    expect(DELETE).toContain("candidate.agency_id !== auth.ctx.agencyId")
    expect(DELETE).toContain("candidate.role_id !== roleId")
  })

  it("viewers cannot remove anyone", () => {
    expect(DELETE).toContain('auth.ctx.role === "viewer"')
  })
})
