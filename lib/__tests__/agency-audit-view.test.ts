/**
 * Reading the audit log.
 *
 * The property that carries the weight: a NULL actor is not "unknown". A
 * candidate answering a consent link and a referee replying have no account
 * and never will, so the absence of an actor_id IS the attribution. Rendering
 * those as unknown would misattribute the most consequential rows in the log —
 * the ones where someone outside the agency exercised a choice about their own
 * data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { listAuditEntries, AUDIT_GROUPS } from "../agency/audit-view"
import type { AgencyContext } from "../agency/types"

const CTX: AgencyContext = { agencyId: "agency-1", userId: "me", role: "owner" }

let rows: Array<Record<string, unknown>> = []
const calls: Array<{ method: string; args: unknown[] }> = []

/** Chainable stub standing in for the user-scoped client. */
function db() {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "limit", "in"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      return chain
    }
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null })
  return { from: () => chain } as never
}

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    created_at: new Date().toISOString(),
    actor_id: "me",
    entity_type: "round",
    entity_ref: "CAN-01",
    action: "scheduled",
    from_value: null,
    to_value: null,
    reason: null,
    role_id: "role-1",
    candidate_id: "cand-1",
    ...over,
  }
}

beforeEach(() => {
  rows = []
  calls.length = 0
})

describe("who acted", () => {
  it("names the caller as You", async () => {
    rows = [row({ actor_id: "me" })]
    const [e] = await listAuditEntries(db(), CTX)
    expect(e.actor).toEqual({ kind: "you", label: "You" })
  })

  it("does not leak a colleague's identity", async () => {
    rows = [row({ actor_id: "someone-else" })]
    const [e] = await listAuditEntries(db(), CTX)
    expect(e.actor.kind).toBe("teammate")
    expect(e.actor.label).toBe("A teammate")
    expect(JSON.stringify(e)).not.toContain("someone-else")
  })

  // The rows this screen exists to render honestly.
  it("attributes a null-actor consent decision to the CANDIDATE, not to nobody", async () => {
    rows = [row({ actor_id: null, entity_type: "round", action: "capture_declined" })]
    const [e] = await listAuditEntries(db(), CTX)
    expect(e.actor).toEqual({ kind: "candidate", label: "The candidate" })
    expect(e.what).toBe("Declined recording")
  })

  it("attributes a null-actor reference reply to the REFEREE", async () => {
    rows = [row({ actor_id: null, entity_type: "reference", action: "reference_received" })]
    const [e] = await listAuditEntries(db(), CTX)
    expect(e.actor.kind).toBe("referee")
  })

  it("falls back to the system for a genuinely automated row", async () => {
    rows = [row({ actor_id: null, entity_type: "candidate", action: "erased" })]
    const [e] = await listAuditEntries(db(), CTX)
    expect(e.actor.kind).toBe("system")
    expect(e.what).toBe("Erased a candidate")
  })
})

describe("what happened", () => {
  it("reads an override from its own from/to values rather than inventing one", async () => {
    rows = [
      row({
        entity_type: "override",
        action: "overridden",
        from_value: { strength: "transferable" },
        to_value: { strength: "strong" },
        reason: "confirmed on the call",
      }),
    ]
    const [e] = await listAuditEntries(db(), CTX)
    expect(e.detail).toBe("was transferable · now strong — confirmed on the call")
  })

  it("never renders an unmapped action as blank", async () => {
    rows = [row({ entity_type: "widget", action: "frobnicated" })]
    const [e] = await listAuditEntries(db(), CTX)
    expect(e.what).toBe("frobnicated widget")
  })

  it("scopes every query to the caller's agency", async () => {
    rows = [row()]
    await listAuditEntries(db(), CTX)
    const agencyFilter = calls.find(
      (c) => c.method === "eq" && c.args[0] === "agency_id" && c.args[1] === "agency-1"
    )
    expect(agencyFilter).toBeDefined()
  })

  it("filters by group using the declared entity types", async () => {
    rows = []
    await listAuditEntries(db(), CTX, { group: "interviews" })
    const inCall = calls.find((c) => c.method === "in")
    expect(inCall?.args[1]).toEqual(AUDIT_GROUPS.interviews)
  })

  it("caps the page size even when asked for more", async () => {
    rows = []
    await listAuditEntries(db(), CTX, { limit: 100000 })
    const limitCall = calls.find((c) => c.method === "limit")
    expect(limitCall?.args[0]).toBe(500)
  })
})
