/**
 * The write-up is what completes a round.
 *
 * 20 Sep 2026, from a walk-through: an interview that had ended 82 minutes
 * earlier sat on the hiring manager's screen under "Coming up", above
 * "Needs your write-up or decision — Nothing owed."
 *
 * The cause was a dependency pointing the wrong way. A round became
 * 'completed' only when the RECRUITER pressed "Mark done", and the hiring
 * manager's owed list keyed off that status. But the recruiter is not in the
 * room — Tailr does not host or record the call — so their knowledge that it
 * happened is second-hand, learned from the hiring manager or the candidate.
 * The person with first-hand knowledge was blocked by the person without it.
 *
 * The fix is to remove the gate rather than make it more visible: writing the
 * round up IS first-hand testimony that it took place, and better evidence
 * than the click it was waiting for.
 *
 * WHAT IS DELIBERATELY NOT DONE: completing on elapsed time. The clock cannot
 * tell a finished interview from a no-show, and a completed round feeds the
 * handover pack that goes to an employer. The clock changes what a screen
 * OFFERS; only a person's act changes what the record SAYS.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const { roundRow, updates, artifactRow, candidateRow } = vi.hoisted(() => ({
  roundRow: vi.fn(),
  updates: vi.fn(),
  artifactRow: vi.fn(),
  candidateRow: vi.fn(),
}))

vi.mock("@/lib/agency/db", () => {
  const table = (name: string) => {
    const api: Record<string, unknown> = {}
    const self = () => api
    api.select = self
    api.eq = self
    api.maybeSingle = () => {
      if (name === "interview_rounds") return Promise.resolve(roundRow())
      if (name === "round_artifacts") return Promise.resolve(artifactRow())
      return Promise.resolve(candidateRow())
    }
    api.single = () => Promise.resolve({ data: { id: "art1" }, error: null })
    api.insert = () => api
    api.update = (patch: unknown) => {
      updates(name, patch)
      return api
    }
    api.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res)
    return api
  }
  return { agencyAdmin: () => ({ from: table }), writeAudit: vi.fn(), AgencyAccessError: class extends Error {} }
})
vi.mock("@/lib/agency/notify", () => ({ notify: vi.fn() }))

import { recordDebrief } from "@/lib/agency/artifacts"

const ctx = {
  userId: "u1",
  email: "hm@example.com",
  links: [{ contactId: "c1", agencyId: "a1" }],
} as never

function round(status: string) {
  return {
    data: {
      id: "r1",
      agency_id: "a1",
      role_id: "role1",
      candidate_id: "cand1",
      contact_id: "c1",
      status,
      capture_consent_status: "pending",
    },
    error: null,
  }
}

beforeEach(() => {
  roundRow.mockReset()
  updates.mockReset()
  artifactRow.mockReset()
  candidateRow.mockReset()
  artifactRow.mockReturnValue({ data: null, error: null })
  candidateRow.mockReturnValue({ data: { ref: "CAN-12" }, error: null })
})

/** Every patch written to interview_rounds during the call. */
const roundPatches = () =>
  updates.mock.calls.filter((c) => c[0] === "interview_rounds").map((c) => c[1])

describe("writing up a round completes it", () => {
  it("moves a scheduled round to completed, with nobody having pressed mark done", async () => {
    roundRow.mockReturnValue(round("scheduled"))
    await recordDebrief(ctx, { roundId: "r1", answers: [], notes: "They walked through the migration." })
    expect(roundPatches()).toContainEqual({ status: "completed" })
  })

  it("does not touch a round the recruiter already completed", async () => {
    roundRow.mockReturnValue(round("completed"))
    await recordDebrief(ctx, { roundId: "r1", answers: [], notes: "An edit." })
    expect(roundPatches()).toEqual([])
  })

  it("NEVER resurrects a cancelled round", async () => {
    // Writing up a round somebody cancelled must not quietly bring it back —
    // a cancelled round has had its slot released and its time given away.
    roundRow.mockReturnValue(round("cancelled"))
    await recordDebrief(ctx, { roundId: "r1", answers: [], notes: "Notes on a cancelled round." })
    expect(roundPatches()).toEqual([])
  })
})

describe("the screens read the clock, not a click", () => {
  // Since frame 23 the rules live in lib/agency/hm-room.ts and the shared
  // hook; the pages read them. Scanned together.
  const src = () =>
    ["lib/agency/hm-room.ts", "components/agency/hm-room.tsx", "app/hiring/roles/[roleId]/round/[n]/page.tsx", "app/hiring/diary/page.tsx", "app/hiring/page.tsx"]
      .map((f) => tsCode(readFileSync(join(process.cwd(), f), "utf8")))
      .join("\n")

  it("owed no longer waits for status completed alone", () => {
    // The exact shape of the bug: `status === "completed" && !latest_decision`
    // as the WHOLE definition of what a hiring manager owes.
    expect(src()).not.toMatch(/rounds\.filter\(\(r\) => r\.status === "completed" && !r\.latest_decision\)/)
    expect(src()).toMatch(/export function roundEnded\(r: HiringRound, now: number\)/)
    expect(src()).toMatch(/if \(r\.status === "cancelled" \|\| !roundEnded\(r, now\)\) return null/)
  })

  it("coming up means not yet started", () => {
    expect(src()).toContain("!roundStarted(r, now)")
  })

  it("the clock ticks, so a state can expire while the page is open", () => {
    // Without this, a hiring manager sitting on the page as an interview ends
    // goes on being told nothing is owed until they think to reload.
    expect(src()).toMatch(/setInterval\(\(\) => setNowMs\(Date\.now\(\)\)/)
  })

  it("tells the hiring manager the recruiter has not confirmed, without blocking them", () => {
    const s = src()
    expect(s).toContain("has not confirmed")
    // The write-up is still offered: the line is information, not a gate.
    expect(s).not.toMatch(/disabled=\{[^}]*notConfirmed/)
  })
})

describe("the recruiter can say it did not happen", () => {
  it("relabels cancel once the slot has passed", () => {
    const src = readFileSync(join(process.cwd(), "app/agencies/roles/[roleId]/interviews/page.tsx"), "utf8")
    expect(src).toContain("It didn't happen")
    expect(src).toContain("roundHasEnded(r, nowMs)")
    // Same state change either way — the label changes, the behaviour does not.
    expect(src).toContain('setStatus(r.id, "cancelled")')
  })
})

describe("the round card itself opens on the clock", () => {
  const card = () => readFileSync(join(process.cwd(), "components/agency/hm-shared.tsx"), "utf8")

  it("does not wait for the recruiter's status to offer the write-up", () => {
    // The filter and the card are two different places, and moving only the
    // filter produced the half-fixed screen: the owed band listed the round
    // and the card inside it still said "Scheduled · nothing to do until this
    // has happened" over an interview that had finished.
    expect(tsCode(card())).not.toMatch(/const canWrite = round\.status === "completed"\s*$/m)
    expect(card()).toContain("round.status === \"scheduled\" && hasEnded")
  })

  it("says happening now while a round is in the room", () => {
    expect(card()).toContain("Happening now")
    expect(card()).toContain("In the room now")
  })
})
