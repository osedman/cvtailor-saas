/**
 * What the hiring manager's shortlist is allowed to show.
 *
 * 20 Sep 2026. The workspace shortlist promised "everyone your recruiter has
 * put in front of you, with the evidence behind each" and rendered a name, a
 * title and one sentence — the same sentence under every candidate. The
 * evidence was never missing from the record: the submission snapshot has
 * carried scores, strengths, gaps, probe areas and the recruiter's screening
 * narrative since it was built. The workspace mapper simply dropped them,
 * while the portal rendered the same fields from the same snapshot.
 *
 * Widening what a screen shows about a candidate is a disclosure change, so
 * the rule it has to obey is the one already written into the product: the
 * switches FREEZE into the snapshot at generation, and applying today's
 * switches to yesterday's submission is exactly what an immutable snapshot
 * exists to prevent.
 *
 * `notes` defaults to OFF. The other four default on. A recruiter who never
 * turned notes on must not have their private screening narrative appear on
 * the client's screen because a later release decided it would be useful.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { recipients, actions } = vi.hoisted(() => ({
  recipients: vi.fn(),
  actions: vi.fn(),
}))

/**
 * The mock implements the filters it is handed rather than ignoring them —
 * a mock that answers the same way whatever it is asked agrees with wrong
 * code, which is how two real bugs shipped green on this repo before.
 */
vi.mock("@/lib/agency/db", () => {
  const chain = (resolve: () => unknown) => {
    const thenable: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "is", "order", "limit", "not"]) {
      thenable[m] = () => thenable
    }
    thenable.then = (res: (v: unknown) => unknown) => Promise.resolve(resolve()).then(res)
    thenable.maybeSingle = () => Promise.resolve(resolve())
    return thenable
  }
  return {
    agencyAdmin: () => ({
      from: (table: string) => chain(() => (table === "submission_recipients" ? recipients() : actions())),
    }),
    writeAudit: vi.fn(),
  }
})
vi.mock("@/lib/agency/rounds", () => ({ offerSlot: vi.fn() }))

import { getClientShortlist } from "@/lib/agency/client-shortlist"

const ctx = {
  userId: "u1",
  email: "hm@example.com",
  links: [{ contactId: "c1", agencyId: "a1" }],
} as never

/** One snapshot entry carrying every disclosable field. */
const entry = {
  ref: "CAN-12",
  full_name: "A Candidate",
  current_title: "Lead Data Engineer",
  years: 9,
  location: "London",
  redacted: false,
  overall: 97,
  must_have_hit: 5,
  must_have_total: 5,
  narrative: "Built the dbt layer from scratch at Nuffield, not inherited.",
  strengths: [{ requirement: "Python, five years or more", quote: "Ten years of Python." }],
  gaps: [{ requirement: "Infrastructure as code", weight: "must" }],
  probe_areas: ["How much hands-on delivery versus management?"],
}

function withSnapshot(disclosure: Record<string, boolean> | undefined) {
  recipients.mockReturnValue({
    data: [{
      id: "r1",
      agency_id: "a1",
      contact_id: "c1",
      submission_id: "s1",
      revoked_at: null,
      submissions: {
        id: "s1",
        role_id: "role1",
        generated_at: "2026-09-19T10:00:00Z",
        snapshot: { intro: "Here are the three.", disclosure, shortlisted: [entry] },
      },
    }],
    error: null,
  })
}

beforeEach(() => {
  recipients.mockReset()
  actions.mockReset()
  actions.mockReturnValue({ data: [], error: null })
})

describe("with every switch on", () => {
  it("shows the note, the coverage and the evidence", async () => {
    withSnapshot({ scores: true, evidence: true, probes: true, notes: true, logistics: true })
    const list = await getClientShortlist(ctx, "role1")
    const e = list!.entries[0]
    expect(e.narrative).toContain("Built the dbt layer")
    expect(e.mustHaveHit).toBe(5)
    expect(e.mustHaveTotal).toBe(5)
    expect(e.overall).toBe(97)
    expect(e.strengths?.[0].quote).toBe("Ten years of Python.")
    expect(e.gaps?.[0].requirement).toBe("Infrastructure as code")
    expect(e.probeAreas?.[0]).toContain("hands-on delivery")
  })
})

describe("a withheld note never leaks", () => {
  it("is null when notes are off, even though the snapshot holds it", async () => {
    withSnapshot({ scores: true, evidence: true, probes: true, notes: false, logistics: true })
    const list = await getClientShortlist(ctx, "role1")
    expect(list!.entries[0].narrative).toBeNull()
    // Everything else still comes through: this is a switch, not a blackout.
    expect(list!.entries[0].mustHaveHit).toBe(5)
    expect(list!.disclosure.notes).toBe(false)
  })

  it("defaults to OFF when the snapshot names no switches at all", async () => {
    // An older submission predates the switches. The builder's own defaults
    // are the honest reading of what that recruiter intended.
    withSnapshot(undefined)
    const list = await getClientShortlist(ctx, "role1")
    expect(list!.disclosure.notes).toBe(false)
    expect(list!.entries[0].narrative).toBeNull()
    expect(list!.disclosure.scores).toBe(true)
    expect(list!.entries[0].overall).toBe(97)
  })

  it("does not leak the note through any other field", async () => {
    withSnapshot({ scores: true, evidence: true, probes: true, notes: false, logistics: true })
    const list = await getClientShortlist(ctx, "role1")
    const serialised = JSON.stringify(list)
    expect(serialised).not.toContain("Built the dbt layer")
    expect(serialised).not.toContain("Nuffield")
  })
})

describe("the other switches are honoured one by one", () => {
  it("withholds scores without touching the evidence", async () => {
    withSnapshot({ scores: false, evidence: true, probes: true, notes: true, logistics: true })
    const list = await getClientShortlist(ctx, "role1")
    const e = list!.entries[0]
    expect(e.overall).toBeNull()
    expect(e.mustHaveHit).toBeNull()
    expect(e.mustHaveTotal).toBeNull()
    expect(e.strengths).toHaveLength(1)
  })

  it("withholds evidence and gaps together — a gap IS evidence", async () => {
    withSnapshot({ scores: true, evidence: false, probes: true, notes: true, logistics: true })
    const list = await getClientShortlist(ctx, "role1")
    expect(list!.entries[0].strengths).toBeNull()
    expect(list!.entries[0].gaps).toBeNull()
  })

  it("withholds probe areas", async () => {
    withSnapshot({ scores: true, evidence: true, probes: false, notes: true, logistics: true })
    const list = await getClientShortlist(ctx, "role1")
    expect(list!.entries[0].probeAreas).toBeNull()
  })
})

describe("the screen tells the truth about withholding", () => {
  it("says the notes are not part of the submission rather than implying none exist", async () => {
    const { readFileSync } = await import("fs")
    const { join } = await import("path")
    const src = readFileSync(join(process.cwd(), "app/hiring/shortlist/page.tsx"), "utf8")
    // Withheld is not the same as absent, and the wording must not blame the
    // recruiter for writing nothing.
    expect(src).toContain("not part of this submission")
    expect(src).not.toMatch(/your recruiter (wrote|left) no notes/i)
  })
})
