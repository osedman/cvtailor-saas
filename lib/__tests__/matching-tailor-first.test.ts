/**
 * Tailor-first apply — the tailored CV crossing the wall instead of the
 * evidence-bank render.
 *
 * Same split as matching-apply.test.ts: pure functions on values, structural
 * promises as source scans. The properties that matter here: role mode
 * tailors against the FROZEN snapshot (never a client textarea), the link is
 * service-role-written and ownership-proven on both ends, the tailored CV is
 * honoured only while its hash still matches the snapshot, and it REPLACES
 * the bank render — never both.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { renderSnapshotJd } from "@/lib/matching/tailor-brief"
import { joinFound } from "@/lib/matching/found"
import { CONSENT_COPY_VERSION } from "@/lib/matching/limits"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SNAPSHOT = {
  title: "Senior Business Analyst",
  company: "Meridian Health",
  agency_name: "Halcyon Search",
  role_ref: "ROL-2403",
  seniority: "Senior",
  location: "Hybrid · Leeds",
  salary_band: "£85–95k",
  summary: "Own the analysis practice.",
  requirements: [
    { ref: "R01", text: "Stakeholder management", weight: "must" as const },
    { ref: "R02", text: "SQL", weight: "nice" as const },
  ],
}

describe("renderSnapshotJd", () => {
  it("is deterministic — the brief takes part in the tailor cache key", () => {
    expect(renderSnapshotJd(SNAPSHOT)).toBe(renderSnapshotJd({ ...SNAPSHOT }))
  })

  it("carries the requirements with their weights spelled out", () => {
    const jd = renderSnapshotJd(SNAPSHOT)
    expect(jd).toContain("[Must have] Stakeholder management")
    expect(jd).toContain("[Nice to have] SQL")
    expect(jd).toContain("Senior Business Analyst")
    expect(jd).toContain("Meridian Health")
  })

  it("omits an empty summary rather than rendering a blank block", () => {
    const jd = renderSnapshotJd({ ...SNAPSHOT, summary: "  " })
    expect(jd).not.toMatch(/\n\n\n/)
  })
})

describe("joinFound · the tailored flag", () => {
  const rec = {
    id: "rec-1",
    published_role_id: "pub-1",
    state: "seen",
    score: "56.97",
    created_at: "2026-08-16T10:00:00Z",
    evidence: [],
    tailor_history_id: "hist-1",
    tailored_against_hash: "hash-a",
  }
  const role = {
    id: "pub-1",
    title: "T",
    company: "C",
    agency_name: "A",
    location: "",
    salary_band: "",
    seniority: "",
    summary: "",
    status: "live",
    requirements: [],
    requirements_hash: "hash-a",
  }
  const savedAt = new Map([["hist-1", "2026-08-16T11:00:00Z"]])

  it("shows tailored while the hash still matches", () => {
    const [f] = joinFound([rec], [role], savedAt)
    expect(f.tailored).toEqual({ savedAt: "2026-08-16T11:00:00Z" })
  })

  it("a republished role (hash changed) honestly reverts to not-tailored", () => {
    const [f] = joinFound([rec], [{ ...role, requirements_hash: "hash-b" }], savedAt)
    expect(f.tailored).toBeNull()
  })

  it("a deleted tailor_history row reads as never-tailored, not as an error", () => {
    const [f] = joinFound([rec], [role], new Map())
    expect(f.tailored).toBeNull()
  })
})

describe("what tailor-first must never do", () => {
  const applyLib = read("lib/matching/apply.ts")
  const tailorRoute = read("app/api/tailor/route.ts")
  const briefRoute = read("app/api/found/[id]/tailor-brief/route.ts")
  const migration = read("supabase/migrations/20260816160000_tailor_first_apply.sql")

  it("role mode uses the server-rendered frozen brief, never the client's JD", () => {
    expect(tailorRoute).toMatch(/jobDescription = brief\.jd/)
  })

  it("the link write is scoped to the caller on both sides", () => {
    // Service role bypasses RLS, so the update must name the user itself.
    const link = tailorRoute.slice(tailorRoute.indexOf("function linkRecommendation"))
    expect(link).toMatch(/\.eq\('user_id', userId\)/)
  })

  it("apply honours the tailored CV only while its hash matches the snapshot", () => {
    expect(applyLib).toMatch(/rec\.tailored_against_hash === snapshot\.requirements_hash/)
  })

  it("apply re-proves the history row's owner rather than trusting the link", () => {
    const tailoredBlock = applyLib.slice(applyLib.indexOf("wantTailored"))
    expect(tailoredBlock).toMatch(/\.eq\("user_id", userId\)/)
  })

  it("the tailored CV replaces the bank render — never both", () => {
    expect(applyLib).toMatch(/tailoredCv \|\| bankText/)
  })

  it("deleting your tailor history can never break a recommendation", () => {
    expect(migration).toMatch(/on delete set null/)
  })

  it("the brief route is read-only — entering role mode shares nothing", () => {
    expect(briefRoute).toMatch(/export async function GET/)
    expect(briefRoute).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/)
  })

  it("the consent copy version moved with the sheet's changed line", () => {
    // The sheet now names the tailored CV as what crosses; that is a change
    // in what is being agreed to. Reverting the version without reverting
    // the copy would misdate every new consent event.
    // Moved again on 5 Sep 2026 for the third switch; what this pins is
    // that it never goes back before the tailor-first wording.
    expect(CONSENT_COPY_VERSION >= "matching-2026-08-16").toBe(true)
    expect(CONSENT_COPY_VERSION).toMatch(/^matching-\d{4}-\d{2}-\d{2}$/)
  })
})
