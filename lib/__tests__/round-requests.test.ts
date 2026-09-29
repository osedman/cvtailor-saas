/**
 * Another round, asked for — and the client's reason in the pack (Figma
 * board 33, approved 29 Sep 2026).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import { openRequest, validateAsk } from "@/lib/agency/round-requests"
import { deriveSubState, nextAction, type RoleFacts } from "@/lib/agency/next-action"

const root = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")

describe("validateAsk — the reason is the brief for the round", () => {
  it("needs someone and a reason", () => {
    expect(validateAsk({ candidateRefs: [], note: "x" }).ok).toBe(false)
    expect(validateAsk({ candidateRefs: ["CAN-07"], note: "   " }).ok).toBe(false)
  })
  it("dedupes refs and caps the note", () => {
    const v = validateAsk({ candidateRefs: ["CAN-07", "CAN-07", " CAN-21 "], note: "a".repeat(5000) })
    expect(v.ok && v.refs).toEqual(["CAN-07", "CAN-21"])
    expect(v.ok && v.note.length).toBe(2000)
  })
})

describe("openRequest — append-only, one open at a time", () => {
  const asked = (id: string, at: string) => ({ id, request_id: null, action: "asked", candidate_refs: ["CAN-07"], note: "why", round_number: 3, created_at: at })
  const closing = (action: string, requestId: string, at: string) => ({ id: `c-${requestId}-${action}`, request_id: requestId, action, candidate_refs: [], note: "", created_at: at })

  it("an asked row with no closing row is open", () => {
    expect(openRequest([asked("a1", "2026-09-29T10:00:00Z")])?.id).toBe("a1")
  })
  for (const action of ["withdrawn", "added", "replied"]) {
    it(`'${action}' closes it without editing the ask`, () => {
      expect(openRequest([asked("a1", "2026-09-29T10:00:00Z"), closing(action, "a1", "2026-09-29T11:00:00Z")])).toBeNull()
    })
  }
  it("a later ask after a closed one is the open one", () => {
    const rows = [asked("a1", "2026-09-29T10:00:00Z"), closing("replied", "a1", "2026-09-29T11:00:00Z"), asked("a2", "2026-09-29T12:00:00Z")]
    expect(openRequest(rows)?.id).toBe("a2")
  })
})

describe("the ladder: a request outranks 'take to close-out'", () => {
  const facts = (over: Partial<RoleFacts>): RoleFacts =>
    ({
      phase: "interviews",
      status: "submitted",
      createdAt: "2026-09-20T00:00:00Z",
      closedAt: null,
      ownerName: null,
      clientName: "Meridian Health",
      requirements: 7,
      candidates: 5,
      failures: 0,
      reviewed: 5,
      undecided: 0,
      decisionsCompleteAt: "2026-09-29T09:00:00Z",
      submission: { generatedAt: "2026-09-24T00:00:00Z", format: "portal", recipients: 1, advanced: 3, declined: 0, held: 0, pending: 0 },
      openWindows: 0,
      lastWindowOfferedAt: null,
      plannedRounds: 2,
      rounds: [],
      pack: null,
      now: "2026-09-29T12:00:00Z",
      ...over,
    }) as unknown as RoleFacts

  it("with a request open, the rung is round-requested even after 'that's all my decisions'", () => {
    const sub = deriveSubState(facts({ roundRequest: { at: "2026-09-29T11:00:00Z", refs: ["CAN-07", "CAN-21"], roundNumber: 3 } }), new Date("2026-09-29T12:00:00Z"))
    expect(sub.key).toBe("round-requested")
    expect(sub.party).toBe("recruiter")
    expect(sub.roundNumber).toBe(3)
  })
  it("the recruiter is asked to act; the client waits", () => {
    const f = facts({ roundRequest: { at: "2026-09-29T11:00:00Z", refs: ["CAN-07"], roundNumber: 3 } })
    const r = nextAction(f, "recruiter", "role1", new Date("2026-09-29T12:00:00Z"))
    const c = nextAction(f, "client", "role1", new Date("2026-09-29T12:00:00Z"))
    expect(r.mode).toBe("act")
    expect(r.title).toMatch(/asked for round 3/)
    expect(c.mode).toBe("wait")
    expect(c.title).toMatch(/You asked for round 3/)
  })
  it("no request: the old rung is untouched", () => {
    expect(deriveSubState(facts({ roundRequest: null }), new Date("2026-09-29T12:00:00Z")).key).toBe("take-to-close-out")
  })
})

describe("the lines board 33 keeps", () => {
  const lib = tsCode(read("lib/agency/round-requests.ts"))
  it("asking books nothing and tells no candidate", () => {
    const ask = lib.slice(lib.indexOf("export async function recordHiringRoundRequest"), lib.indexOf("export async function requestForAgencyRole"))
    expect(ask).not.toMatch(/interview_rounds|sendEmail|notify\(|planned_rounds: /)
  })
  it("only the recruiter's 'added' changes the plan, audited in the same operation", () => {
    const ans = lib.slice(lib.indexOf("export async function answerRoundRequest"))
    expect(ans).toMatch(/assertWriter\(ctx\)/)
    expect(ans).toMatch(/update\(\{ planned_rounds: after \}\)/)
    expect(ans).toMatch(/round_request_added/)
  })
  it("the migration: service_role explicit, the shape null-safe", () => {
    const sql = read("supabase/migrations/20260929120000_round_requests.sql")
    expect(sql).toMatch(/grant select, insert, update, delete on agency\.round_requests to service_role/)
    expect(sql).not.toMatch(/grant [^;]*insert[^;]*to authenticated/)
    expect(sql).toMatch(/length\(trim\(coalesce\(note, ''\)\)\) > 0/)
    expect(sql).toMatch(/cardinality\(candidate_refs\) > 0/)
  })
  it("the pack quotes the choice only for the person chosen", () => {
    const h = tsCode(read("lib/agency/handover.ts"))
    expect(h).toMatch(/choice\.action === "chosen" && choice\.candidateId === input\.candidateId/)
    expect(h).toMatch(/clientChoice,\n\s+generated_at/)
  })
})
