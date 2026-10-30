/**
 * The hiring manager's final choice — Figma board 31 (approved 28 Sep 2026).
 *
 * Pins the lines the board promised: the reason is required, choosing is
 * never rejecting, the submission is the gate, and the table is
 * audit-coupled with service_role granted explicitly.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { liveChoice, validateChoiceInput } from "@/lib/agency/final-choice"

const root = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")

describe("validateChoiceInput", () => {
  it("requires a reason for a choice, and says why it matters", () => {
    const r = validateChoiceInput({ action: "chosen", candidateRef: "CAN-21", reason: "   " })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/why/)
  })

  it("requires a reason for 'neither' too", () => {
    expect(validateChoiceInput({ action: "neither", reason: "" }).ok).toBe(false)
  })

  it("requires a person for a choice", () => {
    expect(validateChoiceInput({ action: "chosen", reason: "Strong on discovery" }).ok).toBe(false)
  })

  it("drops the person from 'neither' and the reason from 'withdrawn'", () => {
    const n = validateChoiceInput({ action: "neither", candidateRef: "CAN-21", reason: "Neither had BI" })
    expect(n).toEqual({ ok: true, action: "neither", candidateRef: null, reason: "Neither had BI" })
    const w = validateChoiceInput({ action: "withdrawn", reason: "ignored" })
    expect(w).toEqual({ ok: true, action: "withdrawn", candidateRef: null, reason: "" })
  })

  it("refuses an action it does not know — there is no 'hire' or 'reject'", () => {
    for (const action of ["hire", "reject", "decline", undefined]) {
      expect(validateChoiceInput({ action, candidateRef: "CAN-21", reason: "x" }).ok).toBe(false)
    }
  })

  it("caps the reason at 2000 characters", () => {
    const r = validateChoiceInput({ action: "chosen", candidateRef: "CAN-21", reason: "a".repeat(5000) })
    expect(r.ok && r.reason.length).toBe(2000)
  })
})

describe("liveChoice — append-only, newest wins", () => {
  const row = (action: string, created_at: string, ref: string | null = null) => ({
    action,
    candidate_id: ref ? `id-${ref}` : null,
    candidate_ref: ref,
    reason: action === "withdrawn" ? "" : "because",
    created_at,
    by_contact_id: "c1",
  })

  it("reads the newest row", () => {
    const c = liveChoice([row("chosen", "2026-09-28T21:00:00Z", "CAN-07"), row("chosen", "2026-09-28T20:00:00Z", "CAN-21")])
    expect(c?.candidateRef).toBe("CAN-07")
  })

  it("a withdrawn newest row means no choice, without editing history", () => {
    expect(liveChoice([row("withdrawn", "2026-09-28T22:00:00Z"), row("chosen", "2026-09-28T21:00:00Z", "CAN-07")])).toBeNull()
  })

  it("no rows is no choice", () => {
    expect(liveChoice([])).toBeNull()
  })
})

describe("the lines this keeps", () => {
  const lib = tsCode(read("lib/agency/final-choice.ts"))

  it("choosing never writes a decision about anyone — no round_decisions, no decline", () => {
    expect(lib).not.toMatch(/round_decisions/)
    expect(lib).not.toMatch(/["']decline["']/)
    expect(lib).not.toMatch(/\.update\(/)
    expect(lib).not.toMatch(/\.delete\(/)
  })

  it("the submission is the gate, and the audit row rides the same operation", () => {
    expect(lib).toMatch(/getClientShortlist\(ctx, roleId\)/)
    expect(lib).toMatch(/hasAdvanceDecision\(/)
    expect(lib).toMatch(/writeAudit\(/)
  })

  it("the hiring route never hands back internal ids", () => {
    const route = tsCode(read("app/api/hiring/roles/[roleId]/final-choice/route.ts"))
    expect(route.match(/candidateId: undefined/g)?.length).toBe(2)
    expect(route.match(/byContactId: undefined/g)?.length).toBe(2)
  })
})

describe("migration 20260928120000_client_final_choice", () => {
  const sql = read("supabase/migrations/20260928120000_client_final_choice.sql")

  it("grants service_role explicitly and authenticated read only", () => {
    expect(sql).toMatch(/grant select, insert, update, delete on agency\.client_final_choices to service_role/)
    expect(sql).toMatch(/grant select on agency\.client_final_choices to authenticated/)
    expect(sql).not.toMatch(/grant [^;]*insert[^;]*to authenticated/)
  })

  it("the reason constraint cannot be defeated by NULL or whitespace", () => {
    expect(sql).toMatch(/length\(trim\(coalesce\(reason, ''\)\)\) > 0/)
  })

  it("a person is named iff the action is 'chosen', null-safe", () => {
    expect(sql).toMatch(/\(action = 'chosen'\) = \(candidate_id is not null\)/)
  })

  it("purging the candidate takes the sentence about them with it", () => {
    expect(sql).toMatch(/candidate_id\s+uuid references agency\.candidates\(id\) on delete cascade/)
  })
})
