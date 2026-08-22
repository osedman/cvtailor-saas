/**
 * Right to represent.
 *
 * The properties that carry it: unanswered is not yes; a decline after an
 * agree is WITHDRAWN, not declined — a revoked yes and a plain no are
 * different facts; the gate refuses answered-no outright with no override,
 * and audits the unanswered override with the refs so the trail shows who
 * overrode for whom; and the answer never filters, ranks or hides anyone —
 * enforced by a source scan, the same mechanism as compliance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import path from "path"

type Row = Record<string, unknown>
const store = vi.hoisted(() => ({
  candidates: [] as Row[],
  updates: [] as Row[],
  audit: [] as Row[],
}))

const admin = vi.hoisted(() => ({
  from(table: string) {
    if (table !== "candidates") throw new Error(`unexpected table ${table}`)
    const filters: Array<(r: Row) => boolean> = []
    let mode: "select" | "update" = "select"
    let patch: Row = {}
    const chain: Record<string, unknown> = {}
    chain.select = () => { mode = "select"; return chain }
    chain.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return chain }
    chain.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return chain }
    chain.update = (p: Row) => { mode = "update"; patch = p; return chain }
    const rows = () => store.candidates.filter((r) => filters.every((f) => f(r)))
    const settle = () => {
      if (mode === "update") {
        const hit = rows()
        store.updates.push({ patch, matched: hit.length })
        hit.forEach((r) => Object.assign(r, patch))
        return { data: null, error: null }
      }
      return { data: rows(), error: null }
    }
    chain.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    chain.then = (resolve: (v: unknown) => unknown) => resolve(settle())
    return chain
  },
}))

vi.mock("@/lib/agency/db", async () => {
  const actual = await vi.importActual<typeof import("../agency/db")>("../agency/db")
  return {
    ...actual,
    agencyAdmin: () => admin,
    writeAudit: async (_a: unknown, e: Row) => { store.audit.push(e) },
  }
})

import { answerRepresent, checkRepresentGate, REPRESENT_COPY_VERSION } from "../agency/represent"

const TOKEN = "a".repeat(48)

beforeEach(() => {
  store.candidates = [
    { id: "c1", agency_id: "a1", role_id: "r1", ref: "CAN-01", rights_token: TOKEN, represent_status: "unanswered" },
  ]
  store.updates = []; store.audit = []
})

describe("the candidate's answer", () => {
  it("agree records agreed, dated, with the copy version they saw", async () => {
    expect(await answerRepresent(TOKEN, "agree")).toBe("agreed")
    const c = store.candidates[0]!
    expect(c.represent_status).toBe("agreed")
    expect(c.represent_copy_version).toBe(REPRESENT_COPY_VERSION)
    expect(store.audit[0]).toMatchObject({
      entityType: "candidate",
      entityRef: "CAN-01",
      action: "represent_agreed",
      actorId: null,
    })
  })

  it("decline after agree is WITHDRAWN — a revoked yes is not a plain no", async () => {
    await answerRepresent(TOKEN, "agree")
    expect(await answerRepresent(TOKEN, "decline")).toBe("withdrawn")
    expect(store.candidates[0]!.represent_status).toBe("withdrawn")
    expect(store.audit[1]!.action).toBe("represent_withdrawn")
  })

  it("decline from unanswered is a plain no", async () => {
    expect(await answerRepresent(TOKEN, "decline")).toBe("declined")
    expect(store.audit[0]!.action).toBe("represent_declined")
  })

  it("a changed mind is allowed in both directions", async () => {
    await answerRepresent(TOKEN, "decline")
    expect(await answerRepresent(TOKEN, "agree")).toBe("agreed")
  })

  it("a repeat click is unchanged and writes no second audit row", async () => {
    await answerRepresent(TOKEN, "agree")
    expect(await answerRepresent(TOKEN, "agree")).toBe("unchanged")
    expect(store.audit).toHaveLength(1)
  })

  it("a bad token learns nothing", async () => {
    expect(await answerRepresent("zz", "agree")).toBe("not_found")
    expect(await answerRepresent("f".repeat(48), "agree")).toBe("not_found")
    expect(store.audit).toHaveLength(0)
  })
})

describe("the submission gate", () => {
  const seed = (statuses: string[]) => {
    store.candidates = statuses.map((st, i) => ({
      id: `c${i}`, agency_id: "a1", role_id: "r1", ref: `CAN-0${i}`, represent_status: st,
    }))
    return store.candidates.map((c) => c.id as string)
  }
  const gate = (ids: string[], override = false) =>
    checkRepresentGate(admin as never, {
      agencyId: "a1", roleId: "r1", actorId: "rec-1", candidateIds: ids, overrideUnanswered: override,
    })

  it("all agreed passes clean, no audit noise", async () => {
    const ids = seed(["agreed", "agreed"])
    expect(await gate(ids)).toEqual({ ok: true })
    expect(store.audit).toHaveLength(0)
  })

  it("declined refuses outright — there is NO override over an answer", async () => {
    const ids = seed(["agreed", "declined"])
    expect(await gate(ids, true)).toMatchObject({ ok: false, kind: "answered_no", refused: ["CAN-01"] })
  })

  it("withdrawn refuses the same way — withdrawal stops future submissions", async () => {
    const ids = seed(["withdrawn"])
    expect(await gate(ids, true)).toMatchObject({ ok: false, kind: "answered_no" })
  })

  it("unanswered without the override asks, naming refs", async () => {
    const ids = seed(["agreed", "unanswered", "unanswered"])
    expect(await gate(ids)).toMatchObject({ ok: false, kind: "needs_override", refused: ["CAN-01", "CAN-02"] })
    expect(store.audit).toHaveLength(0)
  })

  it("the override passes AND audits who overrode for whom", async () => {
    const ids = seed(["unanswered"])
    expect(await gate(ids, true)).toEqual({ ok: true })
    expect(store.audit[0]).toMatchObject({
      entityType: "submission",
      action: "represent_overridden",
      actorId: "rec-1",
      entityRef: "CAN-00",
    })
  })

  it("answered-no wins over unanswered — the refusal comes first", async () => {
    const ids = seed(["unanswered", "declined"])
    expect(await gate(ids, true)).toMatchObject({ kind: "answered_no" })
  })
})

describe("the answer never filters, ranks or hides anyone", () => {
  it("no agency source narrows a query or list by represent_status, outside the gate", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, out)
        else if (/\.tsx?$/.test(entry) && !full.includes("__tests__")) out.push(full)
      }
      return out
    }
    const files = [
      ...walk(path.join(process.cwd(), "lib/agency")),
      ...walk(path.join(process.cwd(), "app/agencies")),
      ...walk(path.join(process.cwd(), "app/api/agency")),
    ]
    const offenders: string[] = []
    for (const f of files) {
      const rel = path.relative(process.cwd(), f)
      // The gate is the ONE permitted consumer: gating submission is the
      // single act the answer governs, and it lives in represent.ts alone.
      if (rel === "lib/agency/represent.ts") continue
      const text = readFileSync(f, "utf8")
      if (/\.(eq|neq|in|gt|lt|order)\(\s*["']represent_status/.test(text)) {
        offenders.push(`${rel}: query narrowed by represent_status`)
      }
      // [^\n]* not [^)]*: an arrow parameter's own closing paren —
      // `.filter((r) => r.represent_status...)` — ends a [^)]* scan before the
      // column name is ever reached, and the probe mutant sailed through.
      if (/\.(filter|find|some|every|sort)\([^\n]*represent_status/.test(text)) {
        offenders.push(`${rel}: list narrowed by represent_status`)
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })
})
