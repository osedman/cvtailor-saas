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

  it("goes through the shared projection: tie check first, then the header", () => {
    // The four-table tie and the shortlist coarsening live in
    // lib/agency/client-header.ts (pinned in agency-today-routes.test.ts) so
    // the header and Today cannot fork. The route must not reach the facts
    // any other way.
    expect(src).toMatch(/listClientRoles\(auth\.ctx\)/)
    expect(src).toMatch(/getClientRoleHeader\(auth\.ctx, tie\)/)
    expect(src).not.toMatch(/getRoleFacts\(/)
  })

  it("answers 'not found', never 'forbidden', for a role that is not theirs", () => {
    expect(src).not.toMatch(/status: 403[^\n]*Role/)
    expect((src.match(/"Role not found"/g) ?? []).length).toBeGreaterThanOrEqual(2)
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
    expect(src).toMatch(/from\("profiles"\)\.select\("id, full_name"\)/)
    expect(src).not.toMatch(/profile\?\.email/)
    expect(src).not.toMatch(/full_name.*\|\|.*email/)
  })

  it("reads every table once, batched, never once per role", () => {
    // It used to call listRoundsForRole / listOpenSlots per role, which was
    // right for one role and catastrophic for a queue of them: the dashboard
    // ran several hundred queries before it could paint (reported 10 Sep
    // 2026). Batching means those two reads are now inlined here with an
    // `in (…)`, which is a deliberate copy of their queries — the trade is
    // recorded, and this pins the half that must not regress.
    expect(src).toMatch(/export async function getRoleFactsBatch/)
    expect(src).toMatch(/\.in\("role_id", liveIds\)/)
    // The single-role entry point must stay a call into the batch, so there
    // is one assembler and the header cannot disagree with the queue.
    expect(src).toMatch(/getRoleFactsBatch\(ctx, \[roleId\], now\)/)
    // No per-role loop anywhere in the file.
    expect(src).not.toMatch(/for \([^)]*roleIds\)[\s\S]{0,120}await getRoleFacts\(/)
  })

  it("derives the phase from the same two facts as everywhere else", () => {
    expect(src).toMatch(/derivePhase\(\{ hasSubmission: !!submission, hasHandoverPack: !!firstPack\.get\(roleId\) \}\)/)
  })

  it("counts client signals by ref, which survives purge", () => {
    expect(src).toMatch(/candidate_ref, action, created_at/)
    expect(src).toMatch(/a\.action === "interview" \|\| a\.action === "approve"/)
  })
})
