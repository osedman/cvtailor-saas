/**
 * Names at shortlist (Ose, 28 Sep 2026): the hiring manager sees a candidate
 * the moment the recruiter shortlists them — names only, under the same
 * right-to-represent and redaction gates a submission has.
 *
 * Behaviour tests pin the rules on the pure shaper; source scans pin the
 * parts a unit test cannot see (the tie check, the columns read, what the
 * route serialises).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import {
  SHOW_NAMES_BEFORE_PERMISSION,
  getShortlisting,
  shapeShortlisting,
  type ShortlistingRow,
} from "@/lib/agency/client-shortlisting"
import { representClientVisibility } from "@/lib/agency/represent"
import type { HiringContext } from "@/lib/agency/types"

// A chainable Supabase stub for getShortlisting's wiring tests: every call is
// recorded, and awaiting a query on a table resolves to that table's fixture.
const mock = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  roles: [] as Array<{ roleId: string; agencyId: string; contactId: string }>,
  shortlist: null as null | { entries: Array<{ ref: string }> },
}))

vi.mock("@/lib/agency/db", () => ({
  agencyAdmin: () => ({
    from(table: string) {
      mock.calls.push({ table, method: "from", args: [] })
      const result = mock.tables[table] ?? { data: [], error: null }
      const builder: Record<string, unknown> = {}
      for (const method of ["select", "eq", "neq", "is", "in", "not", "order"]) {
        builder[method] = (...args: unknown[]) => {
          mock.calls.push({ table, method, args })
          return builder
        }
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      return builder
    },
  }),
  writeAudit: vi.fn(),
}))
vi.mock("@/lib/agency/client-header", () => ({ listClientRoles: vi.fn(async () => mock.roles) }))
vi.mock("@/lib/agency/client-shortlist", () => ({ getClientShortlist: vi.fn(async () => mock.shortlist) }))

const row = (over: Partial<ShortlistingRow> & { ref: string }): ShortlistingRow => ({
  full_name: `Person ${over.ref}`,
  redacted: false,
  represent_status: "agreed",
  added_at: "2026-09-28T10:00:00.000Z",
  ...over,
})

describe("shapeShortlisting — who appears, and as what", () => {
  it("drops a candidate who declined to be represented", () => {
    expect(shapeShortlisting([row({ ref: "CAN-01", represent_status: "declined" })], [])).toEqual([])
  })

  it("drops a candidate who withdrew", () => {
    expect(shapeShortlisting([row({ ref: "CAN-01", represent_status: "withdrawn" })], [])).toEqual([])
  })

  it("drops a declined candidate even when also redacted — never appears at all", () => {
    expect(shapeShortlisting([row({ ref: "CAN-01", represent_status: "declined", redacted: true })], [])).toEqual([])
  })

  it("drops an unknown represent status (fail closed)", () => {
    expect(shapeShortlisting([row({ ref: "CAN-01", represent_status: "maybe" })], [])).toEqual([])
    expect(shapeShortlisting([row({ ref: "CAN-02", represent_status: null })], [])).toEqual([])
  })

  it("redacted + agreed → ref only, asked to be withheld", () => {
    const [e] = shapeShortlisting([row({ ref: "CAN-01", redacted: true, represent_status: "agreed" })], [])
    expect(e).toEqual({ ref: "CAN-01", name: null, withheld: "asked_to_be_withheld", addedAt: "2026-09-28T10:00:00.000Z" })
  })

  it("redacted + unanswered → asked to be withheld (redaction outranks awaiting permission)", () => {
    const [e] = shapeShortlisting([row({ ref: "CAN-01", redacted: true, represent_status: "unanswered" })], [], {
      showNamesBeforePermission: true,
    })
    expect(e.name).toBeNull()
    expect(e.withheld).toBe("asked_to_be_withheld")
  })

  it("unanswered with the switch off → ref only, awaiting permission", () => {
    const [e] = shapeShortlisting([row({ ref: "CAN-01", represent_status: "unanswered" })], [], {
      showNamesBeforePermission: false,
    })
    expect(e).toEqual({ ref: "CAN-01", name: null, withheld: "awaiting_permission", addedAt: "2026-09-28T10:00:00.000Z" })
  })

  it("unanswered with the switch on → full name", () => {
    const [e] = shapeShortlisting([row({ ref: "CAN-01", represent_status: "unanswered" })], [], {
      showNamesBeforePermission: true,
    })
    expect(e.name).toBe("Person CAN-01")
    expect(e.withheld).toBeNull()
  })

  it("unanswered with no option follows SHOW_NAMES_BEFORE_PERMISSION (default: withheld)", () => {
    const [e] = shapeShortlisting([row({ ref: "CAN-01", represent_status: "unanswered" })], [])
    expect(e.withheld).toBe(SHOW_NAMES_BEFORE_PERMISSION ? null : "awaiting_permission")
  })

  it("agreed → full name, nothing withheld", () => {
    const [e] = shapeShortlisting([row({ ref: "CAN-01" })], [])
    expect(e).toEqual({ ref: "CAN-01", name: "Person CAN-01", withheld: null, addedAt: "2026-09-28T10:00:00.000Z" })
  })

  it("leaves refs already in the latest submission to the submission view", () => {
    const out = shapeShortlisting([row({ ref: "CAN-01" }), row({ ref: "CAN-02" }), row({ ref: "CAN-03" })], ["CAN-02"])
    expect(out.map((e) => e.ref)).toEqual(["CAN-01", "CAN-03"])
  })

  it("orders by when they were added, then by ref", () => {
    const out = shapeShortlisting(
      [
        row({ ref: "CAN-03", added_at: "2026-09-28T09:00:00.000Z" }),
        row({ ref: "CAN-02", added_at: "2026-09-28T11:00:00.000Z" }),
        row({ ref: "CAN-01", added_at: "2026-09-28T11:00:00.000Z" }),
        row({ ref: "CAN-04", added_at: "2026-09-27T12:00:00.000Z" }),
      ],
      []
    )
    expect(out.map((e) => e.ref)).toEqual(["CAN-04", "CAN-03", "CAN-01", "CAN-02"])
  })

  it("never carries anything but ref, name, withheld and addedAt", () => {
    const out = shapeShortlisting(
      [{ ...row({ ref: "CAN-01" }), email: "x", id: "uuid", cv_text: "cv" } as unknown as ShortlistingRow],
      []
    )
    expect(Object.keys(out[0]).sort()).toEqual(["addedAt", "name", "ref", "withheld"])
  })
})

describe("representClientVisibility — the represent reading, in represent.ts", () => {
  it("agreed → name; unanswered → awaiting permission unless the switch is on", () => {
    expect(representClientVisibility("agreed", false)).toBe("name")
    expect(representClientVisibility("unanswered", false)).toBe("awaiting_permission")
    expect(representClientVisibility("unanswered", true)).toBe("name")
  })

  it("declined, withdrawn and anything unknown → hidden, whatever the switch", () => {
    for (const status of ["declined", "withdrawn", "maybe", "", null, undefined]) {
      expect(representClientVisibility(status, false), String(status)).toBe("hidden")
      expect(representClientVisibility(status, true), String(status)).toBe("hidden")
    }
  })

  it("client-shortlisting.ts reads the answer only through representClientVisibility", () => {
    const src = tsCode(readFileSync(join(process.cwd(), "lib/agency/client-shortlisting.ts"), "utf8"))
    expect(src).toMatch(/representClientVisibility\(row\.represent_status, showUnanswered\)/)
    expect(src).not.toMatch(/["'](declined|withdrawn|agreed|unanswered)["']/)
  })
})

describe("the switch", () => {
  it("SHOW_NAMES_BEFORE_PERMISSION defaults to false", () => {
    expect(SHOW_NAMES_BEFORE_PERMISSION).toBe(false)
    const src = readFileSync(join(process.cwd(), "lib/agency/client-shortlisting.ts"), "utf8")
    expect(tsCode(src)).toMatch(/export const SHOW_NAMES_BEFORE_PERMISSION = false\b/)
  })
})

describe("getShortlisting — source scan", () => {
  const src = tsCode(readFileSync(join(process.cwd(), "lib/agency/client-shortlisting.ts"), "utf8"))
  const fn = src.slice(src.indexOf("export async function getShortlisting"))
  const select = (fn.match(/\.select\("([^"]*)"\)/) ?? [])[1] ?? ""

  it("resolves the tie exactly as the header route does, and answers null when not theirs", () => {
    expect(fn).toMatch(/\(await listClientRoles\(ctx\)\)\.find\(\(t\) => t\.roleId === roleId\)/)
    expect(fn).toMatch(/if \(!tie\) return null/)
  })

  it("reads the candidates who are shortlisted, joined to the recruiter's decision", () => {
    expect(fn).toMatch(/from\("candidates"\)/)
    expect(select).toMatch(/recruiter_reviews!inner\(/)
    expect(fn).toMatch(/\.eq\("recruiter_reviews\.decision", "shortlist"\)/)
  })

  it("selects names-only columns — no email, CV, storage path, score or evidence", () => {
    expect(select).not.toBe("")
    for (const banned of ["email", "cv_text", "cv_storage_path", "score", "evidence", "phone", "linkedin"]) {
      expect(select, banned).not.toMatch(new RegExp(banned))
    }
    expect(select).not.toMatch(/candidate_id/)
  })

  it("the id is server-only: neither ShortlistingRow nor ShortlistingEntry carries one", () => {
    for (const name of ["ShortlistingRow", "ShortlistingEntry"]) {
      const start = src.indexOf(`export interface ${name}`)
      expect(start, name).toBeGreaterThan(-1)
      const body = src.slice(start, src.indexOf("}", start))
      expect(body, name).not.toMatch(/(^|[\s{;])(id|candidate_id|candidateId)\??:/m)
    }
    // The mapper that builds a ShortlistingRow copies no id across.
    const push = fn.slice(fn.indexOf("rows.push({"), fn.indexOf("})", fn.indexOf("rows.push({")))
    expect(push).not.toMatch(/\bid\b/)
  })

  it("scopes by role_id AND the tie's agency", () => {
    expect(fn).toMatch(/\.eq\("role_id", roleId\)/)
    expect(fn).toMatch(/\.eq\("agency_id", tie\.agencyId\)/)
  })

  it("excludes anyone with a PENDING erasure or objection request, and throws if that read fails", () => {
    const rights = fn.slice(fn.indexOf('from("rights_requests")'))
    expect(fn).toMatch(/from\("rights_requests"\)/)
    expect(rights).toMatch(/\.eq\("agency_id", tie\.agencyId\)/)
    expect(rights).toMatch(/\.eq\("status", "pending"\)/)
    expect(rights).toMatch(/\.in\("kind", \["erasure", "objection"\]\)/)
    expect(rights).toMatch(/\.in\("candidate_id", ids\)/)
    expect(rights).toMatch(/if \(rightsError\) throw rightsError/)
  })

  it("reads the caller's latest submission for the 'added since' cut", () => {
    expect(fn).toMatch(/getClientShortlist\(ctx, roleId\)/)
  })
})

describe("the shortlisting route — source scan", () => {
  const src = tsCode(readFileSync(join(process.cwd(), "app/api/hiring/roles/[roleId]/shortlisting/route.ts"), "utf8"))

  it("authenticates the hiring manager and goes through getShortlisting", () => {
    expect(src).toMatch(/await requireHiringContext\(\)/)
    expect(src).toMatch(/getShortlisting\(auth\.ctx, roleId\)/)
  })

  it("answers 'not found', never 'forbidden', for a role that is not theirs", () => {
    expect(src).toMatch(/\{ error: "Role not found" \}, \{ status: 404/)
    expect(src).not.toMatch(/status: 403[^\n]*Role/)
  })

  it("serialises entries and submitted only — no candidate id", () => {
    expect(src).toMatch(/\{ entries: shortlisting\.entries, submitted: shortlisting\.submitted \}/)
    expect(src).not.toMatch(/candidateId|candidate_id/)
  })

  it("is never cached", () => {
    expect(src).toMatch(/"Cache-Control": "private, no-store"/)
  })
})

describe("getShortlisting — wiring (mocked Supabase)", () => {
  const ctx = { userId: "u1", email: "hm@example.test", links: [] } as unknown as HiringContext
  const tie = { roleId: "role-1", agencyId: "agency-1", contactId: "contact-1" }
  const cand = (id: string, ref: string, review: unknown, over: Record<string, unknown> = {}) => ({
    id,
    ref,
    full_name: `Person ${ref}`,
    redacted: false,
    represent_status: "agreed",
    // A candidate-level timestamp that must NOT be mistaken for when they were added.
    created_at: "2020-01-01T00:00:00.000Z",
    recruiter_reviews: review,
    ...over,
  })
  const review = (decided_at: string) => ({ decision: "shortlist", decided_at })

  beforeEach(() => {
    mock.tables = {}
    mock.calls = []
    mock.roles = [tie]
    mock.shortlist = null
  })

  it("no tie → null, and never reads candidates", async () => {
    mock.roles = []
    expect(await getShortlisting(ctx, "role-1")).toBeNull()
    expect(mock.calls.some((c) => c.table === "candidates")).toBe(false)
  })

  it("a tie on another role → null", async () => {
    mock.roles = [{ ...tie, roleId: "role-2" }]
    expect(await getShortlisting(ctx, "role-1")).toBeNull()
    expect(mock.calls.some((c) => c.table === "candidates")).toBe(false)
  })

  it("scopes the candidates read by the role and the tie's agency", async () => {
    await getShortlisting(ctx, "role-1")
    const eqs = mock.calls.filter((c) => c.table === "candidates" && c.method === "eq").map((c) => c.args)
    expect(eqs).toContainEqual(["role_id", "role-1"])
    expect(eqs).toContainEqual(["agency_id", "agency-1"])
    expect(eqs).toContainEqual(["recruiter_reviews.decision", "shortlist"])
  })

  it("drops refs in the latest submission and says a submission exists", async () => {
    mock.tables.candidates = {
      data: [cand("c1", "CAN-01", review("2026-09-28T09:00:00.000Z")), cand("c2", "CAN-02", review("2026-09-28T10:00:00.000Z"))],
      error: null,
    }
    mock.shortlist = { entries: [{ ref: "CAN-02" }] }
    const out = await getShortlisting(ctx, "role-1")
    expect(out?.submitted).toBe(true)
    expect(out?.entries.map((e) => e.ref)).toEqual(["CAN-01"])
  })

  it("no submission → submitted false, nothing dropped", async () => {
    mock.tables.candidates = {
      data: [cand("c1", "CAN-01", review("2026-09-28T09:00:00.000Z")), cand("c2", "CAN-02", review("2026-09-28T10:00:00.000Z"))],
      error: null,
    }
    const out = await getShortlisting(ctx, "role-1")
    expect(out?.submitted).toBe(false)
    expect(out?.entries.map((e) => e.ref)).toEqual(["CAN-01", "CAN-02"])
  })

  it("addedAt is the review's decided_at, whether the embed is an object or a one-element array", async () => {
    mock.tables.candidates = {
      data: [
        cand("c1", "CAN-01", review("2026-09-28T09:00:00.000Z")),
        cand("c2", "CAN-02", [review("2026-09-28T10:00:00.000Z")]),
      ],
      error: null,
    }
    const out = await getShortlisting(ctx, "role-1")
    expect(out?.entries).toEqual([
      { ref: "CAN-01", name: "Person CAN-01", withheld: null, addedAt: "2026-09-28T09:00:00.000Z" },
      { ref: "CAN-02", name: "Person CAN-02", withheld: null, addedAt: "2026-09-28T10:00:00.000Z" },
    ])
  })

  it("a failed candidates read rejects rather than reading as 'nobody shortlisted'", async () => {
    mock.tables.candidates = { data: null, error: new Error("boom") }
    await expect(getShortlisting(ctx, "role-1")).rejects.toThrow("boom")
  })

  it("a pending erasure or objection request removes the candidate at once", async () => {
    mock.tables.candidates = {
      data: [cand("c1", "CAN-01", review("2026-09-28T09:00:00.000Z")), cand("c4", "CAN-04", review("2026-09-28T10:00:00.000Z"))],
      error: null,
    }
    mock.tables.rights_requests = { data: [{ candidate_id: "c4" }], error: null }
    const out = await getShortlisting(ctx, "role-1")
    expect(out?.entries.map((e) => e.ref)).toEqual(["CAN-01"])
    const rights = mock.calls.filter((c) => c.table === "rights_requests")
    expect(rights.map((c) => [c.method, ...c.args])).toEqual(
      expect.arrayContaining([
        ["eq", "agency_id", "agency-1"],
        ["eq", "status", "pending"],
        ["in", "kind", ["erasure", "objection"]],
        ["in", "candidate_id", ["c1", "c4"]],
      ])
    )
  })

  it("a failed rights-request read rejects — never names someone who may have asked to be erased", async () => {
    mock.tables.candidates = { data: [cand("c1", "CAN-01", review("2026-09-28T09:00:00.000Z"))], error: null }
    mock.tables.rights_requests = { data: null, error: new Error("rights down") }
    await expect(getShortlisting(ctx, "role-1")).rejects.toThrow("rights down")
  })

  it("the candidate id never reaches an entry", async () => {
    mock.tables.candidates = { data: [cand("cand-uuid-7f3a", "CAN-01", review("2026-09-28T09:00:00.000Z"))], error: null }
    const out = await getShortlisting(ctx, "role-1")
    expect(out?.entries).toHaveLength(1)
    expect(JSON.stringify(out)).not.toContain("cand-uuid-7f3a")
  })
})
