/**
 * References and the handover pack — the end of the loop.
 *
 * What matters here:
 *   1. A referee is a third party who never asked to be involved, so the
 *      fair-processing notice goes out WITH the request and `notice_sent_at`
 *      cannot claim otherwise.
 *   2. The handover snapshot is frozen. Gaps are stated plainly rather than
 *      omitted, and an outstanding reference stays visibly outstanding — an
 *      employer inheriting this person is entitled to both.
 *   3. The confidentiality footer survives. It has been dropped once already
 *      during a layout rebuild, on the client document.
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

import { requestReference, recordReference } from "../agency/references"
import { generateHandoverPack, HANDOVER_FOOTER } from "../agency/handover"
import { AgencyAccessError } from "../agency/db"
import type { AgencyContext } from "../agency/types"

const CTX: AgencyContext = { agencyId: "agency-1", userId: "rec-1", role: "owner" }
const TOKEN = "b".repeat(32)

function table(result: unknown, capture?: (payload: unknown) => void) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "is", "not", "neq", "order", "limit"]) chain[m] = () => chain
  chain.insert = (p: unknown) => {
    capture?.(p)
    return chain
  }
  chain.update = (p: unknown) => {
    capture?.(p)
    return chain
  }
  chain.single = () => Promise.resolve(result)
  chain.maybeSingle = () => Promise.resolve(result)
  chain.then = (r: (v: unknown) => unknown) => r(result)
  return chain
}

beforeEach(() => vi.clearAllMocks())

describe("requestReference", () => {
  const REF = {
    id: "ref-1",
    agency_id: "agency-1",
    candidate_id: "cand-1",
    referee_name: "Dr Sarah Lindqvist",
    referee_email: "s@example.com",
    status: "drafted",
    notice_sent_at: null,
  }

  it("stamps notice_sent_at with the first request — the notice is the email", async () => {
    let patch: Record<string, unknown> = {}
    admin.from.mockImplementation((t: string) => {
      if (t === "candidate_references")
        return table({ data: REF, error: null }, (p) => (patch = p as Record<string, unknown>))
      if (t === "candidates") return table({ data: { full_name: "Amara", ref: "CAN-02" }, error: null })
      if (t === "agencies") return table({ data: { name: "Halcyon" }, error: null })
      return table({ data: null, error: null })
    })
    await requestReference(CTX, "ref-1")
    expect(patch.notice_sent_at).toBeTruthy()
    expect(patch.status).toBe("requested")
  })

  it("a chase does not re-stamp the notice — it is not a new one", async () => {
    let patch: Record<string, unknown> = {}
    const already = "2026-08-01T00:00:00.000Z"
    admin.from.mockImplementation((t: string) => {
      if (t === "candidate_references")
        return table(
          { data: { ...REF, status: "requested", notice_sent_at: already }, error: null },
          (p) => (patch = p as Record<string, unknown>)
        )
      if (t === "candidates") return table({ data: { full_name: "A", ref: "CAN-02" }, error: null })
      return table({ data: null, error: null })
    })
    const res = await requestReference(CTX, "ref-1")
    expect(res.isChase).toBe(true)
    expect(patch.notice_sent_at).toBe(already)
    expect(patch.status).toBe("chasing")
  })

  it("will not re-ask a referee who declined", async () => {
    admin.from.mockImplementation(() => table({ data: { ...REF, status: "declined" }, error: null }))
    await expect(requestReference(CTX, "ref-1")).rejects.toThrow(/declined/)
  })

  it("keeps the referee's name and address out of the audit row", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "candidate_references") return table({ data: REF, error: null })
      if (t === "candidates") return table({ data: { full_name: "A", ref: "CAN-02" }, error: null })
      return table({ data: null, error: null })
    })
    await requestReference(CTX, "ref-1")
    const entry = JSON.stringify(writeAudit.mock.calls[0]?.[1] ?? {})
    expect(entry).not.toContain("s@example.com")
    expect(entry).not.toContain("Lindqvist")
  })
})

describe("recordReference", () => {
  it("spends the token so a reply link cannot be reused", async () => {
    let patch: Record<string, unknown> = {}
    admin.from.mockImplementation(() =>
      table(
        { data: { id: "ref-1", agency_id: "agency-1", candidate_id: "cand-1", candidate_ref: "CAN-02", status: "requested" }, error: null },
        (p) => (patch = p as Record<string, unknown>)
      )
    )
    await recordReference(TOKEN, { answers: [{ key: "Q1", question: "How long?", answer: "3 years" }] })
    expect(patch.request_token_hash).toBeNull()
    expect(patch.status).toBe("received")
  })

  it("records a refusal as a state — silence and refusal are different", async () => {
    let patch: Record<string, unknown> = {}
    admin.from.mockImplementation(() =>
      table(
        { data: { id: "ref-1", agency_id: "agency-1", candidate_id: "cand-1", candidate_ref: "CAN-02", status: "requested" }, error: null },
        (p) => (patch = p as Record<string, unknown>)
      )
    )
    const res = await recordReference(TOKEN, { decline: true })
    expect(res?.declined).toBe(true)
    expect(patch.status).toBe("declined")
  })

  it("returns null for an already-answered reference", async () => {
    admin.from.mockImplementation(() =>
      table({ data: { id: "ref-1", agency_id: "agency-1", candidate_id: "c", candidate_ref: "", status: "received" }, error: null })
    )
    expect(await recordReference(TOKEN, { answers: [] })).toBeNull()
  })
})

describe("generateHandoverPack", () => {
  function wire(evidence: unknown[]) {
    admin.from.mockImplementation((t: string) => {
      if (t === "job_roles")
        return table({ data: { id: "role-1", ref: "ROL-2402", title: "SDE", company: "Meridian", location: "Leeds" }, error: null })
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", full_name: "Amara Okafor", role_id: "role-1" }, error: null })
      if (t === "agencies") return table({ data: { name: "Halcyon" }, error: null })
      if (t === "requirements")
        return table({
          data: [
            { id: "r1", ref: "R01", text: "Kafka at production scale", weight: "must" },
            { id: "r2", ref: "R02", text: "NHS data standards", weight: "important" },
          ],
          error: null,
        })
      if (t === "candidate_evidence") return table({ data: evidence, error: null })
      if (t === "interview_rounds") return table({ data: [], error: null })
      if (t === "candidate_references") return table({ data: [], error: null })
      if (t === "handover_packs") return table({ data: { id: "pack-1" }, error: null })
      return table({ data: [], error: null })
    })
  }

  it("states gaps plainly instead of omitting them", async () => {
    wire([
      { requirement_id: "r1", strength: "strong", quote: "Ran the bus", source_cite: "R1", origin: "interview" },
      { requirement_id: "r2", strength: "missing", quote: null, source_cite: "", origin: "cv" },
    ])
    const { snapshot } = await generateHandoverPack(CTX, { roleId: "role-1", candidateId: "cand-1" })
    expect(snapshot.evidence).toHaveLength(1)
    expect(snapshot.gaps).toEqual([{ requirement: "NHS data standards", weight: "important" }])
  })

  it("carries the confidentiality footer — it has been dropped once before", async () => {
    wire([])
    const { snapshot } = await generateHandoverPack(CTX, { roleId: "role-1", candidateId: "cand-1" })
    expect(snapshot.footer).toBe(HANDOVER_FOOTER)
    expect(snapshot.footer).toMatch(/auto-rejected/)
  })

  it("refuses a candidate who is not on that role", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "job_roles") return table({ data: { id: "role-1", ref: "ROL-2402" }, error: null })
      if (t === "candidates")
        return table({ data: { id: "cand-1", ref: "CAN-02", role_id: "role-OTHER" }, error: null })
      return table({ data: null, error: null })
    })
    await expect(
      generateHandoverPack(CTX, { roleId: "role-1", candidateId: "cand-1" })
    ).rejects.toBeInstanceOf(AgencyAccessError)
  })

  it("refuses viewers before touching the database", async () => {
    admin.from.mockImplementation(() => table({ data: null, error: null }))
    await expect(
      generateHandoverPack({ ...CTX, role: "viewer" }, { roleId: "r", candidateId: "c" })
    ).rejects.toBeInstanceOf(AgencyAccessError)
    expect(admin.from).not.toHaveBeenCalled()
  })
})
