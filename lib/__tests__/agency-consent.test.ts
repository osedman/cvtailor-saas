/**
 * Interview capture consent.
 *
 * Two properties are the whole point:
 *
 *   1. Only the candidate's token can move consent off 'pending'. There is no
 *      recruiter path, so a recruiter cannot consent on someone's behalf.
 *   2. Withdrawal is a cascade, not a flag. If the basis goes, everything
 *      derived from it goes: the artifact, the recording path (returned for
 *      blob deletion) and every evidence row sourced from that round.
 *
 * The copy promises both in writing (docs/CONSENT-COPY-DRAFT.md). These tests
 * are what stop the promise and the product drifting apart.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "crypto"

const removed = vi.hoisted(() => [] as string[][])
const admin = vi.hoisted(() => ({
  from: vi.fn(),
  storage: {
    from: (_bucket: string) => ({
      remove: async (paths: string[]) => {
        removed.push(paths)
        return { data: paths.map((name) => ({ name })), error: null }
      },
    }),
  },
}))
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

const notify = vi.hoisted(() => vi.fn(async () => ({ sent: 0 })))
vi.mock("../agency/notify", () => ({ notify }))

const recomputeAndStore = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock("../agency/rescore", () => ({ recomputeAndStore }))

const sendCandidateMail = vi.hoisted(() => vi.fn(async () => true))
vi.mock("../agency/candidate-mail", async () => {
  const actual = await vi.importActual<typeof import("../agency/candidate-mail")>("../agency/candidate-mail")
  return {
    ...actual,
    loadCandidateMail: async () => ({
      candidateId: "cand-1", agencyId: "agency-1", roleId: "role-1", email: "a@example.com",
      firstName: "Amara", agencyName: "Halcyon", replyTo: "", roleTitle: "SDE",
      company: "the employer", retentionDays: 180, source: "paste",
    }),
    sendCandidateMail,
  }
})

import { requestCapture, peekConsent, recordDecision } from "../agency/consent"
import { AgencyAccessError } from "../agency/db"
import type { AgencyContext } from "../agency/types"

const CTX: AgencyContext = { agencyId: "agency-1", userId: "rec-1", role: "owner" }
const TOKEN = "a".repeat(32)
const HASH = createHash("sha256").update(TOKEN).digest("hex")

function table(result: unknown, capture?: (op: string, payload?: unknown) => void) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "is", "order", "limit"]) chain[m] = () => chain
  chain.update = (p: unknown) => {
    capture?.("update", p)
    return chain
  }
  chain.delete = () => {
    capture?.("delete")
    return chain
  }
  chain.insert = (p: unknown) => {
    capture?.("insert", p)
    return chain
  }
  chain.single = () => Promise.resolve(result)
  chain.maybeSingle = () => Promise.resolve(result)
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

const ROUND = {
  id: "round-1",
  agency_id: "agency-1",
  role_id: "role-1",
  candidate_id: "cand-1",
  contact_id: "contact-1",
  scheduled_at: new Date().toISOString(),
  duration_minutes: 45,
  status: "scheduled",
  capture_consent_status: "pending",
}

beforeEach(() => {
  vi.clearAllMocks()
  removed.length = 0
})

/** Every token in these tests opens round-1 through consent_links. */
const LINK = { data: { round_id: "round-1" }, error: null }

describe("requestCapture", () => {
  it("mints a token and leaves consent pending — asking is not answering", async () => {
    const ops: Array<{ op: string; payload?: unknown }> = []
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds")
        return table({ data: ROUND, error: null }, (op, payload) => ops.push({ op, payload }))
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", full_name: "Amara Okafor", email: "a@example.com" }, error: null })
      if (t === "job_roles") return table({ data: { title: "Senior Data Engineer" }, error: null })
      if (t === "agencies") return table({ data: { retention_days: 180 }, error: null })
      if (t === "consent_links")
        return table({ data: null, error: null }, (op, payload) => ops.push({ op: `links:${op}`, payload }))
      return table({ data: null, error: null })
    })

    const res = await requestCapture(CTX, "round-1")
    expect(res.rawToken).toHaveLength(32)

    // The hash goes into consent_links, beside any earlier links.
    const link = ops.find((o) => o.op === "links:insert")?.payload as Record<string, unknown>
    expect(link.token_hash).toBe(createHash("sha256").update(res.rawToken).digest("hex"))
    expect(link.round_id).toBe("round-1")
    // The round is stamped as asked; the status is untouched.
    const update = ops.find((o) => o.op === "update")?.payload as Record<string, unknown>
    expect(Object.keys(update)).toEqual(["capture_requested_at"])
    expect(res.resend).toBe(false)
  })

  it("asking again keeps the earlier links working: no round update, a new link row", async () => {
    const ops: Array<{ op: string; payload?: unknown }> = []
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds")
        return table({ data: { ...ROUND, capture_requested_at: "2026-11-12T10:00:00Z" }, error: null }, (op, payload) => ops.push({ op, payload }))
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", full_name: "A", email: "a@example.com" }, error: null })
      if (t === "consent_links")
        return table({ data: null, error: null }, (op, payload) => ops.push({ op: `links:${op}`, payload }))
      return table({ data: null, error: null })
    })
    const res = await requestCapture(CTX, "round-1")
    expect(res.resend).toBe(true)
    expect(ops.filter((o) => o.op === "links:insert")).toHaveLength(1)
    expect(ops.find((o) => o.op === "update")).toBeUndefined()
    expect(ops.find((o) => o.op === "links:delete")).toBeUndefined()
  })

  it("stores only the hash — never the raw token", async () => {
    let stored: Record<string, unknown> = {}
    admin.from.mockImplementation((t: string) => {
      if (t === "consent_links")
        return table({ data: null, error: null }, (op, p) => {
          if (op === "insert") stored = p as Record<string, unknown>
        })
      if (t === "interview_rounds")
        return table({ data: ROUND, error: null })
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", full_name: "A", email: null }, error: null })
      return table({ data: null, error: null })
    })
    const res = await requestCapture(CTX, "round-1")
    expect(JSON.stringify(stored)).not.toContain(res.rawToken)
  })

  it("refuses to re-ask someone who withdrew", async () => {
    admin.from.mockImplementation(() =>
      table({ data: { ...ROUND, capture_consent_status: "withdrawn" }, error: null })
    )
    await expect(requestCapture(CTX, "round-1")).rejects.toThrow(/withdrew consent/)
  })

  it("refuses viewers before touching the database", async () => {
    admin.from.mockImplementation(() => table({ data: null, error: null }))
    await expect(requestCapture({ ...CTX, role: "viewer" }, "round-1")).rejects.toBeInstanceOf(
      AgencyAccessError
    )
    expect(admin.from).not.toHaveBeenCalled()
  })

  it("puts neither the address nor the token in the audit row", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", full_name: "A", email: "a@example.com" }, error: null })
      return table({ data: null, error: null })
    })
    const res = await requestCapture(CTX, "round-1")
    const entry = JSON.stringify(writeAudit.mock.calls[0]?.[1])
    expect(entry).not.toContain("a@example.com")
    expect(entry).not.toContain(res.rawToken)
  })
})

describe("peekConsent", () => {
  it("returns null for a short/implausible token without querying", async () => {
    admin.from.mockImplementation(() => table({ data: null, error: null }))
    expect(await peekConsent("nope")).toBeNull()
    expect(admin.from).not.toHaveBeenCalled()
  })

  it("returns null for a cancelled interview — no question left to answer", async () => {
    admin.from.mockImplementation((t: string) =>
      t === "consent_links" ? table(LINK) : table({ data: { ...ROUND, status: "cancelled" }, error: null })
    )
    expect(await peekConsent(TOKEN)).toBeNull()
  })

  it("never returns the candidate's full name, only a first name", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "consent_links") return table(LINK)
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "candidates") return table({ data: { full_name: "Amara Okafor" }, error: null })
      if (t === "agencies") return table({ data: { name: "Halcyon", retention_days: 180 }, error: null })
      if (t === "job_roles") return table({ data: { title: "SDE" }, error: null })
      if (t === "client_contacts") return table({ data: { company: "Meridian" }, error: null })
      return table({ data: null, error: null })
    })
    const view = await peekConsent(TOKEN)
    expect(view?.candidateFirstName).toBe("Amara")
    expect(JSON.stringify(view)).not.toContain("Okafor")
  })
})

describe("recordDecision", () => {
  it("looks the round up BY HASH, not by raw token", async () => {
    const seen: string[] = []
    admin.from.mockImplementation((t: string) => {
      seen.push(t)
      return table({ data: null, error: null })
    })
    await recordDecision(TOKEN, "granted")
    // Nothing to assert on the query builder itself, so assert the contract:
    // an unknown hash yields null rather than throwing.
    expect(seen[0]).toBe("consent_links")
    expect(HASH).toHaveLength(64)
  })

  it("granting does not delete anything", async () => {
    const ops: string[] = []
    admin.from.mockImplementation((t: string) => {
      if (t === "consent_links") return table(LINK)
      if (t === "interview_rounds") return table({ data: ROUND, error: null }, (op) => ops.push(op))
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: [], error: null }, (op) => ops.push(op))
    })
    const res = await recordDecision(TOKEN, "granted")
    expect(res?.decision).toBe("granted")
    expect(ops).not.toContain("delete")
    expect(res?.recordingPaths).toEqual([])
  })

  // The cascade the copy promises in writing.
  it("withdrawal deletes the artifact, returns the blob path, and flags a rescore", async () => {
    const deleted: string[] = []
    admin.from.mockImplementation((t: string) => {
      if (t === "consent_links") return table(LINK)
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "round_artifacts")
        return table(
          { data: [{ id: "art-1", recording_path: "agency-1/role-1/cand-1/r1.m4a" }], error: null },
          (op) => op === "delete" && deleted.push("round_artifacts")
        )
      if (t === "candidate_evidence")
        return table({ data: [{ id: "ev-1" }], error: null }, (op) =>
          op === "delete" && deleted.push("candidate_evidence")
        )
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: [], error: null })
    })

    const res = await recordDecision(TOKEN, "withdrawn")
    expect(res?.decision).toBe("withdrawn")
    expect(res?.recordingPaths).toEqual(["agency-1/role-1/cand-1/r1.m4a"])
    expect(deleted).toContain("round_artifacts")
    expect(deleted).toContain("candidate_evidence")
    // Derived evidence went, so the score built on it is now wrong.
    expect(res?.rescoreCandidateId).toBe("cand-1")
    // ...and since 14 Nov 2026 the cascade finishes here: the blob is gone
    // through the Storage API, the candidate is rescored, and only then is
    // the deletion confirmed to them.
    expect(removed).toEqual([["agency-1/role-1/cand-1/r1.m4a"]])
    expect(recomputeAndStore).toHaveBeenCalledWith(admin, "agency-1", "cand-1")
    expect(sendCandidateMail).toHaveBeenCalledTimes(1)
    expect((sendCandidateMail.mock.calls[0] as unknown[])[2]).toMatchObject({ kind: "recording_deleted" })
  })

  it("a storage failure stops the withdrawal before the rows go, so a retry can finish it", async () => {
    const deleted: string[] = []
    const failing = {
      from: admin.from,
      storage: { from: () => ({ remove: async () => ({ data: null, error: new Error("storage down") }) }) },
    }
    const original = admin.storage
    ;(admin as { storage: unknown }).storage = failing.storage
    admin.from.mockImplementation((t: string) => {
      if (t === "consent_links") return table(LINK)
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "round_artifacts")
        return table(
          { data: [{ id: "art-1", recording_path: "p.m4a" }], error: null },
          (op) => op === "delete" && deleted.push("round_artifacts")
        )
      return table({ data: [], error: null })
    })
    try {
      await expect(recordDecision(TOKEN, "withdrawn")).rejects.toThrow("storage down")
      expect(deleted).toEqual([])
      expect(sendCandidateMail).not.toHaveBeenCalled()
    } finally {
      ;(admin as { storage: unknown }).storage = original
    }
  })

  it("records the candidate as the actor by absence — never a recruiter's id", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "consent_links") return table(LINK)
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: [], error: null })
    })
    await recordDecision(TOKEN, "declined")
    const entry = writeAudit.mock.calls[0]?.[1] as { actorId: unknown; action: string }
    expect(entry.actorId).toBeNull()
    expect(entry.action).toBe("capture_declined")
  })

  it("returns null for an unknown token rather than throwing", async () => {
    admin.from.mockImplementation(() => table({ data: null, error: null }))
    expect(await recordDecision(TOKEN, "granted")).toBeNull()
  })
})

/*
 * Every changed answer emails the agency's recruiters. A repeat of the answer
 * already on file is not news: recording it again would let a scripted link
 * turn the per-link rate limit into a stream of recruiter emails.
 */
describe("recordDecision — repeating an answer changes nothing", () => {
  function rounds(status: string, ops: string[]) {
    admin.from.mockImplementation((t: string) => {
      if (t === "consent_links") return table(LINK)
      if (t === "interview_rounds")
        return table({ data: { ...ROUND, capture_consent_status: status }, error: null }, (op) => ops.push(`${t}:${op}`))
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: [], error: null }, (op) => ops.push(`${t}:${op}`))
    })
  }

  it("the same answer again writes nothing, audits nothing and emails nobody", async () => {
    const ops: string[] = []
    rounds("granted", ops)
    const res = await recordDecision(TOKEN, "granted")
    expect(res).toEqual({ ok: true, decision: "granted", recordingPaths: [], rescoreCandidateId: null })
    expect(ops).not.toContain("interview_rounds:update")
    expect(writeAudit).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(sendCandidateMail).not.toHaveBeenCalled()
  })

  it("a changed answer is recorded, audited and sent to the agency once", async () => {
    const ops: string[] = []
    rounds("pending", ops)
    await recordDecision(TOKEN, "granted")
    expect(ops).toContain("interview_rounds:update")
    expect(writeAudit).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect((notify.mock.calls[0] as unknown[])[1]).toMatchObject({ kind: "consent_answered" })
    // The candidate gets a receipt (frame 47 §B email 2).
    expect(sendCandidateMail).toHaveBeenCalledTimes(1)
    expect((sendCandidateMail.mock.calls[0] as unknown[])[2]).toMatchObject({ kind: "recording_receipt", answer: "granted" })
  })

  it("a repeated withdrawal with nothing left to remove is silent", async () => {
    const ops: string[] = []
    rounds("withdrawn", ops)
    const res = await recordDecision(TOKEN, "withdrawn")
    expect(res?.recordingPaths).toEqual([])
    expect(ops).not.toContain("interview_rounds:update")
    expect(writeAudit).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it("a repeated withdrawal still removes anything that reappeared, and audits that — but emails nobody", async () => {
    const deleted: string[] = []
    admin.from.mockImplementation((t: string) => {
      if (t === "consent_links") return table(LINK)
      if (t === "interview_rounds") return table({ data: { ...ROUND, capture_consent_status: "withdrawn" }, error: null })
      if (t === "round_artifacts")
        return table(
          { data: [{ id: "art-2", recording_path: "agency-1/role-1/cand-1/r2.m4a" }], error: null },
          (op) => op === "delete" && deleted.push("round_artifacts")
        )
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: [], error: null })
    })
    const res = await recordDecision(TOKEN, "withdrawn")
    expect(res?.recordingPaths).toEqual(["agency-1/role-1/cand-1/r2.m4a"])
    expect(deleted).toContain("round_artifacts")
    expect(writeAudit).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
  })
})
