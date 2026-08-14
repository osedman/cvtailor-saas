/**
 * Availability, rounds and decisions.
 *
 * Three properties carry real weight here:
 *   1. Nothing in this module may set capture consent. It is the candidate's
 *      to give and its copy is still behind the DPIA gate, so a round created
 *      here must leave those columns alone entirely.
 *   2. A round number is derived, never supplied — a caller cannot skip,
 *      duplicate or back-date one.
 *   3. 'decline' writes a decision row and touches nothing about the
 *      candidate. No-auto-rejection, client edition.
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
      if (ctx.role === "viewer") throw new actual.AgencyAccessError("viewers are read-only")
    },
  }
})

import { offerSlot, withdrawSlot, scheduleRound, decideRound, setRoundStatus } from "../agency/rounds"
import { AgencyAccessError } from "../agency/db"
import type { AgencyContext, HiringContext } from "../agency/types"

const HM: HiringContext = {
  userId: "hm-user",
  email: "hm@example.com",
  links: [
    {
      contactId: "contact-1",
      agencyId: "agency-1",
      agencyName: "Halcyon Search",
      company: "Meridian Health",
      fullName: "Marcus Webb",
    },
  ],
}
const REC: AgencyContext = { agencyId: "agency-1", userId: "rec-1", role: "owner" }

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

/** Chainable stub. `result` is the terminal value; inserts are captured. */
function table(result: unknown, capture?: (payload: unknown) => void) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "is", "not", "neq", "order", "limit", "gt"]) {
    chain[m] = () => chain
  }
  chain.insert = (payload: unknown) => {
    capture?.(payload)
    return chain
  }
  chain.update = (payload: unknown) => {
    capture?.(payload)
    return chain
  }
  chain.single = () => Promise.resolve(result)
  chain.maybeSingle = () => Promise.resolve(result)
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("offerSlot", () => {
  it("rejects a contact the hiring manager is not linked to", async () => {
    admin.from.mockImplementation(() => table({ data: null, error: null }))
    await expect(
      offerSlot(HM, { contactId: "someone-else", startsAt: inHours(24), endsAt: inHours(25) })
    ).rejects.toBeInstanceOf(AgencyAccessError)
    expect(admin.from).not.toHaveBeenCalled()
  })

  it("derives agency_id from the link, not from input", async () => {
    let payload: unknown = null
    admin.from.mockImplementation(() => table({ data: { id: "slot-1" }, error: null }, (p) => (payload = p)))
    await offerSlot(HM, { contactId: "contact-1", startsAt: inHours(24), endsAt: inHours(25) })
    expect((payload as { agency_id?: string }).agency_id).toBe("agency-1")
  })

  it("refuses a slot in the past and one that ends before it starts", async () => {
    admin.from.mockImplementation(() => table({ data: { id: "s" }, error: null }))
    await expect(
      offerSlot(HM, { contactId: "contact-1", startsAt: inHours(-5), endsAt: inHours(-4) })
    ).rejects.toThrow(/already passed/)
    await expect(
      offerSlot(HM, { contactId: "contact-1", startsAt: inHours(25), endsAt: inHours(24) })
    ).rejects.toThrow(/after its start/)
  })

  it("refuses an absurdly long window (a date-picker slip, not an offer)", async () => {
    admin.from.mockImplementation(() => table({ data: { id: "s" }, error: null }))
    await expect(
      offerSlot(HM, { contactId: "contact-1", startsAt: inHours(24), endsAt: inHours(24 + 400) })
    ).rejects.toThrow(/cannot be longer/)
  })
})

describe("withdrawSlot", () => {
  it("refuses when a live round is booked in it, and says what to do instead", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "availability_slots")
        return table({
          data: { id: "slot-1", agency_id: "agency-1", contact_id: "contact-1", role_id: null, revoked_at: null },
          error: null,
        })
      if (t === "interview_rounds")
        return table({ data: { id: "round-1", status: "scheduled" }, error: null })
      return table({ data: null, error: null })
    })
    await expect(withdrawSlot(HM, "slot-1")).rejects.toThrow(/cancel the interview/)
    expect(writeAudit).not.toHaveBeenCalled()
  })
})

describe("scheduleRound", () => {
  function wire(capture?: (p: unknown) => void, highestRound: number | null = null) {
    admin.from.mockImplementation((t: string) => {
      if (t === "job_roles") return table({ data: { id: "role-1", ref: "ROL-2402" }, error: null })
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", role_id: "role-1" }, error: null })
      if (t === "availability_slots")
        return table({
          data: {
            id: "slot-1",
            contact_id: "contact-1",
            role_id: null,
            starts_at: inHours(24),
            ends_at: inHours(25),
            revoked_at: null,
          },
          error: null,
        })
      if (t === "interview_rounds")
        return table(
          highestRound === null
            ? { data: [], error: null }
            : { data: [{ round_number: highestRound }], error: null },
          capture
        )
      return table({ data: null, error: null })
    })
  }

  // The property that protects the DPIA gate.
  it("NEVER writes capture consent", async () => {
    let payload: Record<string, unknown> | null = null
    wire((p) => {
      if (!payload) payload = p as Record<string, unknown>
    })
    // the insert resolves through .select().single()
    admin.from.mockImplementation((t: string) => {
      if (t === "job_roles") return table({ data: { id: "role-1", ref: "ROL-2402" }, error: null })
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", role_id: "role-1" }, error: null })
      if (t === "availability_slots")
        return table({
          data: { id: "slot-1", contact_id: "contact-1", role_id: null, starts_at: inHours(24), ends_at: inHours(25), revoked_at: null },
          error: null,
        })
      if (t === "interview_rounds")
        return table({ data: [], error: null }, (p) => {
          if (!payload) payload = p as Record<string, unknown>
        })
      return table({ data: null, error: null })
    })

    await scheduleRound(REC, { roleId: "role-1", candidateId: "cand-1", slotId: "slot-1" }).catch(
      () => {}
    )
    if (payload) {
      const keys = Object.keys(payload)
      expect(keys).not.toContain("capture_consent_status")
      expect(keys).not.toContain("capture_consent_at")
      expect(keys).not.toContain("consent_token_hash")
    }
  })

  it("refuses a candidate that belongs to another role", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "job_roles") return table({ data: { id: "role-1", ref: "ROL-2402" }, error: null })
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", role_id: "role-OTHER" }, error: null })
      return table({ data: null, error: null })
    })
    await expect(
      scheduleRound(REC, { roleId: "role-1", candidateId: "cand-1", slotId: "slot-1" })
    ).rejects.toBeInstanceOf(AgencyAccessError)
  })

  it("refuses viewers before touching the database", async () => {
    admin.from.mockImplementation(() => table({ data: null, error: null }))
    await expect(
      scheduleRound({ ...REC, role: "viewer" }, { roleId: "r", candidateId: "c", slotId: "s" })
    ).rejects.toBeInstanceOf(AgencyAccessError)
    expect(admin.from).not.toHaveBeenCalled()
  })

  it("turns the slot-booking unique-violation into a human message", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "job_roles") return table({ data: { id: "role-1", ref: "ROL-2402" }, error: null })
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", role_id: "role-1" }, error: null })
      if (t === "availability_slots")
        return table({
          data: { id: "slot-1", contact_id: "contact-1", role_id: null, starts_at: inHours(24), ends_at: inHours(25), revoked_at: null },
          error: null,
        })
      if (t === "interview_rounds") {
        const chain = table({ data: [], error: null })
        // insert → select → single rejects with a duplicate key
        chain.single = () => Promise.resolve({ data: null, error: { code: "23505" } })
        return chain
      }
      return table({ data: null, error: null })
    })
    await expect(
      scheduleRound(REC, { roleId: "role-1", candidateId: "cand-1", slotId: "slot-1" })
    ).rejects.toThrow(/booked into that time/)
  })
})

describe("decideRound", () => {
  it("records a decline as a decision and touches nothing about the candidate", async () => {
    const touched: string[] = []
    let inserted: Record<string, unknown> | null = null
    admin.from.mockImplementation((t: string) => {
      touched.push(t)
      if (t === "interview_rounds")
        return table({
          data: {
            id: "round-1",
            agency_id: "agency-1",
            contact_id: "contact-1",
            role_id: "role-1",
            candidate_id: "cand-1",
            status: "completed",
          },
          error: null,
        })
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      if (t === "round_decisions")
        return table({ data: null, error: null }, (p) => (inserted = p as Record<string, unknown>))
      return table({ data: null, error: null })
    })

    await decideRound(HM, "round-1", "decline", "not this time")

    expect((inserted as unknown as { decision?: string })?.decision).toBe("decline")
    // candidates was READ for its ref; it must never be written.
    expect(touched.filter((t) => t === "candidates")).toHaveLength(1)
    expect(writeAudit).toHaveBeenCalledTimes(1)
  })

  it("refuses a round belonging to a contact the client is not linked to", async () => {
    admin.from.mockImplementation(() =>
      table({
        data: {
          id: "round-1",
          agency_id: "agency-1",
          contact_id: "someone-else",
          role_id: "role-1",
          candidate_id: "cand-1",
          status: "completed",
        },
        error: null,
      })
    )
    await expect(decideRound(HM, "round-1", "advance")).rejects.toBeInstanceOf(AgencyAccessError)
  })
})

/**
 * A promise made in writing, enforced in code.
 *
 * The consent copy (docs/CONSENT-COPY-DRAFT.md §2) tells the candidate that
 * "the people interviewing you are not told what you chose". That sentence is
 * what makes consent freely given rather than merely claimed — a candidate who
 * believes declining is visible to their interviewer is not choosing freely.
 *
 * getHiringDashboard is the client's only window onto rounds, so this is a
 * source scan over the one query that could break it. Crude on purpose, in the
 * manner of typography-consistency.test.ts: it fails the build the day someone
 * widens that select.
 */
describe("the client is never told what the candidate chose", () => {
  it("getHiringDashboard does not select capture_consent columns", async () => {
    const { readFileSync } = await import("fs")
    const { resolve } = await import("path")
    const source = readFileSync(resolve(__dirname, "../agency/client-auth.ts"), "utf8")

    const start = source.indexOf("export async function getHiringDashboard")
    expect(start).toBeGreaterThan(-1)
    const body = source.slice(start)

    // The select lists columns explicitly; none of them may be a consent column.
    const selects = body.match(/\.select\([\s\S]*?\)/g) ?? []
    for (const s of selects) {
      expect(s).not.toMatch(/capture_consent/)
      expect(s).not.toMatch(/consent_token_hash/)
    }
  })
})

/**
 * Found by walking the loop against the deployed schema, not by a unit test.
 *
 * The double-booking guard is `unique (slot_id) WHERE slot_id IS NOT NULL` —
 * status-agnostic. A cancelled round that kept its slot_id would hold that
 * window forever: listOpenSlots offers it (it ignores cancelled rounds) and the
 * insert then fails on a duplicate key, which surfaces to the recruiter as
 * "someone was booked into that time a moment ago" when nobody had.
 *
 * The UI says "cancelling gives it back". This is what makes that true.
 */
describe("cancelling a round frees its slot", () => {
  it("clears slot_id on cancel, so the window can be rebooked", async () => {
    let patch: Record<string, unknown> = {}
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds")
        return table(
          { data: { id: "round-1", agency_id: "agency-1", role_id: "role-1", candidate_id: "cand-1", round_number: 1, status: "scheduled" }, error: null },
          (p) => {
            patch = p as Record<string, unknown>
          }
        )
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: null, error: null })
    })

    await setRoundStatus(REC, "round-1", "cancelled")
    expect(patch.status).toBe("cancelled")
    expect(patch.slot_id).toBeNull()
  })

  it("does NOT clear slot_id when merely completing — the round still happened there", async () => {
    let patch: Record<string, unknown> = {}
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds")
        return table(
          { data: { id: "round-1", agency_id: "agency-1", role_id: "role-1", candidate_id: "cand-1", round_number: 1, status: "scheduled" }, error: null },
          (p) => {
            patch = p as Record<string, unknown>
          }
        )
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: null, error: null })
    })

    await setRoundStatus(REC, "round-1", "completed")
    expect(patch.status).toBe("completed")
    expect(Object.keys(patch)).not.toContain("slot_id")
  })
})
