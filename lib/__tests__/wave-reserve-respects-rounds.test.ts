/**
 * A declined candidate is never invited to another round.
 *
 * 20 September 2026, found by walking the loop. Round 1 written up, CAN-21
 * declined, CAN-12 and CAN-17 advanced. Offering windows for round 2 created
 * invitations for **CAN-12 and CAN-21** — and none for CAN-17.
 *
 * `getWaveState` built the reserve from `client_actions` where action =
 * 'interview' — the SHORTLIST choice, made before any round existed — minus
 * anyone holding a live `scheduled` round. After round 1 every round is
 * `completed`, so nothing was filtered: the reserve became everyone
 * originally chosen, in shortlist order (CAN-12, CAN-21, CAN-17), and the two
 * available windows released the first two of them.
 *
 * So a person told "not for this role" received another interview
 * invitation, with a booking token, while somebody who had been advanced got
 * nothing. It is the same mistake as the setup form's — the shortlist choice
 * standing in for the round decision — except here it creates rows.
 *
 * Hold is excluded too, for the reason this module's own header already gives
 * about shortlist holds: it is a deliberate "not now", and releasing it
 * automatically overrides the judgement the client just recorded.
 *
 * Somebody with NO round decision stays in the reserve — that is what makes
 * wave one work, since the first invitation has no prior round to consult.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"

const { rounds, slots, taken, decisions, actions } = vi.hoisted(() => ({
  rounds: vi.fn(),
  slots: vi.fn(),
  taken: vi.fn(),
  decisions: vi.fn(),
  actions: vi.fn(),
}))

/**
 * The two reads of `interview_rounds` differ by their filters, so the mock
 * tells them apart by what is asked rather than answering the same way twice
 * — a mock that ignores the filter it is handed agrees with wrong code.
 */
vi.mock("@/lib/agency/db", () => {
  const make = (table: string) => {
    const state = { selected: "" }
    const api: Record<string, unknown> = {}
    const self = () => api
    api.eq = self
    api.is = self
    api.gt = self
    api.neq = self
    api.not = self
    api.select = (cols: string) => {
      state.selected = cols
      return api
    }
    const resolve = () => {
      if (table === "availability_slots") return slots()
      if (table === "round_decisions") return decisions()
      if (table === "client_actions") return actions()
      // interview_rounds, twice: the "taken" read asks only for slot_id.
      return state.selected.trim() === "slot_id" ? taken() : rounds()
    }
    api.order = () => Promise.resolve(resolve())
    api.then = (res: (v: unknown) => unknown) => Promise.resolve(resolve()).then(res)
    return api
  }
  return { agencyAdmin: () => ({ from: make }), writeAudit: vi.fn() }
})
vi.mock("@/lib/agency/cohort", () => ({ inviteCohort: vi.fn() }))
vi.mock("@/lib/agency/interview-settings", () => ({
  getInterviewSettings: async () => ({ settings: { waveSize: null, waveReleaseHours: 24 } }),
}))

import { getWaveState } from "@/lib/agency/waves"

const ROLE = "role1"
/** Round 1 completed for all three — nobody holds a live round. */
const completedRound1 = [
  { candidate_id: "id-12", slot_id: "s1", status: "completed", created_at: "2026-09-20T13:00:00Z" },
  { candidate_id: "id-21", slot_id: "s2", status: "completed", created_at: "2026-09-20T15:00:00Z" },
  { candidate_id: "id-17", slot_id: "s3", status: "completed", created_at: "2026-09-20T19:00:00Z" },
]
/** Shortlist order, which is the order the reserve keeps. */
const chosenAtShortlist = [
  { candidate_ref: "CAN-12", candidate_id: "id-12", created_at: "2026-09-19T10:00:00Z" },
  { candidate_ref: "CAN-21", candidate_id: "id-21", created_at: "2026-09-19T10:00:01Z" },
  { candidate_ref: "CAN-17", candidate_id: "id-17", created_at: "2026-09-19T10:00:02Z" },
]
const decision = (candidateId: string, d: string, at: string) => ({
  decision: d,
  created_at: at,
  interview_rounds: { candidate_id: candidateId, role_id: ROLE },
})

beforeEach(() => {
  for (const m of [rounds, slots, taken, decisions, actions]) m.mockReset()
  rounds.mockReturnValue({ data: completedRound1, error: null })
  slots.mockReturnValue({ data: [{ id: "free1", role_id: ROLE }, { id: "free2", role_id: ROLE }], error: null })
  taken.mockReturnValue({ data: [], error: null })
  actions.mockReturnValue({ data: chosenAtShortlist, error: null })
  decisions.mockReturnValue({ data: [], error: null })
})

describe("the reserve after round one", () => {
  it("drops the declined candidate and keeps the advanced one", async () => {
    decisions.mockReturnValue({
      data: [
        decision("id-12", "advance", "2026-09-20T20:00:00Z"),
        decision("id-21", "decline", "2026-09-20T20:01:00Z"),
        decision("id-17", "advance", "2026-09-20T20:02:00Z"),
      ],
      error: null,
    })
    const state = await getWaveState("a1", ROLE)
    // The exact bug: CAN-21 was invited and CAN-17 was not.
    expect(state.reserve).toEqual(["CAN-12", "CAN-17"])
    expect(state.reserve).not.toContain("CAN-21")
  })

  it("leaves a held candidate out — hold is a deliberate not-now", async () => {
    decisions.mockReturnValue({
      data: [
        decision("id-12", "advance", "2026-09-20T20:00:00Z"),
        decision("id-21", "hold", "2026-09-20T20:01:00Z"),
        decision("id-17", "advance", "2026-09-20T20:02:00Z"),
      ],
      error: null,
    })
    const state = await getWaveState("a1", ROLE)
    expect(state.reserve).toEqual(["CAN-12", "CAN-17"])
  })

  it("honours only the LATEST decision, because a client may change their mind", async () => {
    decisions.mockReturnValue({
      data: [
        decision("id-21", "decline", "2026-09-20T20:00:00Z"),
        decision("id-21", "advance", "2026-09-20T21:00:00Z"),
      ],
      error: null,
    })
    const state = await getWaveState("a1", ROLE)
    expect(state.reserve).toContain("CAN-21")
  })

  it("keeps everyone when no round has been decided — wave one is not a special case", async () => {
    decisions.mockReturnValue({ data: [], error: null })
    const state = await getWaveState("a1", ROLE)
    expect(state.reserve).toEqual(["CAN-12", "CAN-21", "CAN-17"])
  })

  it("still excludes anyone holding a live invitation", async () => {
    rounds.mockReturnValue({
      data: [{ candidate_id: "id-12", slot_id: null, status: "scheduled", created_at: "2026-09-20T22:00:00Z" }],
      error: null,
    })
    const state = await getWaveState("a1", ROLE)
    expect(state.reserve).not.toContain("CAN-12")
  })
})

describe("the decision read is scoped", () => {
  const src = tsCode(readFileSync(join(process.cwd(), "lib/agency/waves.ts"), "utf8"))

  it("joins through interview_rounds so one role's decisions cannot leak into another", () => {
    // A candidate may sit on two roles; a decision belongs to a round.
    expect(src).toContain('interview_rounds!inner(candidate_id, role_id)')
    expect(src).toContain('.eq("interview_rounds.role_id", roleId)')
  })
})
