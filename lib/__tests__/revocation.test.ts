/**
 * The revocation rule (Ose, 30 Sep 2026: "revoking should cut access"): a
 * (role, contact) pair is cut when every recipient row for it is revoked,
 * and a later live send restores it.
 */
import { describe, it, expect, vi } from "vitest"

let rows: Array<{ contact_id: string; revoked_at: string | null; submissions: { role_id: string } }> = []

vi.mock("@/lib/agency/db", () => {
  class AgencyAccessError extends Error {}
  const chain = {
    select: () => chain,
    in: async () => ({ data: rows, error: null }),
  }
  return { AgencyAccessError, agencyAdmin: () => ({ from: () => chain }) }
})

import { revokedPairs, isCut, assertNotRevoked } from "@/lib/agency/revocation"

const r = (contact: string, role: string, revoked: boolean) => ({
  contact_id: contact,
  revoked_at: revoked ? "2026-09-30T10:00:00Z" : null,
  submissions: { role_id: role },
})

describe("revokedPairs", () => {
  it("cuts a pair whose only recipient row is revoked", async () => {
    rows = [r("c1", "role-a", true)]
    const cut = await revokedPairs(["c1"])
    expect(isCut(cut, "role-a", "c1")).toBe(true)
    await expect(assertNotRevoked("role-a", "c1")).rejects.toThrow(/withdrawn/)
  })

  it("a later live send restores access", async () => {
    rows = [r("c1", "role-a", true), r("c1", "role-a", false)]
    expect(isCut(await revokedPairs(["c1"]), "role-a", "c1")).toBe(false)
    await expect(assertNotRevoked("role-a", "c1")).resolves.toBeUndefined()
  })

  it("revoking one role leaves the contact's other roles alone", async () => {
    rows = [r("c1", "role-a", true), r("c1", "role-b", false)]
    const cut = await revokedPairs(["c1"])
    expect(isCut(cut, "role-a", "c1")).toBe(true)
    expect(isCut(cut, "role-b", "c1")).toBe(false)
  })

  it("a contact who never received the shortlist is not cut", async () => {
    rows = []
    expect(isCut(await revokedPairs(["c1"]), "role-a", "c1")).toBe(false)
  })
})
