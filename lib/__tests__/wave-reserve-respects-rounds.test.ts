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
    const state = { selected: "", inCol: "", inVals: [] as string[] }
    const api: Record<string, unknown> = {}
    const self = () => api
    api.eq = self
    api.is = self
    api.gt = self
    api.neq = self
    api.not = self
    api.in = (col: string, vals: string[]) => {
      state.inCol = col
      state.inVals = vals
      return api
    }
    api.select = (cols: string) => {
      state.selected = cols
      return api
    }
    const resolve = () => {
      if (table === "availability_slots") return slots()
      if (table === "round_decisions") return decisions()
      if (table === "job_roles") return { data: { planned_rounds: planned.value }, error: null }
      if (table === "submissions") return { data: [{ id: "sub-this-role" }], error: null }
      if (table === "submission_recipients") return { data: [{ id: "rec-this-role" }], error: null }
      if (table === "client_actions") {
        // Implements the filter it is handed: only this role's recipients.
        const all = actions() as { data: Array<Record<string, unknown>>; error: null }
        const rows = state.inCol === "recipient_id" ? all.data.filter((r) => state.inVals.includes(r.recipient_id as string)) : all.data
        return { data: rows, error: null }
      }
      // interview_rounds, twice: the "taken" read asks only for slot_id.
      return state.selected.trim() === "slot_id" ? taken() : rounds()
    }
    api.order = () => Promise.resolve(resolve())
    api.maybeSingle = () => Promise.resolve(resolve())
    api.then = (res: (v: unknown) => unknown) => Promise.resolve(resolve()).then(res)
    return api
  }
  return { agencyAdmin: () => ({ from: make }), writeAudit: vi.fn() }
})
vi.mock("@/lib/agency/cohort", () => ({ inviteCohort: vi.fn() }))
vi.mock("@/lib/agency/interview-settings", () => ({
  getInterviewSettings: async () => ({ settings: { waveSize: null, waveReleaseHours: 24, minNoticeHours: 24, durationMinutes: 45 } }),
}))

import { getWaveState } from "@/lib/agency/waves"

const ROLE = "role1"
/** Round 1 completed for all three — nobody holds a live round. */
const completedRound1 = [
  { id: "r1-12", candidate_id: "id-12", round_number: 1, slot_id: "s1", status: "completed", created_at: "2026-09-20T13:00:00Z" },
  { id: "r1-21", candidate_id: "id-21", round_number: 1, slot_id: "s2", status: "completed", created_at: "2026-09-20T15:00:00Z" },
  { id: "r1-17", candidate_id: "id-17", round_number: 1, slot_id: "s3", status: "completed", created_at: "2026-09-20T19:00:00Z" },
]
/** planned_rounds on the role; tests that care set it. */
const planned = { value: 2 as number | null }
/** Shortlist order, which is the order the reserve keeps. */
const chosenAtShortlist = [
  { candidate_ref: "CAN-12", candidate_id: "id-12", recipient_id: "rec-this-role", created_at: "2026-09-19T10:00:00Z" },
  { candidate_ref: "CAN-21", candidate_id: "id-21", recipient_id: "rec-this-role", created_at: "2026-09-19T10:00:01Z" },
  { candidate_ref: "CAN-17", candidate_id: "id-17", recipient_id: "rec-this-role", created_at: "2026-09-19T10:00:02Z" },
]
const decision = (candidateId: string, d: string, at: string) => ({
  round_id: `r1-${candidateId.replace("id-", "")}`,
  decision: d,
  created_at: at,
  interview_rounds: { candidate_id: candidateId, role_id: ROLE },
})

beforeEach(() => {
  planned.value = 2
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

  it("a written-up round with NO decision yet is not an advance — nobody is invited onward", async () => {
    // 21 Sep 2026: the old rule read "no decline or hold" as "go", so writing
    // up round 1 made everyone due a round-2 invite before the client decided.
    decisions.mockReturnValue({ data: [], error: null })
    const state = await getWaveState("a1", ROLE)
    expect(state.reserve).toEqual([])
  })

  it("wave one: chosen with no round yet is in the reserve", async () => {
    rounds.mockReturnValue({ data: [], error: null })
    const state = await getWaveState("a1", ROLE)
    expect(state.reserve).toEqual(["CAN-12", "CAN-21", "CAN-17"])
  })

  it("advanced after the FINAL planned round goes to close-out, not another round", async () => {
    planned.value = 1
    decisions.mockReturnValue({
      data: [decision("id-12", "advance", "2026-09-20T20:00:00Z")],
      error: null,
    })
    const state = await getWaveState("a1", ROLE)
    expect(state.reserve).not.toContain("CAN-12")
  })

  it("a missing plan is two rounds, never zero", async () => {
    planned.value = null
    decisions.mockReturnValue({
      data: [decision("id-12", "advance", "2026-09-20T20:00:00Z")],
      error: null,
    })
    const state = await getWaveState("a1", ROLE)
    expect(state.reserve).toContain("CAN-12")
  })

  it("still excludes anyone holding a live invitation", async () => {
    rounds.mockReturnValue({
      data: [{ id: "r2-12", candidate_id: "id-12", round_number: 2, slot_id: null, status: "scheduled", created_at: "2026-09-20T22:00:00Z" }],
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

describe("the reserve is this role's, not the agency's", () => {
  it("ignores another role's interview choices, though its refs look the same", async () => {
    // 21 Sep 2026, live demo: ROL-2418's wave read ROL-2417's older choices
    // first — refs repeat across roles — found none on ROL-2418, invited nobody.
    rounds.mockReturnValue({ data: [], error: null })
    actions.mockReturnValue({
      data: [
        { candidate_ref: "CAN-12", candidate_id: "other-12", recipient_id: "rec-other-role", created_at: "2026-09-19T10:00:00Z" },
        { candidate_ref: "CAN-01", candidate_id: "id-01", recipient_id: "rec-this-role", created_at: "2026-09-21T17:10:00Z" },
        { candidate_ref: "CAN-02", candidate_id: "id-02", recipient_id: "rec-this-role", created_at: "2026-09-21T17:10:01Z" },
      ],
      error: null,
    })
    const state = await getWaveState("agency1", ROLE)
    expect(state.reserve).toEqual(["CAN-01", "CAN-02"])
  })
})
