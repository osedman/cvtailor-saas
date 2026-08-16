/**
 * Applying — the one moment quiet matching shares anything.
 *
 * The pure mapper is tested on values; the wall properties are source scans
 * over the route, the lib and the RPC migration, because the failure modes
 * that matter are structural: a notice that should not exist, a limit that
 * would auto-reject, a payload trusted from a client.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { buildAgencyEvidence } from "@/lib/matching/apply"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const REQS = [
  { id: "id-1", ref: "R01", text: "Stakeholders", weight: "must" as const },
  { id: "id-2", ref: "R02", text: "SQL", weight: "nice" as const },
]

describe("buildAgencyEvidence", () => {
  it("maps refs onto live requirement ids", () => {
    const rows = buildAgencyEvidence(REQS, [
      { requirement_ref: "R01", strength: "strong", quote: "Ran the workshops" },
    ])
    expect(rows[0]).toMatchObject({ requirement_id: "id-1", strength: "strong", quote: "Ran the workshops" })
  })

  it("a requirement with no entry is missing — never invented", () => {
    const rows = buildAgencyEvidence(REQS, [])
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row).toMatchObject({ strength: "missing", quote: null })
  })

  it("missing carries a null quote and empty cite, satisfying both DB constraints", () => {
    const rows = buildAgencyEvidence(REQS, [
      { requirement_ref: "R01", strength: "strong", quote: "   " },
    ])
    expect(rows[0]).toMatchObject({ strength: "missing", quote: null, source_cite: "" })
  })

  it("caps quotes at the DB's 1000 characters", () => {
    const rows = buildAgencyEvidence(REQS, [
      { requirement_ref: "R01", strength: "partial", quote: "x".repeat(3000) },
    ])
    expect(rows[0].quote).toHaveLength(1000)
  })
})

describe("what the apply path must never do", () => {
  const migration = read("supabase/migrations/20260816120000_apply_matched.sql")
  const lib = read("lib/matching/apply.ts")
  const route = read("app/api/found/[id]/apply/route.ts")

  it("no Art 14 notice — the manifest IS the notice", () => {
    // The RPC must not insert candidate_notices: matched applicants get
    // Art 13 at the moment of applying, and a delayed second notice would
    // tell them about a share they themselves performed.
    const body = migration.slice(migration.indexOf("create or replace function"))
    expect(body).not.toMatch(/candidate_notices/)
  })

  it("no candidate limit — arithmetic must not auto-reject the eleventh applicant", () => {
    // The header COMMENT names the constant to explain why it is absent, so
    // this checks for code usage — an import or a comparison — not the word.
    expect(lib).not.toMatch(/import[^\n]*MAX_CANDIDATES_PER_ROLE/)
    expect(lib).not.toMatch(/MAX_CANDIDATES_PER_ROLE\s*[<>=)]/)
  })

  it("no model call — what they confirmed is what crosses", () => {
    expect(lib).not.toMatch(/extractAssessment|anthropic/)
  })

  it("suppression is an audited override, not a block", () => {
    expect(migration).toMatch(/suppression_overridden_by_application/)
    // And the RPC must not RAISE on suppression.
    const suppressed = migration.slice(migration.indexOf("v_suppressed := false"))
    const block = suppressed.slice(0, suppressed.indexOf("return jsonb_build_object"))
    expect(block).not.toMatch(/raise exception.*suppress/i)
  })

  it("the claim comes first and a settled state aborts everything", () => {
    const claimAt = migration.indexOf("set state = 'applied'")
    const consentAt = migration.indexOf("insert into public.matching_consent_events")
    const candidateAt = migration.indexOf("insert into agency.candidates")
    expect(claimAt).toBeGreaterThan(-1)
    expect(claimAt).toBeLessThan(consentAt)
    expect(consentAt).toBeLessThan(candidateAt)
    expect(migration).toMatch(/already settled/)
  })

  it("evidence crosses with origin 'matched', not 'tailr_profile'", () => {
    // Different consent, different word — the audit trail must tell
    // enrichment and self-application apart.
    expect(migration).toMatch(/'matched'\)/)
    const fn = migration.slice(migration.indexOf("create or replace function"))
    expect(fn).not.toMatch(/'tailr_profile'/)
  })

  it("the RPC is service-role only", () => {
    expect(migration).toMatch(/revoke all on function public\.apply_matched_recommendation[\s\S]*from public, anon, authenticated/)
    expect(migration).toMatch(/grant execute on function public\.apply_matched_recommendation[\s\S]*to service_role/)
  })

  it("the POST accepts no body fields — the server recomputes the payload", () => {
    const post = route.slice(route.indexOf("export async function POST"))
    expect(post).not.toMatch(/req\.json\(\)/)
  })

  it("staleness refuses rather than remapping", () => {
    expect(lib).toMatch(/requirementsHash\(requirements\) !== snapshot\.requirements_hash/)
    expect(route).toMatch(/stale/)
  })

  it("someone else's recommendation reads as not found, not forbidden", () => {
    // Its existence is itself information.
    expect(lib).toMatch(/rec\.user_id !== userId\) return \{ failure: "not_found" as const \}/)
  })
})
