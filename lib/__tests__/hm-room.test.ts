/**
 * The hiring manager's three places — Figma frame 23 (22 Sep 2026).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { buildTodo, currentStage, owedOn, roomStages, stageHref, outcomeSentence, type RoleSummary } from "@/lib/agency/hm-room"
import type { HiringRound } from "@/lib/agency/types"
import { tsCode } from "./helpers/source-scan"

const NOW = Date.parse("2026-09-22T12:00:00Z")
const round = (p: Partial<HiringRound>): HiringRound => ({
  id: "r", agency_id: "a", contact_id: "c", role_id: "role-1", role_title: "Senior BA", planned_rounds: 2,
  candidate_ref: "CAN-01", round_number: 1, scheduled_at: "2026-09-21T09:00:00Z", duration_minutes: 45,
  meeting_url: "", status: "completed", has_debrief: true, latest_decision: null, latest_decision_at: null, ...p,
})
const role = (p: Partial<RoleSummary> = {}): RoleSummary => ({ id: "role-1", ref: "ROL-2418", title: "Senior BA", subStateKey: "round-to-book", mode: "wait", nextTitle: "", ...p })

describe("To do: one row per thing owed, not per role", () => {
  it("an owed write-up shows even while the ladder calls the role a wait", () => {
    // The old Tasks screen took one rung per role, and 'round-to-book'
    // outranked 'write-up-due', so this role said nothing needed you.
    const todo = buildTodo([role()], [round({ has_debrief: false, candidate_ref: "CAN-02", round_number: 2 })], NOW)
    expect(todo).toHaveLength(1)
    expect(todo[0]).toMatchObject({ verb: "Write up round 2", who: "CAN-02", href: "/hiring/roles/role-1/round/2" })
  })
  it("decisions owed in the same round group into one row", () => {
    const todo = buildTodo([role()], [round({ id: "a", candidate_ref: "CAN-02", round_number: 2 }), round({ id: "b", candidate_ref: "CAN-01", round_number: 2 })], NOW)
    expect(todo).toHaveLength(1)
    expect(todo[0]).toMatchObject({ verb: "Decide after round 2", who: "CAN-01 and CAN-02" })
  })
  it("a booked round that has not happened owes nothing", () => {
    expect(owedOn(round({ status: "scheduled", scheduled_at: "2026-09-23T09:00:00Z", has_debrief: false }), NOW)).toBeNull()
  })
  it("a booked round whose time has passed is owed a write-up without waiting for 'completed'", () => {
    expect(owedOn(round({ status: "scheduled", scheduled_at: "2026-09-22T09:00:00Z", has_debrief: false }), NOW)).toBe("write-up")
  })
  it("choosing from a shortlist comes from the ladder and opens the Shortlist stage", () => {
    const todo = buildTodo([role({ subStateKey: "with-the-client", mode: "act" })], [], NOW)
    expect(todo[0]).toMatchObject({ verb: "Choose who to interview", href: "/hiring/roles/role-1/shortlist" })
  })
  it("a wait on somebody else is never a To do row", () => {
    expect(buildTodo([role({ subStateKey: "invited", mode: "wait" })], [], NOW)).toEqual([])
  })
})

describe("the room opens on the stage the role is at", () => {
  it("no rounds → Shortlist", () => {
    expect(currentStage([], "with-the-client", false)).toEqual({ key: "shortlist" })
  })
  it("round 1 decided with an advance and two planned → Round 2", () => {
    expect(currentStage([round({ latest_decision: "advance" })], null, false)).toEqual({ key: "round", n: 2 })
  })
  it("round 2 written up, undecided → Round 2", () => {
    expect(currentStage([round({ latest_decision: "advance" }), round({ id: "x", round_number: 2 })], null, false)).toEqual({ key: "round", n: 2 })
  })
  it("advanced on the last planned round → Decision", () => {
    expect(currentStage([round({ round_number: 2, latest_decision: "advance" })], null, false)).toEqual({ key: "decision" })
  })
  it("a delivered pack → Handover", () => {
    expect(currentStage([], null, true)).toEqual({ key: "handover" })
  })
  it("a missing plan is two rounds, never zero", () => {
    const stages = roomStages([round({ planned_rounds: 0 as never })])
    expect(stages.filter((s) => s.key === "round")).toHaveLength(2)
  })
  it("stage URLs", () => {
    expect(stageHref("r1", { key: "round", n: 2 })).toBe("/hiring/roles/r1/round/2")
    expect(stageHref("r1", { key: "handover" })).toBe("/hiring/roles/r1/handover")
  })
})

describe("the shortlist tells the current truth", () => {
  it("declined after round 1 says so, not the shortlist choice", () => {
    expect(outcomeSentence({ round: 1, decision: "decline" }, 2)).toBe("Not advanced after round 1")
  })
  it("advanced on the last planned round is taken forward", () => {
    expect(outcomeSentence({ round: 2, decision: "advance" }, 2)).toBe("Taken forward · round 2")
  })
})

describe("the handover reaches only the contact it was delivered to", () => {
  const route = tsCode(readFileSync(join(process.cwd(), "app/api/hiring/roles/[roleId]/handover/route.ts"), "utf8"))
  it("only delivered packs, only to this person's contacts", () => {
    expect(route).toMatch(/\.not\("delivered_at", "is", null\)/)
    expect(route).toMatch(/\.in\("delivered_to_contact_id", mine\)/)
  })
  it("and a re-sent shortlist no longer wipes earlier choices", () => {
    const lib = tsCode(readFileSync(join(process.cwd(), "lib/agency/client-shortlist.ts"), "utf8"))
    expect(lib).toMatch(/\.in\("recipient_id", myRecipientIds\)/)
  })
})
