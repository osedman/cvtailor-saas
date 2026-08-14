/**
 * Recipient revocation — the control that kills a leaked shortlist link.
 *
 * The property that actually matters is not "the button works": it is that
 * `live` in the recruiter's list means exactly what app/api/portal/[token]
 * enforces. If those two ever drift, this screen tells a recruiter a link is
 * dead while the link still opens, which is worse than having no screen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const admin = vi.hoisted(() => ({ from: vi.fn() }))
const writeAudit = vi.hoisted(() => vi.fn())

vi.mock("@/lib/agency/db", async () => {
  const actual = await vi.importActual<typeof import("../agency/db")>("../agency/db")
  return {
    ...actual,
    agencyAdmin: () => admin,
    writeAudit,
    assertWriter: (ctx: { role: string }) => {
      if (ctx.role === "viewer") throw new actual.AgencyAccessError("viewers have read-only access")
    },
  }
})

import { listRecipientsForRole, revokeRecipient } from "../agency/recipients"
import { AgencyAccessError } from "../agency/db"
import type { AgencyContext } from "../agency/types"

const CTX: AgencyContext = { agencyId: "agency-1", userId: "user-1", role: "owner" }
const OTHER = { ...CTX, agencyId: "agency-2" }

/** Minimal chainable stub; `result` is what the terminal call resolves to. */
function table(result: unknown, capture?: (payload: unknown) => void) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "order", "is"]) chain[m] = () => chain
  chain.update = (payload: unknown) => {
    capture?.(payload)
    return chain
  }
  chain.maybeSingle = () => Promise.resolve(result)
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

const future = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listRecipientsForRole", () => {
  function wire(recipients: unknown[]) {
    admin.from.mockImplementation((t: string) => {
      if (t === "submissions") return table({ data: [{ id: "sub-1" }], error: null })
      if (t === "submission_recipients") return table({ data: recipients, error: null })
      if (t === "client_contacts")
        return table({
          data: [{ id: "contact-1", company: "Meridian Health", full_name: "Marcus Webb" }],
          error: null,
        })
      return table({ data: [], error: null })
    })
  }

  const base = {
    id: "rec-1",
    submission_id: "sub-1",
    contact_id: "contact-1",
    first_opened_at: null,
    last_opened_at: null,
    created_at: past,
  }

  it("marks an unrevoked, unexpired link live", async () => {
    wire([{ ...base, expires_at: future, revoked_at: null }])
    const [row] = await listRecipientsForRole(CTX, "role-1")
    expect(row.live).toBe(true)
    expect(row.company).toBe("Meridian Health")
  })

  // The portal refuses on revoked_at OR expiry. `live` must agree on both.
  it("marks a revoked link dead even when it has not expired", async () => {
    wire([{ ...base, expires_at: future, revoked_at: past }])
    const [row] = await listRecipientsForRole(CTX, "role-1")
    expect(row.live).toBe(false)
  })

  it("marks an expired link dead even when it was never revoked", async () => {
    wire([{ ...base, expires_at: past, revoked_at: null }])
    const [row] = await listRecipientsForRole(CTX, "role-1")
    expect(row.live).toBe(false)
  })

  it("never returns a token field of any kind", async () => {
    wire([{ ...base, expires_at: future, revoked_at: null, token_hash: "deadbeef" }])
    const [row] = await listRecipientsForRole(CTX, "role-1")
    expect(JSON.stringify(row)).not.toContain("deadbeef")
    expect(Object.keys(row)).not.toContain("tokenHash")
  })

  it("returns nothing when the role has no submissions", async () => {
    admin.from.mockImplementation(() => table({ data: [], error: null }))
    expect(await listRecipientsForRole(CTX, "role-1")).toEqual([])
  })
})

describe("revokeRecipient", () => {
  it("stamps revoked_at and writes exactly one audit row", async () => {
    let payload: unknown = null
    admin.from.mockImplementation((t: string) => {
      if (t === "submission_recipients")
        return table(
          { data: { id: "rec-1", agency_id: "agency-1", submission_id: "sub-1", contact_id: "contact-1", revoked_at: null }, error: null },
          (p) => (payload = p)
        )
      if (t === "submissions") return table({ data: { role_id: "role-1" }, error: null })
      if (t === "job_roles") return table({ data: { ref: "ROL-2402" }, error: null })
      return table({ data: [], error: null })
    })
    // the update() resolves through .select() → the chain's then()
    admin.from.mockImplementationOnce(() =>
      table(
        { data: { id: "rec-1", agency_id: "agency-1", submission_id: "sub-1", contact_id: "contact-1", revoked_at: null }, error: null },
        (p) => (payload = p)
      )
    )

    const res = await revokeRecipient(CTX, "rec-1")
    expect(res.alreadyRevoked).toBe(false)
    expect((payload as { revoked_at?: string })?.revoked_at).toBeTruthy()
    expect(writeAudit).toHaveBeenCalledTimes(1)
  })

  it("is idempotent: an already-revoked recipient logs nothing further", async () => {
    admin.from.mockImplementation(() =>
      table({
        data: { id: "rec-1", agency_id: "agency-1", submission_id: "sub-1", contact_id: "contact-1", revoked_at: past },
        error: null,
      })
    )
    const res = await revokeRecipient(CTX, "rec-1")
    expect(res.alreadyRevoked).toBe(true)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("refuses another agency's recipient, and says the same thing as 'not found'", async () => {
    admin.from.mockImplementation(() => table({ data: null, error: null }))
    await expect(revokeRecipient(OTHER, "rec-1")).rejects.toBeInstanceOf(AgencyAccessError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("refuses viewers before touching the database", async () => {
    admin.from.mockImplementation(() => table({ data: null, error: null }))
    await expect(revokeRecipient({ ...CTX, role: "viewer" }, "rec-1")).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    expect(admin.from).not.toHaveBeenCalled()
  })

  it("keeps no email or token in the audit row", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "submission_recipients")
        return table({
          data: { id: "rec-1", agency_id: "agency-1", submission_id: "sub-1", contact_id: "contact-1", revoked_at: null },
          error: null,
        })
      if (t === "submissions") return table({ data: { role_id: "role-1" }, error: null })
      if (t === "job_roles") return table({ data: { ref: "ROL-2402" }, error: null })
      return table({ data: [], error: null })
    })
    await revokeRecipient(CTX, "rec-1")
    const entry = writeAudit.mock.calls[0]?.[1]
    expect(JSON.stringify(entry)).not.toMatch(/@/)
    expect(JSON.stringify(entry)).not.toMatch(/token/i)
  })
})
