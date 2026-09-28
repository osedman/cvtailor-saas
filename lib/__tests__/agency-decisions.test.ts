/**
 * The recruiter's shortlist decision, single and bulk.
 *
 * Board 26 (step 05 redesign, signed off 24 Sep 2026) added "add in one go"
 * chips and per-group adds on the recommendation tab. Those need a bulk
 * route, and a bulk route is the moment two copies of "what a decision
 * means" appear and drift. So both routes call ONE function,
 * applyDecision in lib/agency/decisions.ts, and this file holds that line:
 *
 *   1. The body parser is pure and refuses anything it should.
 *   2. applyDecision writes the same row and the same audit entry the single
 *      route always wrote, returns the previous value, and refuses viewers,
 *      other agencies' people and other roles' people.
 *   3. Both routes import it; neither writes recruiter_reviews itself; the
 *      bulk route is writer-only, scoped by role AND agency, and capped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "fs"
import path from "path"
import { tsCode } from "./helpers/source-scan"

const admin = vi.hoisted(() => ({ from: vi.fn() }))
const writeAudit = vi.hoisted(() => vi.fn())
const requireAgencyContext = vi.hoisted(() => vi.fn())

vi.mock("@/lib/agency/db", async () => {
  const actual = await vi.importActual<typeof import("../agency/db")>("../agency/db")
  return {
    ...actual,
    agencyAdmin: () => admin,
    writeAudit,
    requireAgencyContext,
  }
})

import {
  MAX_BULK_DECISIONS,
  RECRUITER_DECISIONS,
  applyDecision,
  loadPreviousDecisions,
  parseBulkDecisions,
  parseDecision,
} from "../agency/decisions"
import { AgencyAccessError } from "../agency/db"
import type { AgencyContext } from "../agency/types"
import type { NextRequest } from "next/server"
import { PATCH as bulkPatch } from "../../app/api/agency/roles/[roleId]/decisions/route"

const REC: AgencyContext = { agencyId: "agency-1", userId: "rec-1", role: "recruiter" }
const VIEWER: AgencyContext = { agencyId: "agency-1", userId: "view-1", role: "viewer" }

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")

/** Chainable stub. `result` is the terminal value; writes are captured. */
function table(result: unknown, capture?: (payload: unknown, opts?: unknown) => void) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "is", "not", "neq", "order", "limit"]) {
    chain[m] = () => chain
  }
  chain.upsert = (payload: unknown, opts?: unknown) => {
    capture?.(payload, opts)
    return chain
  }
  chain.insert = (payload: unknown) => {
    capture?.(payload)
    return chain
  }
  chain.maybeSingle = () => Promise.resolve(result)
  chain.single = () => Promise.resolve(result)
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ------------------------------------------------------------
// 1. The parsers
// ------------------------------------------------------------

describe("parseDecision", () => {
  it("accepts the three stored values and null, nothing else", () => {
    expect(RECRUITER_DECISIONS).toEqual(["shortlist", "hold", "reject"])
    for (const d of RECRUITER_DECISIONS) expect(parseDecision(d)).toBe(d)
    expect(parseDecision(null)).toBeNull()
    expect(parseDecision(undefined)).toBeNull()
    // The screen says "Pass"; the API never does.
    expect(parseDecision("pass")).toBeUndefined()
    expect(parseDecision("rejected")).toBeUndefined()
    expect(parseDecision("")).toBeUndefined()
    expect(parseDecision(1)).toBeUndefined()
  })
})

describe("parseBulkDecisions", () => {
  const change = (i: number, decision: unknown = "shortlist") => ({ candidateId: `cand-${i}`, decision })

  it("accepts one to fifty well-formed changes, null included", () => {
    const one = parseBulkDecisions({ changes: [change(1, null)] })
    expect(one).toEqual({ ok: true, changes: [{ candidateId: "cand-1", decision: null }] })
    const fifty = parseBulkDecisions({ changes: Array.from({ length: 50 }, (_, i) => change(i)) })
    expect(fifty.ok).toBe(true)
    expect(MAX_BULK_DECISIONS).toBe(50)
  })

  it("refuses a missing, empty or non-array body", () => {
    expect(parseBulkDecisions(null).ok).toBe(false)
    expect(parseBulkDecisions({}).ok).toBe(false)
    expect(parseBulkDecisions({ changes: "cand-1" }).ok).toBe(false)
    expect(parseBulkDecisions({ changes: [] }).ok).toBe(false)
  })

  it("caps at fifty", () => {
    const r = parseBulkDecisions({ changes: Array.from({ length: 51 }, (_, i) => change(i)) })
    expect(r).toEqual({ ok: false, error: "changes may name at most 50 people" })
  })

  it("refuses a bad decision, a missing id and a repeated person", () => {
    expect(parseBulkDecisions({ changes: [change(1, "pass")] })).toEqual({ ok: false, error: "Invalid decision" })
    expect(parseBulkDecisions({ changes: [{ decision: "hold" }] }).ok).toBe(false)
    expect(parseBulkDecisions({ changes: [{ candidateId: 7, decision: "hold" }] }).ok).toBe(false)
    expect(parseBulkDecisions({ changes: [change(1), change(1, "hold")] })).toEqual({
      ok: false,
      error: "a candidate may appear only once",
    })
  })
})

// ------------------------------------------------------------
// 2. applyDecision
// ------------------------------------------------------------

const CAND = { id: "cand-1", agency_id: "agency-1", role_id: "role-1", ref: "CAN-07" }

function mockDb(opts: { candidate?: typeof CAND | null; existing?: string | null }) {
  let upserted: Record<string, unknown> | null = null
  let upsertOpts: unknown = null
  const touched: string[] = []
  admin.from.mockImplementation((t: string) => {
    touched.push(t)
    if (t === "candidates") return table({ data: opts.candidate === undefined ? CAND : opts.candidate, error: null })
    if (t === "recruiter_reviews")
      return table(
        { data: opts.existing === undefined ? null : { decision: opts.existing }, error: null },
        (p, o) => {
          upserted = p as Record<string, unknown>
          upsertOpts = o
        }
      )
    return table({ data: null, error: null })
  })
  return {
    touched,
    upserted: () => upserted as Record<string, unknown> | null,
    upsertOpts: () => upsertOpts,
  }
}

describe("applyDecision", () => {
  it("upserts the decision on candidate_id and returns the previous value", async () => {
    const db = mockDb({ existing: "hold" })
    const out = await applyDecision(REC, "cand-1", "shortlist")
    expect(out).toEqual({
      candidateId: "cand-1",
      candidateRef: "CAN-07",
      roleId: "role-1",
      decision: "shortlist",
      previous: "hold",
    })
    const row = db.upserted()
    expect(row).toMatchObject({
      agency_id: "agency-1",
      role_id: "role-1",
      candidate_id: "cand-1",
      decision: "shortlist",
      decision_note: "",
      decided_by: "rec-1",
    })
    expect(typeof row?.decided_at).toBe("string")
    expect(db.upsertOpts()).toEqual({ onConflict: "candidate_id" })
  })

  it("clears with null: decided_at goes null, previous still comes back, action is 'cleared'", async () => {
    const db = mockDb({ existing: "shortlist" })
    const out = await applyDecision(REC, "cand-1", null)
    expect(out.previous).toBe("shortlist")
    expect(out.decision).toBeNull()
    expect(db.upserted()?.decided_at).toBeNull()
    expect(writeAudit).toHaveBeenCalledTimes(1)
    expect(writeAudit.mock.calls[0][1]).toMatchObject({
      action: "cleared",
      fromValue: { decision: "shortlist" },
      toValue: { decision: null },
    })
  })

  it("reports previous as null when nobody has decided yet", async () => {
    mockDb({ existing: undefined })
    const out = await applyDecision(REC, "cand-1", "hold")
    expect(out.previous).toBeNull()
  })

  it("writes exactly one audit row per call, on the decision entity, with the previous value", async () => {
    mockDb({ existing: null })
    await applyDecision(REC, "cand-1", "reject", { note: "not this time" })
    expect(writeAudit).toHaveBeenCalledTimes(1)
    expect(writeAudit.mock.calls[0][1]).toEqual({
      agencyId: "agency-1",
      roleId: "role-1",
      candidateId: "cand-1",
      actorId: "rec-1",
      entityType: "decision",
      entityRef: "CAN-07",
      action: "decided",
      fromValue: { decision: null },
      toValue: { decision: "reject" },
      reason: "not this time",
    })
  })

  it("marks a bulk write as bulk in the audit reason, and a single one not at all", async () => {
    mockDb({})
    await applyDecision(REC, "cand-1", "shortlist", { source: "bulk" })
    expect(writeAudit.mock.calls[0][1].reason).toBe("bulk")
    vi.clearAllMocks()
    mockDb({})
    await applyDecision(REC, "cand-1", "shortlist", { source: "single" })
    expect(writeAudit.mock.calls[0][1].reason).toBeUndefined()
  })

  it("refuses a viewer before touching the database", async () => {
    const db = mockDb({})
    await expect(applyDecision(VIEWER, "cand-1", "shortlist")).rejects.toBeInstanceOf(AgencyAccessError)
    expect(db.touched).toHaveLength(0)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("refuses a candidate in another agency, and writes nothing", async () => {
    const db = mockDb({ candidate: { ...CAND, agency_id: "someone-else" } })
    await expect(applyDecision(REC, "cand-1", "shortlist")).rejects.toThrow(/not found in caller's agency/)
    expect(db.upserted()).toBeNull()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("refuses an unknown candidate the same way", async () => {
    mockDb({ candidate: null })
    await expect(applyDecision(REC, "cand-9", "shortlist")).rejects.toBeInstanceOf(AgencyAccessError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("refuses a candidate off the named role, so a bulk body cannot reach across roles", async () => {
    const db = mockDb({})
    await expect(
      applyDecision(REC, "cand-1", "shortlist", { roleId: "role-2", source: "bulk" })
    ).rejects.toThrow(/not on this role/)
    expect(db.upserted()).toBeNull()
    expect(writeAudit).not.toHaveBeenCalled()
    // And accepts the right one.
    mockDb({})
    await expect(applyDecision(REC, "cand-1", "shortlist", { roleId: "role-1" })).resolves.toMatchObject({
      previous: null,
    })
  })

  it("surfaces a failed write instead of auditing it", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "candidates") return table({ data: CAND, error: null })
      const chain = table({ data: null, error: null })
      chain.upsert = () => ({ then: (r: (v: unknown) => unknown) => r({ error: new Error("down") }) })
      return chain
    })
    await expect(applyDecision(REC, "cand-1", "shortlist")).rejects.toThrow("down")
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

describe("applyDecision with a row the caller already read", () => {
  it("skips both reads when candidate and previous are passed, and still audits the previous value", async () => {
    const db = mockDb({})
    const out = await applyDecision(REC, "cand-1", "shortlist", {
      roleId: "role-1",
      source: "bulk",
      candidate: CAND,
      previous: "hold",
    })
    expect(out.previous).toBe("hold")
    expect(db.touched.filter((t) => t === "candidates")).toHaveLength(0)
    // recruiter_reviews is touched once: the upsert, not a select.
    expect(db.touched.filter((t) => t === "recruiter_reviews")).toHaveLength(1)
    expect(db.upserted()).toMatchObject({ candidate_id: "cand-1", decision: "shortlist", role_id: "role-1" })
    expect(writeAudit.mock.calls[0][1]).toMatchObject({ fromValue: { decision: "hold" }, reason: "bulk" })
  })

  it("a passed previous of null means 'read, undecided' and is not looked up again", async () => {
    const db = mockDb({ existing: "shortlist" })
    const out = await applyDecision(REC, "cand-1", "hold", { candidate: CAND, previous: null })
    expect(out.previous).toBeNull()
    expect(db.touched.filter((t) => t === "recruiter_reviews")).toHaveLength(1)
  })

  it("still refuses a passed row from another agency or another role — the check does not move", async () => {
    const db = mockDb({})
    await expect(
      applyDecision(REC, "cand-1", "shortlist", { candidate: { ...CAND, agency_id: "someone-else" }, previous: null })
    ).rejects.toThrow(/not found in caller's agency/)
    await expect(
      applyDecision(REC, "cand-1", "shortlist", { roleId: "role-2", candidate: CAND, previous: null })
    ).rejects.toThrow(/not on this role/)
    expect(db.upserted()).toBeNull()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("ignores a passed row for a different candidate and reads the right one", async () => {
    const db = mockDb({})
    await applyDecision(REC, "cand-1", "shortlist", { candidate: { ...CAND, id: "cand-2" } })
    expect(db.touched.filter((t) => t === "candidates")).toHaveLength(1)
  })
})

describe("loadPreviousDecisions", () => {
  it("reads the whole batch in one query and leaves unreviewed people absent", async () => {
    const calls: string[] = []
    admin.from.mockImplementation((t: string) => {
      calls.push(t)
      return table({
        data: [
          { candidate_id: "cand-1", decision: "hold" },
          { candidate_id: "cand-2", decision: null },
        ],
        error: null,
      })
    })
    const map = await loadPreviousDecisions(["cand-1", "cand-2", "cand-3"])
    expect(calls).toEqual(["recruiter_reviews"])
    expect(map.get("cand-1")).toBe("hold")
    expect(map.get("cand-2")).toBeNull()
    expect(map.has("cand-3")).toBe(false)
  })

  it("asks nothing for an empty batch and surfaces a failed read", async () => {
    admin.from.mockImplementation(() => table({ data: null, error: new Error("down") }))
    expect((await loadPreviousDecisions([])).size).toBe(0)
    expect(admin.from).not.toHaveBeenCalled()
    await expect(loadPreviousDecisions(["cand-1"])).rejects.toThrow("down")
  })
})

// ------------------------------------------------------------
// 3. The routes
// ------------------------------------------------------------

const SINGLE = "app/api/agency/candidates/[candidateId]/decision/route.ts"
const BULK = "app/api/agency/roles/[roleId]/decisions/route.ts"
const single = tsCode(read(SINGLE))
const bulk = tsCode(read(BULK))

describe("the single route", () => {
  it("writes through applyDecision and touches recruiter_reviews nowhere itself", () => {
    expect(single).toMatch(/import \{[^}]*applyDecision[^}]*\} from "@\/lib\/agency\/decisions"/)
    expect(single).toMatch(/applyDecision\(auth\.ctx, candidateId, decision, \{ note, source: "single" \}\)/)
    expect(single).not.toContain("recruiter_reviews")
    expect(single).not.toContain("writeAudit")
  })

  it("is still writer-only and still answers exactly as it did", () => {
    expect(single).toContain("assertWriter(auth.ctx)")
    expect(single).toMatch(/\{ error: "Invalid decision" \}, \{ status: 400 \}/)
    expect(single).toMatch(/NextResponse\.json\(\{ decision: applied\.decision, candidate_ref: applied\.candidateRef \}\)/)
    expect(single).toMatch(/error instanceof AgencyAccessError[\s\S]{0,120}status: 403/)
  })
})

describe("the bulk route", () => {
  it("is a PATCH on the role that shares the single route's writer", () => {
    expect(bulk).toContain("export async function PATCH(")
    expect(bulk).toMatch(/import \{[^}]*applyDecision[^}]*\} from "@\/lib\/agency\/decisions"/)
    expect(bulk).toMatch(/applyDecision\(auth\.ctx, change\.candidateId, change\.decision, \{[\s\S]{0,60}roleId,[\s\S]{0,60}source: "bulk"/)
    expect(bulk).not.toContain("recruiter_reviews")
    expect(bulk).not.toContain("writeAudit")
  })

  it("requires an authenticated writer, like the single route — no machine path", () => {
    expect(bulk).toContain("requireAgencyContext()")
    expect(bulk).toContain("assertWriter(auth.ctx)")
    expect(bulk).toMatch(/status: auth\.failure === "unauthenticated" \? 401 : 403/)
    expect(bulk).not.toMatch(/cron|service_role|CRON_SECRET|x-api-key/i)
  })

  it("validates the body through the shared parser and answers 400", () => {
    expect(bulk).toContain("parseBulkDecisions(body)")
    expect(bulk).toMatch(/\{ error: parsed\.error \}, \{ status: 400 \}/)
  })

  it("scopes candidates by role AND agency, and skips the rest instead of failing", () => {
    const lookup = bulk.slice(bulk.indexOf('.from("candidates")'), bulk.indexOf("const onRole"))
    expect(lookup).toContain('.eq("role_id", roleId)')
    expect(lookup).toContain('.eq("agency_id", auth.ctx.agencyId)')
    expect(bulk).toContain('reason: "not on this role"')
    expect(bulk).toMatch(/NextResponse\.json\(\{ updated, skipped \}\)/)
  })

  it("returns each person's previous value so an undo is exact", () => {
    expect(bulk).toMatch(/previous: applied\.previous/)
  })

  it("applies one person at a time so every write carries its own audit row", () => {
    expect(bulk).toMatch(/for \(const change of parsed\.changes\)/)
    expect(bulk).not.toMatch(/Promise\.all\([\s\S]{0,80}applyDecision/)
  })

  it("is capped at fifty in the one place both routes read from", () => {
    const lib = tsCode(read("lib/agency/decisions.ts"))
    expect(lib).toContain("export const MAX_BULK_DECISIONS = 50")
    expect(lib).toMatch(/raw\.length > MAX_BULK_DECISIONS/)
  })
})

describe("the one writer", () => {
  it("is the only place in app/ or lib/ that writes recruiter_reviews", () => {
    const { execSync } = require("child_process") as typeof import("child_process")
    const out = execSync(
      `grep -rln 'from("recruiter_reviews")' app lib --include='*.ts' --include='*.tsx' || true`,
      { cwd: process.cwd(), encoding: "utf8" }
    )
    const files = out.split("\n").filter(Boolean).filter((f) => !f.includes("__tests__"))
    const writers = files.filter((f) => {
      const src = tsCode(read(f))
      const idx = src.indexOf('from("recruiter_reviews")')
      let writes = false
      let at = idx
      while (at !== -1) {
        const tail = src.slice(at, at + 200)
        if (/\.(upsert|insert|update|delete)\(/.test(tail)) writes = true
        at = src.indexOf('from("recruiter_reviews")', at + 1)
      }
      return writes
    })
    expect(writers).toEqual(["lib/agency/decisions.ts"])
  })

  it("re-checks tenancy and role itself, so the guarantee does not rest on the route's list", () => {
    const lib = tsCode(read("lib/agency/decisions.ts"))
    expect(lib).toContain("assertWriter(ctx)")
    expect(lib).toContain("candidate.agency_id !== ctx.agencyId")
    expect(lib).toContain("candidate.role_id !== options.roleId")
  })
})

// ------------------------------------------------------------
// 4. The bulk route, executed
// ------------------------------------------------------------

/**
 * The source scans above pin the shape; these run the handler. A viewer must
 * be refused before any query, a malformed body must be a 400, an id off
 * the role must come back in `skipped` with the shape the page reconciles
 * against, `updated[].previous` must be the server's value, and a database
 * failure must be a 500 — the page treats that as "reload", so it has to
 * be a 500 and not a quiet 200.
 */
describe("PATCH /api/agency/roles/[roleId]/decisions, executed", () => {
  const ROLE = "role-1"
  const request = (body: unknown) =>
    new Request(`http://tailr.test/api/agency/roles/${ROLE}/decisions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }) as unknown as NextRequest
  const call = (body: unknown) => bulkPatch(request(body), { params: Promise.resolve({ roleId: ROLE }) })

  /** Candidates on the role, and the batch's existing reviews. */
  function routeDb(opts: {
    candidates?: Array<{ id: string; agency_id: string; role_id: string; ref: string }>
    reviews?: Array<{ candidate_id: string; decision: string | null }>
    failUpsertFor?: string
  }) {
    const upserts: Array<Record<string, unknown>> = []
    const reads: string[] = []
    admin.from.mockImplementation((t: string) => {
      reads.push(t)
      if (t === "candidates") return table({ data: opts.candidates ?? [], error: null })
      if (t === "recruiter_reviews") {
        const chain = table({ data: opts.reviews ?? [], error: null })
        chain.upsert = (payload: unknown) => {
          const row = payload as Record<string, unknown>
          upserts.push(row)
          const failed = opts.failUpsertFor && row.candidate_id === opts.failUpsertFor
          return { then: (r: (v: unknown) => unknown) => r({ error: failed ? new Error("down") : null }) }
        }
        return chain
      }
      return table({ data: null, error: null })
    })
    return { upserts, reads }
  }

  const A = { id: "cand-a", agency_id: "agency-1", role_id: ROLE, ref: "CAN-01" }
  const B = { id: "cand-b", agency_id: "agency-1", role_id: ROLE, ref: "CAN-02" }

  it("refuses a viewer with 403 before touching the database", async () => {
    requireAgencyContext.mockResolvedValue({ ok: true, ctx: VIEWER, db: admin })
    const db = routeDb({ candidates: [A] })
    const res = await call({ changes: [{ candidateId: "cand-a", decision: "shortlist" }] })
    expect(res.status).toBe(403)
    expect(db.reads).toHaveLength(0)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("answers 401 unauthenticated and 403 without a membership", async () => {
    requireAgencyContext.mockResolvedValue({ ok: false, failure: "unauthenticated" })
    expect((await call({ changes: [{ candidateId: "cand-a", decision: "shortlist" }] })).status).toBe(401)
    requireAgencyContext.mockResolvedValue({ ok: false, failure: "no_agency" })
    expect((await call({ changes: [{ candidateId: "cand-a", decision: "shortlist" }] })).status).toBe(403)
  })

  it("answers 400 on an empty, malformed or duplicated body, and writes nothing", async () => {
    requireAgencyContext.mockResolvedValue({ ok: true, ctx: REC, db: admin })
    const db = routeDb({ candidates: [A] })
    expect((await call({ changes: [] })).status).toBe(400)
    expect((await call("not json")).status).toBe(400)
    expect((await call({ changes: [{ candidateId: "cand-a", decision: "pass" }] })).status).toBe(400)
    const dup = await call({
      changes: [
        { candidateId: "cand-a", decision: "shortlist" },
        { candidateId: "cand-a", decision: "hold" },
      ],
    })
    expect(dup.status).toBe(400)
    expect(await dup.json()).toEqual({ error: "a candidate may appear only once" })
    expect(db.upserts).toHaveLength(0)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("writes each person on the role, returns the server's previous value, and skips the id that is not", async () => {
    requireAgencyContext.mockResolvedValue({ ok: true, ctx: REC, db: admin })
    const db = routeDb({ candidates: [A, B], reviews: [{ candidate_id: "cand-a", decision: "hold" }] })
    const res = await call({
      changes: [
        { candidateId: "cand-a", decision: "shortlist" },
        { candidateId: "cand-b", decision: "shortlist" },
        { candidateId: "cand-elsewhere", decision: "shortlist" },
      ],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      updated: [
        { candidateId: "cand-a", decision: "shortlist", previous: "hold" },
        { candidateId: "cand-b", decision: "shortlist", previous: null },
      ],
      skipped: [{ candidateId: "cand-elsewhere", reason: "not on this role" }],
    })
    // Two writes, in order, and one audit row each — with the previous value.
    expect(db.upserts.map((u) => u.candidate_id)).toEqual(["cand-a", "cand-b"])
    expect(writeAudit).toHaveBeenCalledTimes(2)
    expect(writeAudit.mock.calls[0][1]).toMatchObject({
      candidateId: "cand-a",
      actorId: "rec-1",
      entityType: "decision",
      action: "decided",
      fromValue: { decision: "hold" },
      toValue: { decision: "shortlist" },
      reason: "bulk",
    })
    // One candidates read and one reviews read for the whole batch: no per-person lookups.
    expect(db.reads.filter((t) => t === "candidates")).toHaveLength(1)
    expect(db.reads.filter((t) => t === "recruiter_reviews")).toHaveLength(3) // 1 read + 2 upserts
  })

  it("an undo body (the previous values sent back) clears and restores exactly", async () => {
    requireAgencyContext.mockResolvedValue({ ok: true, ctx: REC, db: admin })
    const db = routeDb({
      candidates: [A, B],
      reviews: [
        { candidate_id: "cand-a", decision: "shortlist" },
        { candidate_id: "cand-b", decision: "shortlist" },
      ],
    })
    const res = await call({
      changes: [
        { candidateId: "cand-a", decision: "hold" },
        { candidateId: "cand-b", decision: null },
      ],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toEqual([
      { candidateId: "cand-a", decision: "hold", previous: "shortlist" },
      { candidateId: "cand-b", decision: null, previous: "shortlist" },
    ])
    expect(db.upserts[1]).toMatchObject({ candidate_id: "cand-b", decision: null, decided_at: null })
    expect(writeAudit.mock.calls[1][1]).toMatchObject({ action: "cleared", fromValue: { decision: "shortlist" } })
  })

  it("a database failure mid-batch is a 500, after the people before it were written", async () => {
    requireAgencyContext.mockResolvedValue({ ok: true, ctx: REC, db: admin })
    const db = routeDb({ candidates: [A, B], failUpsertFor: "cand-b" })
    const res = await call({
      changes: [
        { candidateId: "cand-a", decision: "shortlist" },
        { candidateId: "cand-b", decision: "shortlist" },
      ],
    })
    expect(res.status).toBe(500)
    expect(db.upserts.map((u) => u.candidate_id)).toEqual(["cand-a", "cand-b"])
    // cand-a was audited; cand-b's failed write was not.
    expect(writeAudit).toHaveBeenCalledTimes(1)
    expect(writeAudit.mock.calls[0][1]).toMatchObject({ candidateId: "cand-a" })
  })
})
