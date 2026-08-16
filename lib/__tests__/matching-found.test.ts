/**
 * "A role found you" — the join, the transitions, and the promises.
 *
 * The page's copy is load-bearing: every line is a promise the schema keeps,
 * so a test pins each one. The join is pure and tested on values. The
 * transitions are pinned at the type level AND the validation level, because
 * 'applied' arriving through this surface would be a state claiming a bundle
 * crossed the wall when none did.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { joinFound } from "@/lib/matching/found"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const ROLE = {
  id: "pr-1",
  title: "Senior Business Analyst",
  company: "Meridian Health",
  agency_name: "RLS Test Alpha",
  location: "Leeds",
  salary_band: "£70k",
  seniority: "Senior",
  summary: "A summary.",
  status: "live",
  requirements: [
    { ref: "R01", text: "Stakeholders", weight: "must" as const },
    { ref: "R02", text: "SQL", weight: "nice" as const },
  ],
}

function rec(partial: Record<string, unknown> = {}) {
  return {
    id: "rec-1",
    published_role_id: "pr-1",
    state: "new",
    score: "56.97",
    created_at: "2026-08-16T03:25:12Z",
    evidence: [{ requirement_ref: "R01", strength: "strong", quote: "Ran the workshops" }],
    ...partial,
  }
}

describe("joinFound", () => {
  it("lays the evidence over the snapshot's requirements, in snapshot order", () => {
    const [out] = joinFound([rec()], [ROLE])
    expect(out.requirements.map((r) => r.ref)).toEqual(["R01", "R02"])
    expect(out.requirements[0]).toMatchObject({ strength: "strong", quote: "Ran the workshops" })
  })

  it("renders a requirement the evidence map lacks as missing — never invented", () => {
    const [out] = joinFound([rec()], [ROLE])
    expect(out.requirements[1]).toMatchObject({ ref: "R02", strength: "missing", quote: null })
  })

  it("demotes a strength whose quote is empty", () => {
    const [out] = joinFound(
      [rec({ evidence: [{ requirement_ref: "R01", strength: "strong", quote: "  " }] })],
      [ROLE]
    )
    expect(out.requirements[0].strength).toBe("missing")
  })

  it("parses the numeric score Postgres returns as a string", () => {
    const [out] = joinFound([rec()], [ROLE])
    expect(out.score).toBeCloseTo(56.97)
  })

  it("never renders a recommendation whose snapshot is not visible", () => {
    // RLS should make this impossible; if it happens anyway, a half-empty
    // card would hide the policy bug.
    expect(joinFound([rec({ published_role_id: "other" })], [ROLE])).toEqual([])
  })

  it("sinks dismissed below open, newest first within each", () => {
    const out = joinFound(
      [
        rec({ id: "a", state: "dismissed", created_at: "2026-08-16T09:00:00Z" }),
        rec({ id: "b", created_at: "2026-08-15T09:00:00Z" }),
        rec({ id: "c", created_at: "2026-08-16T08:00:00Z" }),
      ],
      [ROLE]
    )
    expect(out.map((o) => o.id)).toEqual(["c", "b", "a"])
  })
})

describe("the transitions this surface may make", () => {
  it("the lib refuses to know about 'applied'", () => {
    const lib = read("lib/matching/found.ts")
    expect(lib).toMatch(/FoundTransition = "seen" \| "dismissed"/)
  })

  it("the PATCH route whitelists, and 'applied' is not on the list", () => {
    const route = read("app/api/found/[id]/route.ts")
    expect(route).toMatch(/ALLOWED: FoundTransition\[\] = \["seen", "dismissed"\]/)
    expect(route).not.toMatch(/"applied"/)
  })

  it("seen only lifts new; neither transition touches settled rows", () => {
    const lib = read("lib/matching/found.ts")
    expect(lib).toMatch(/to === "seen" \? \["new"\] : \["new", "seen"\]/)
  })

  it("reads run on the user-scoped client, so RLS is load-bearing", () => {
    const lib = read("lib/matching/found.ts")
    expect(lib).not.toMatch(/createAdminClient|agencyAdmin|service_role/)
  })
})

describe("the page keeps the frame's promises", () => {
  const page = read("app/found/page.tsx")

  it("a recommendation, not a listing", () => {
    expect(page).toMatch(/a recommendation, not a listing/)
  })

  it("nothing is shared unless you apply", () => {
    expect(page).toMatch(/nothing is shared unless you apply/)
  })

  it("dismissing shares nothing, and settings is one link away", () => {
    expect(page).toMatch(/Dismissing shares nothing/)
    expect(page).toMatch(/href="\/settings"/)
  })

  it("the score is named as the before-tailoring number", () => {
    // Same meaning as the recruiter's threshold — unreviewed, un-overridden.
    expect(page).toMatch(/match before tailoring/)
  })

  it("missing renders explicitly, never papered over", () => {
    expect(page).toMatch(/MISSING — nothing in your bank for this yet/)
  })

  it("tailor-first is live: role mode entered by link, no disabled placeholder", () => {
    // Built 16 Aug (Figma "Tailor-first apply — changed surfaces"). The old
    // disabled-with-reason placeholder must not linger anywhere.
    expect(page).toMatch(/\/tailor\?rec=\$\{active\.id\}/)
    expect(page).not.toMatch(/title="Not built yet/)
    expect(page).toMatch(/Apply with my evidence/)
  })

  it("the band flips on a tailored CV, and the sheet names what crosses", () => {
    // Two states, one truth: the tailored CV replaces the bank render, and
    // the flip is driven by active.tailored — which the server sets only
    // while the tailored-against hash still matches the snapshot.
    expect(page).toMatch(/active\.tailored \?/)
    expect(page).toMatch(/Apply — send your tailored CV/)
    expect(page).toMatch(/cvSource === "tailored"/)
    expect(page).toMatch(/exactly as you last saved it/)
  })

  it("the confirm button names the agency, not a generic Apply", () => {
    // Frame decision: "Send this to Halcyon Search", never "Apply".
    expect(page).toMatch(/Send this to \{manifest\.sharedWith\}/)
  })

  it("the apply POST carries no body — the server recomputes everything", () => {
    expect(page).toMatch(/\{ method: "POST" \}/)
  })

  it("an applied recommendation cannot be dismissed or re-applied", () => {
    expect(page).toMatch(/active\.state !== "applied" && \(/)
    expect(page).toMatch(/active\.state === "applied" && \(/)
  })

  it("a closed role loses the apply path and says why", () => {
    expect(page).toMatch(/\{isLive && active\.state !== "applied" && \(/)
    expect(page).toMatch(/This role has closed\. Your record of it stays yours\./)
  })

  it("a failed load is not an empty one", () => {
    expect(page).toMatch(/role="alert"/)
    expect(page).toMatch(/Try again/)
  })

  it("the empty state distinguishes opted-out from nothing-yet", () => {
    expect(page).toMatch(/Matching is off, so no role can find you/)
    expect(page).toMatch(/Matching is on\. When a live role scores/)
  })
})

describe("the header pill", () => {
  const header = read("components/cv-tailor/header.tsx")

  it("renders only when something is actually there", () => {
    expect(header).toMatch(/foundOpen > 0 && \(/)
  })

  it("fetches counts only, never content", () => {
    expect(header).toMatch(/\/api\/found\/summary/)
    const summary = read("app/api/found/summary/route.ts")
    expect(summary).not.toMatch(/published_roles|evidence|title/)
  })
})
