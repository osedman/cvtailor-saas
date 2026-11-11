/**
 * Role ownership — commission attribution, so the writes are narrow.
 *
 * Three properties: only an active non-viewer member can own a role; a
 * reassignment writes its audit row with the before value (someone will ask
 * later); and handing a role its current owner is a no-op rather than a fresh
 * audit entry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = Record<string, unknown>
const store = vi.hoisted(() => ({
  members: [] as Row[],
  roles: [] as Row[],
  updates: [] as Row[],
  audit: [] as Row[],
}))

const admin = vi.hoisted(() => ({
  from(table: string) {
    const filters: Record<string, unknown> = {}
    let mode: "select" | "update" = "select"
    let patch: Row = {}
    const chain: Record<string, unknown> = {}
    chain.select = () => { mode = "select"; return chain }
    chain.eq = (c: string, v: unknown) => { filters[c] = v; return chain }
    chain.update = (p: Row) => { mode = "update"; patch = p; return chain }
    const rows = () => {
      const src = table === "members" ? store.members : table === "job_roles" ? store.roles : []
      return src.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
    }
    const settle = () => {
      if (mode === "update") {
        const hit = rows()
        store.updates.push({ table, patch, matched: hit.length })
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

import { setRoleOwner } from "../agency/role-owner"
import { AgencyAccessError } from "../agency/db"
import type { AgencyContext } from "../agency/types"

const CTX: AgencyContext = { agencyId: "a1", userId: "owner-1", role: "owner" }

beforeEach(() => {
  store.members = [
    { agency_id: "a1", user_id: "owner-1", role: "owner", status: "active" },
    { agency_id: "a1", user_id: "rec-1", role: "recruiter", status: "active" },
    { agency_id: "a1", user_id: "view-1", role: "viewer", status: "active" },
    { agency_id: "a1", user_id: "gone-1", role: "recruiter", status: "suspended" },
  ]
  store.roles = [{ id: "role-1", agency_id: "a1", ref: "ROL-01", owner_id: "owner-1" }]
  store.updates = []; store.audit = []
})

describe("setRoleOwner", () => {
  it("reassigns to an active recruiter, with the before value in the audit row", async () => {
    await setRoleOwner(CTX, "role-1", "rec-1")
    expect(store.roles[0]!.owner_id).toBe("rec-1")
    expect(store.audit).toHaveLength(1)
    expect(store.audit[0]).toMatchObject({
      entityType: "role",
      entityRef: "ROL-01",
      action: "owner_changed",
      fromValue: { owner_id: "owner-1" },
      toValue: { owner_id: "rec-1" },
    })
  })

  it("refuses a viewer — a desk nobody can work", async () => {
    await expect(setRoleOwner(CTX, "role-1", "view-1")).rejects.toBeInstanceOf(AgencyAccessError)
    expect(store.roles[0]!.owner_id).toBe("owner-1")
    expect(store.audit).toHaveLength(0)
  })

  it("refuses a suspended member — that is handing it to nobody", async () => {
    await expect(setRoleOwner(CTX, "role-1", "gone-1")).rejects.toBeInstanceOf(AgencyAccessError)
  })

  it("refuses somebody from another agency entirely", async () => {
    await expect(setRoleOwner(CTX, "role-1", "stranger")).rejects.toBeInstanceOf(AgencyAccessError)
  })

  it("reassigning to the current owner is a no-op, not a fresh audit row", async () => {
    await setRoleOwner(CTX, "role-1", "owner-1")
    expect(store.updates.filter((u) => u.table === "job_roles")).toHaveLength(0)
    expect(store.audit).toHaveLength(0)
  })

  it("viewers cannot reassign at all", async () => {
    await expect(
      setRoleOwner({ ...CTX, role: "viewer" }, "role-1", "rec-1")
    ).rejects.toBeInstanceOf(AgencyAccessError)
  })
})
