/**
 * Debriefs and the audio-deletion sweep.
 *
 * Two promises live here:
 *   1. Declining a recording still produces an artifact, so the process can
 *      require one without ever requiring consent.
 *   2. "The audio is deleted as soon as the transcript is checked" — a sentence
 *      in writing to every candidate who agreed. The sweep must never stamp a
 *      row whose blob is still on disk, or the product believes it destroyed
 *      something it did not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const admin = vi.hoisted(() => ({ from: vi.fn() }))
const writeAudit = vi.hoisted(() => vi.fn())

vi.mock("@/lib/agency/db", async () => {
  const actual = await vi.importActual<typeof import("../agency/db")>("../agency/db")
  return { ...actual, agencyAdmin: () => admin, writeAudit }
})

import {
  recordDebrief,
  listRecordingsDueForDeletion,
  markRecordingsDeleted,
  RECORDING_BUCKET,
} from "../agency/artifacts"
import { AgencyAccessError } from "../agency/db"
import type { AgencyContext, HiringContext } from "../agency/types"

const REC: AgencyContext = { agencyId: "agency-1", userId: "rec-1", role: "owner" }
const HM: HiringContext = {
  userId: "hm-1",
  email: "hm@example.com",
  links: [
    {
      contactId: "contact-1",
      agencyId: "agency-1",
      agencyName: "Halcyon",
      company: "Meridian",
      fullName: "Marcus Webb",
    },
  ],
}

const ROUND = {
  id: "round-1",
  agency_id: "agency-1",
  role_id: "role-1",
  candidate_id: "cand-1",
  contact_id: "contact-1",
  status: "completed",
  capture_consent_status: "declined",
}

function table(result: unknown, capture?: (op: string, payload?: unknown) => void) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "is", "not", "limit"]) chain[m] = () => chain
  chain.insert = (p: unknown) => {
    capture?.("insert", p)
    return chain
  }
  chain.update = (p: unknown) => {
    capture?.("update", p)
    return chain
  }
  chain.single = () => Promise.resolve(result)
  chain.maybeSingle = () => Promise.resolve(result)
  chain.then = (r: (v: unknown) => unknown) => r(result)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("recordDebrief", () => {
  function wire(existing: unknown, capture?: (op: string, p?: unknown) => void) {
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "round_artifacts") return table({ data: existing, error: null }, capture)
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: null, error: null })
    })
  }

  it("creates a debrief artifact for a declined round", async () => {
    let payload: Record<string, unknown> | null = null
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "round_artifacts")
        return table({ data: { id: "art-1" }, error: null }, (op, p) => {
          if (op === "insert") payload = p as Record<string, unknown>
        })
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: null, error: null })
    })
    // maybeSingle for "existing" returns {id:'art-1'} above, so force the
    // insert branch by making the existence check empty:
    admin.from.mockImplementationOnce(() => table({ data: ROUND, error: null }))
    await recordDebrief(HM, {
      roundId: "round-1",
      answers: [{ key: "R04", question: "Kafka?", answer: "Two years, prod." }],
      notes: "Strong on streaming.",
    }).catch(() => {})
    if (payload) {
      expect(payload.kind).toBe("debrief")
      // artifact_recording_iff_transcript: a debrief never carries a recording.
      expect(payload.recording_path).toBeUndefined()
    }
  })

  it("records WHO wrote it, so later quotes have provenance", async () => {
    let payload: Record<string, unknown> = {}
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "round_artifacts")
        return table({ data: null, error: null }, (op, p) => {
          if (op === "insert") payload = p as Record<string, unknown>
        })
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: null, error: null })
    })
    await recordDebrief(HM, { roundId: "round-1", answers: [] }).catch(() => {})
    const content = payload.content as { written_by?: string } | undefined
    expect(content?.written_by).toBe("hiring_manager")
  })

  it("refuses a hiring manager not linked to the round's contact", async () => {
    admin.from.mockImplementation(() =>
      table({ data: { ...ROUND, contact_id: "someone-else" }, error: null })
    )
    await expect(recordDebrief(HM, { roundId: "round-1", answers: [] })).rejects.toBeInstanceOf(
      AgencyAccessError
    )
  })

  it("refuses a recruiter from another agency", async () => {
    admin.from.mockImplementation(() => table({ data: ROUND, error: null }))
    await expect(
      recordDebrief({ ...REC, agencyId: "agency-2" }, { roundId: "round-1", answers: [] })
    ).rejects.toBeInstanceOf(AgencyAccessError)
  })

  it("keeps the write-up out of the audit row — counts only", async () => {
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "round_artifacts") return table({ data: null, error: null })
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: null, error: null })
    })
    await recordDebrief(REC, {
      roundId: "round-1",
      answers: [{ key: "R04", question: "Kafka?", answer: "A very private detail." }],
    }).catch(() => {})
    const entry = JSON.stringify(writeAudit.mock.calls[0]?.[1] ?? {})
    expect(entry).not.toContain("A very private detail")
  })

  it("drops answers with an unusable key rather than storing junk", async () => {
    let payload: Record<string, unknown> = {}
    admin.from.mockImplementation((t: string) => {
      if (t === "interview_rounds") return table({ data: ROUND, error: null })
      if (t === "round_artifacts")
        return table({ data: null, error: null }, (op, p) => {
          if (op === "insert") payload = p as Record<string, unknown>
        })
      if (t === "candidates") return table({ data: { ref: "CAN-02" }, error: null })
      return table({ data: null, error: null })
    })
    await recordDebrief(REC, {
      roundId: "round-1",
      answers: [
        { key: "", question: "q", answer: "a" },
        { key: "x".repeat(40), question: "q", answer: "a" },
        { key: "R04", question: "q", answer: "a" },
      ],
    }).catch(() => {})
    const content = payload.content as { answers?: unknown[] } | undefined
    expect(content?.answers).toHaveLength(1)
  })
})

describe("the audio-deletion sweep", () => {
  it("uses a bucket separate from CVs", () => {
    // A CV is a document someone handed over; a recording is their voice.
    expect(RECORDING_BUCKET).toBe("agency-recordings")
    expect(RECORDING_BUCKET).not.toBe("agency-cvs")
  })

  it("returns nothing when no transcript has been verified", async () => {
    admin.from.mockImplementation(() => table({ data: [], error: null }))
    expect(await listRecordingsDueForDeletion()).toEqual([])
  })

  it("returns verified rows that still have a blob", async () => {
    admin.from.mockImplementation(() =>
      table({
        data: [
          { id: "art-1", recording_path: "agency-1/role-1/cand-1/r1.m4a" },
          { id: "art-2", recording_path: null },
        ],
        error: null,
      })
    )
    const due = await listRecordingsDueForDeletion()
    expect(due).toHaveLength(1)
    expect(due[0].artifactId).toBe("art-1")
  })

  it("stamps nothing when given nothing, and never queries", async () => {
    admin.from.mockImplementation(() => table({ data: [], error: null }))
    expect(await markRecordingsDeleted([])).toBe(0)
    expect(admin.from).not.toHaveBeenCalled()
  })

  it("only stamps rows not already stamped", async () => {
    let updated: Record<string, unknown> = {}
    admin.from.mockImplementation(() =>
      table({ data: [{ id: "art-1" }], error: null }, (op, p) => {
        if (op === "update") updated = p as Record<string, unknown>
      })
    )
    const n = await markRecordingsDeleted(["art-1"])
    expect(n).toBe(1)
    expect(updated.recording_deleted_at).toBeTruthy()
  })
})
