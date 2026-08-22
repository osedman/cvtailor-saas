/**
 * The candidate's side of a booking.
 *
 * Four properties carry the weight:
 *
 *   1. The joining link is withheld until they confirm. A live meeting URL in
 *      an unconfirmed inbox is a call somebody can walk into unannounced.
 *   2. Declining RELEASES THE SLOT — slot_id cleared in the same write. The
 *      unique index that prevents double-booking is (slot_id) WHERE slot_id IS
 *      NOT NULL and is status-agnostic, so a cancelled round keeping its
 *      slot_id holds that client window forever. setRoundStatus() documents
 *      this because it has already happened once.
 *   3. Declining is not withdrawing. candidate_response is its own column and
 *      nothing may write a decline into anything that reads as leaving the
 *      role.
 *   4. A repeat click is not a change of mind.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "crypto"

type Row = Record<string, unknown>

const store = vi.hoisted(() => ({
  rounds: [] as Row[],
  updates: [] as Row[],
  audit: [] as Row[],
  notified: [] as Row[],
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

    const rowsFor = () => {
      if (table === "interview_rounds") {
        return store.rounds.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
      }
      if (table === "agencies") return [{ name: "Halcyon Search", notice_from_name: "", notice_reply_to: "" }]
      if (table === "client_contacts") return [{ company: "Meridian Health" }]
      if (table === "candidates") return [{ ref: "CAN-01", full_name: "Amara Okafor", email: "a@example.test" }]
      return []
    }

    const settle = () => {
      if (mode === "update") {
        const hit = rowsFor()
        store.updates.push({ table, patch, matched: hit.length })
        hit.forEach((r) => Object.assign(r, patch))
        return { data: null, error: null }
      }
      return { data: rowsFor(), error: null }
    }
    chain.maybeSingle = () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null })
    chain.single = () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null })
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
vi.mock("@/lib/agency/notify", () => ({
  notify: async (_a: unknown, input: Row) => { store.notified.push(input); return "sent" },
  resolvePreference: () => true,
  facesClient: () => false,
}))
vi.mock("@/lib/email", () => ({ sendEmail: async () => ({ sent: true }) }))

import { peekBooking, respondToBooking } from "../agency/booking"

const TOKEN = "b".repeat(32)
const HASH = createHash("sha256").update(TOKEN).digest("hex")

function seed(overrides: Row = {}) {
  store.rounds = [
    {
      id: "round-1",
      agency_id: "a1",
      role_id: "role-1",
      candidate_id: "cand-1",
      contact_id: "contact-1",
      round_number: 2,
      slot_id: "slot-1",
      scheduled_at: "2026-08-27T13:30:00.000Z",
      duration_minutes: 45,
      meeting_url: "https://meet.example/abc",
      status: "scheduled",
      candidate_response: "pending",
      booking_token_hash: HASH,
      ...overrides,
    },
  ]
}

beforeEach(() => {
  store.rounds = []; store.updates = []; store.audit = []; store.notified = []
})

describe("what the doorway shows", () => {
  it("withholds the joining link until they confirm", async () => {
    seed()
    const view = await peekBooking(TOKEN)
    expect(view.state).toBe("invited")
    expect(view.meetingUrl, "an unconfirmed inbox must not hold a live meeting URL").toBeNull()
  })

  it("shows the joining link once confirmed", async () => {
    seed({ candidate_response: "confirmed" })
    const view = await peekBooking(TOKEN)
    expect(view.state).toBe("confirmed")
    expect(view.meetingUrl).toBe("https://meet.example/abc")
  })

  it("names the company — you cannot ask for a morning without saying who with", async () => {
    seed()
    expect((await peekBooking(TOKEN)).company).toBe("Meridian Health")
  })

  it("an unknown token is simply unknown", async () => {
    seed()
    expect((await peekBooking("not-a-real-token")).state).toBe("unknown")
  })
})

describe("declining", () => {
  it("RELEASES the slot in the same write that cancels the round", async () => {
    seed()
    const out = await respondToBooking(TOKEN, "declined")
    expect(out).toBe("declined")
    const round = store.rounds[0]!
    expect(round.status).toBe("cancelled")
    expect(round.slot_id, "a cancelled round keeping slot_id holds that client window forever").toBeNull()
  })

  it("spends the token so a declined link cannot be replayed", async () => {
    seed()
    await respondToBooking(TOKEN, "declined")
    expect(store.rounds[0]!.booking_token_hash).toBeNull()
  })

  it("is not a withdrawal — it touches nothing about the candidate or the role", async () => {
    seed()
    await respondToBooking(TOKEN, "declined")
    const touched = store.updates.map((u) => u.table)
    expect(touched).not.toContain("candidates")
    expect(touched).not.toContain("job_roles")
    const audit = store.audit[0]!
    expect(String(audit.action)).toBe("booking_declined")
    expect(String(audit.action)).not.toMatch(/withdraw/i)
  })

  it("tells the recruiter, rather than leaving them to notice", async () => {
    seed()
    await respondToBooking(TOKEN, "declined")
    expect(store.notified).toHaveLength(1)
    expect(store.notified[0]!.kind).toBe("booking_answered")
  })
})

describe("confirming", () => {
  it("keeps the slot and does not cancel anything", async () => {
    seed()
    const out = await respondToBooking(TOKEN, "confirmed")
    expect(out).toBe("confirmed")
    expect(store.rounds[0]!.status).toBe("scheduled")
    expect(store.rounds[0]!.slot_id).toBe("slot-1")
  })

  it("records when they answered", async () => {
    seed()
    await respondToBooking(TOKEN, "confirmed")
    expect(store.rounds[0]!.candidate_responded_at).toBeTruthy()
  })
})

describe("clicking twice", () => {
  it("a repeat of the same answer is not a change of mind", async () => {
    seed({ candidate_response: "confirmed" })
    expect(await respondToBooking(TOKEN, "confirmed")).toBe("confirmed")
    expect(store.audit, "a second tap must not write a second audit row").toHaveLength(0)
  })

  it("a cancelled round says so rather than accepting an answer", async () => {
    seed({ status: "cancelled", candidate_response: "pending" })
    expect(await respondToBooking(TOKEN, "confirmed")).toBe("gone")
  })

  it("an unknown token is refused", async () => {
    seed()
    expect(await respondToBooking("nope", "confirmed")).toBe("not_found")
  })
})
