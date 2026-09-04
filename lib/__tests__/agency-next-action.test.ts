/**
 * The next action (lib/agency/next-action.ts).
 *
 * Derived, never stored, so these tests are the whole contract. The ladder
 * is walked one fact at a time through a role's life, on both hats, and the
 * property that matters most is pinned last: exactly one party is ever
 * waiting, and when this hat is that party the mode is "act".
 */

import { describe, it, expect } from "vitest"
import {
  ageLabel,
  deriveSubState,
  nextAction,
  type RoleFacts,
  type RoundFacts,
} from "../agency/next-action"

const NOW = "2026-09-05T09:00:00Z"

function facts(over: Partial<RoleFacts> = {}): RoleFacts {
  return {
    phase: "shortlist",
    status: "open",
    createdAt: "2026-09-01T09:00:00Z",
    closedAt: null,
    ownerName: "Mara Ellison",
    clientName: "Owen Castellano",
    requirements: 0,
    candidates: 0,
    failures: 0,
    reviewed: 0,
    undecided: 0,
    submission: null,
    openWindows: 0,
    lastWindowOfferedAt: null,
    plannedRounds: 2,
    rounds: [],
    pack: null,
    now: NOW,
    ...over,
  }
}

function round(over: Partial<RoundFacts> = {}): RoundFacts {
  return {
    candidateRef: "CAN-03",
    roundNumber: 1,
    status: "scheduled",
    createdAt: "2026-09-03T09:00:00Z",
    scheduledAt: "2026-09-04T10:00:00Z",
    endsAt: "2026-09-04T10:45:00Z",
    candidateResponse: "pending",
    hasDebrief: false,
    decision: null,
    decidedAt: null,
    ...over,
  }
}

const sent = (over: Partial<NonNullable<RoleFacts["submission"]>> = {}) => ({
  generatedAt: "2026-09-03T09:00:00Z",
  submitted: 3,
  decided: 0,
  advanced: 0,
  lastActionAt: null,
  ...over,
})

describe("the shortlist ladder", () => {
  it("starts at intake with nothing parsed", () => {
    expect(deriveSubState(facts()).key).toBe("intake")
  })
  it("asks for candidates once requirements exist", () => {
    expect(deriveSubState(facts({ requirements: 5 })).key).toBe("adding-candidates")
  })
  it("names the screening count", () => {
    const s = deriveSubState(facts({ requirements: 5, candidates: 8, reviewed: 3 }))
    expect(s.key).toBe("screening")
    expect(s.chip).toBe("SCREENING 3 OF 8")
  })
  it("moves to deciding when every candidate is screened but not decided", () => {
    expect(deriveSubState(facts({ requirements: 5, candidates: 8, reviewed: 8, undecided: 2 })).key).toBe("deciding")
  })
  it("is ready to send when every candidate is decided", () => {
    expect(deriveSubState(facts({ requirements: 5, candidates: 8, reviewed: 8 })).key).toBe("ready-to-send")
  })
  it("an unreadable CV outranks everything else in the phase", () => {
    expect(deriveSubState(facts({ requirements: 5, candidates: 8, reviewed: 8, failures: 1 })).key).toBe("cvs-unreadable")
  })
  it("nobody is waiting on anyone while the recruiter builds", () => {
    const s = deriveSubState(facts({ requirements: 5, candidates: 8, reviewed: 3 }))
    expect(s.party).toBe("recruiter")
    expect(s.since).toBeNull()
  })
})

describe("with the client", () => {
  const f = facts({ phase: "interviews", submission: sent({ decided: 1 }) })
  it("is the first interviews sub-state, since the submission", () => {
    const s = deriveSubState(f)
    expect(s.key).toBe("with-the-client")
    expect(s.party).toBe("client")
    expect(s.since).toBe("2026-09-03T09:00:00Z")
    expect(s.n).toBe(2)
  })
  it("the recruiter waits on the client by name", () => {
    const a = nextAction(f, "recruiter", "r1")
    expect(a.mode).toBe("wait")
    expect(a.waitingOn).toEqual({ party: "client", label: "Owen Castellano" })
    expect(a.detail).toContain("2 decisions outstanding")
  })
  it("the client acts, and is told it is them", () => {
    const a = nextAction(f, "client", "r1")
    expect(a.mode).toBe("act")
    expect(a.waitingOn.party).toBe("you")
    expect(a.cta?.href).toBe("/hiring/roles/r1")
  })
})

describe("the interview loop", () => {
  const base = { phase: "interviews" as const, submission: sent({ decided: 3, advanced: 1, lastActionAt: "2026-09-03T12:00:00Z" }) }

  it("advanced with no round and no windows waits on the client for windows", () => {
    const s = deriveSubState(facts({ ...base }))
    expect(s.key).toBe("windows-to-offer")
    expect(s.party).toBe("client")
    expect(s.since).toBe("2026-09-03T12:00:00Z")
  })
  it("advanced with a window open is the recruiter's round 1 to book", () => {
    const s = deriveSubState(facts({ ...base, openWindows: 2, lastWindowOfferedAt: "2026-09-03T14:00:00Z" }))
    expect(s.key).toBe("round-to-book")
    expect(s.chip).toBe("ROUND 1 TO BOOK")
    expect(s.party).toBe("recruiter")
    expect(s.since).toBe("2026-09-03T14:00:00Z")
  })
  it("a pending invite waits on the candidate, by ref", () => {
    const s = deriveSubState(facts({ ...base, rounds: [round()] }))
    expect(s.key).toBe("invited")
    expect(s.party).toBe("candidate")
    expect(s.candidateRef).toBe("CAN-03")
    expect(nextAction(facts({ ...base, rounds: [round()] }), "recruiter", "r1").waitingOn.label).toBe("Candidate CAN-03")
  })
  it("a confirmed round is booked and waits on nobody but the date", () => {
    const s = deriveSubState(facts({ ...base, rounds: [round({ candidateResponse: "confirmed" })] }))
    expect(s.key).toBe("booked")
    expect(s.party).toBe("nobody")
    expect(s.since).toBe("2026-09-04T10:00:00Z")
  })
  it("a completed round with no write-up waits on the client, since the slot ended", () => {
    const s = deriveSubState(facts({ ...base, rounds: [round({ status: "completed", candidateResponse: "confirmed" })] }))
    expect(s.key).toBe("write-up-due")
    expect(s.party).toBe("client")
    expect(s.since).toBe("2026-09-04T10:45:00Z")
  })
  it("a write-up with no decision is the client's decision", () => {
    const f = facts({ ...base, rounds: [round({ status: "completed", hasDebrief: true })] })
    expect(deriveSubState(f).key).toBe("decision-due")
    const a = nextAction(f, "client", "r1")
    expect(a.mode).toBe("act")
    expect(a.title).toBe("Decide round 1 with CAN-03")
  })
  it("advance below the planned count is the next round to book", () => {
    const f = facts({ ...base, openWindows: 1, rounds: [round({ status: "completed", hasDebrief: true, decision: "advance", decidedAt: "2026-09-04T15:00:00Z" })] })
    const s = deriveSubState(f)
    expect(s.key).toBe("round-to-book")
    expect(s.chip).toBe("ROUND 2 TO BOOK")
    expect(nextAction(f, "recruiter", "r1").title).toBe("Book round 2 for CAN-03")
  })
  it("advance at the planned count is take to close-out — a plan, not a gate", () => {
    const f = facts({ ...base, rounds: [round({ roundNumber: 2, status: "completed", hasDebrief: true, decision: "advance", decidedAt: "2026-09-04T15:00:00Z" })] })
    const s = deriveSubState(f)
    expect(s.key).toBe("take-to-close-out")
    expect(s.party).toBe("recruiter")
    expect(nextAction(f, "recruiter", "r1").cta?.href).toBe("/agencies/roles/r1/close-out")
  })
  it("hold waits on the client", () => {
    const f = facts({ ...base, rounds: [round({ status: "completed", hasDebrief: true, decision: "hold", decidedAt: "2026-09-04T15:00:00Z" })] })
    expect(deriveSubState(f).key).toBe("on-hold")
    expect(deriveSubState(f).party).toBe("client")
  })
  it("a declined candidate leaves the loop; with nobody else owed, the loop has ended", () => {
    const f = facts({ ...base, rounds: [round({ status: "completed", hasDebrief: true, decision: "decline", decidedAt: "2026-09-04T15:00:00Z" })] })
    expect(deriveSubState(f).key).toBe("loop-ended")
    expect(deriveSubState(f).party).toBe("recruiter")
  })
  it("a cancelled booking is owed again", () => {
    const f = facts({ ...base, openWindows: 1, rounds: [round({ status: "cancelled" })] })
    expect(deriveSubState(f).key).toBe("round-to-book")
    expect(deriveSubState(f).chip).toBe("ROUND 1 TO BOOK")
  })
  it("close-out outranks a write-up owed on another candidate", () => {
    const f = facts({
      ...base,
      submission: sent({ decided: 3, advanced: 2 }),
      rounds: [
        round({ candidateRef: "CAN-01", roundNumber: 2, status: "completed", hasDebrief: true, decision: "advance", decidedAt: "2026-09-04T15:00:00Z" }),
        round({ candidateRef: "CAN-02", status: "completed" }),
      ],
    })
    expect(deriveSubState(f).key).toBe("take-to-close-out")
    expect(deriveSubState(f).candidateRef).toBe("CAN-01")
  })
  it("the client's own header never sees a candidate name, only a ref", () => {
    const f = facts({ ...base, rounds: [round({ status: "completed" })] })
    const a = nextAction(f, "client", "r1")
    expect(a.title).toBe("Write up round 1 with CAN-03")
    expect(a.waitingOn).toEqual({ party: "you", label: "You" })
  })
})

describe("handover", () => {
  it("a generated pack is the recruiter's to hand over", () => {
    const f = facts({ phase: "handover", submission: sent(), pack: { generatedAt: "2026-09-05T08:00:00Z", deliveredAt: null } })
    const s = deriveSubState(f)
    expect(s.key).toBe("pack-generated")
    expect(s.since).toBe("2026-09-05T08:00:00Z")
    expect(nextAction(f, "recruiter", "r1").title).toBe("Hand the pack over to Owen Castellano")
  })
  it("a handed-over pack is the recruiter's to close — closing stays their act", () => {
    const f = facts({ phase: "handover", submission: sent(), pack: { generatedAt: "2026-09-05T08:00:00Z", deliveredAt: "2026-09-05T09:00:00Z" } })
    expect(deriveSubState(f).key).toBe("handed-over")
    expect(nextAction(f, "recruiter", "r1").mode).toBe("act")
    expect(nextAction(f, "client", "r1").mode).toBe("wait")
  })
  it("closed is done for everyone, since closed_at", () => {
    const f = facts({ phase: "handover", status: "closed", closedAt: "2026-09-06T09:00:00Z" })
    expect(deriveSubState(f)).toMatchObject({ key: "closed", party: "nobody", since: "2026-09-06T09:00:00Z" })
    expect(nextAction(f, "recruiter", "r1").mode).toBe("done")
  })
})

describe("the two hats agree on the facts and differ on the pronoun", () => {
  const cases: RoleFacts[] = [
    facts({ requirements: 5, candidates: 8, reviewed: 3 }),
    facts({ phase: "interviews", submission: sent({ decided: 1 }) }),
    facts({ phase: "interviews", submission: sent({ decided: 3, advanced: 1 }), rounds: [round({ status: "completed" })] }),
    facts({ phase: "interviews", submission: sent({ decided: 3, advanced: 1 }), rounds: [round()] }),
    facts({ phase: "handover", submission: sent(), pack: { generatedAt: NOW, deliveredAt: null } }),
  ]
  it.each(cases.map((c, i) => [i, c] as const))("case %i: same sub-state, one party, act iff that party is me", (_i, f) => {
    const r = nextAction(f, "recruiter", "r1")
    const c = nextAction(f, "client", "r1")
    expect(r.key).toBe(c.key)
    expect(r.since).toBe(c.since)
    const sub = deriveSubState(f)
    expect(r.mode === "act").toBe(sub.party === "recruiter")
    expect(c.mode === "act").toBe(sub.party === "client")
    if (r.mode === "act") expect(r.waitingOn.label).toBe("You")
    if (c.mode === "act") expect(c.waitingOn.label).toBe("You")
  })
})

describe("names fall back honestly", () => {
  it("an unassigned role and an unnamed client still read", () => {
    const f = facts({ phase: "interviews", ownerName: null, clientName: null, submission: sent({ decided: 1 }) })
    expect(nextAction(f, "recruiter", "r1").waitingOn.label).toBe("The client")
    expect(nextAction(f, "client", "r1").title).toContain("Decide on")
    expect(nextAction(facts({ ownerName: null }), "client", "r1").title).toBe("Your recruiter is building the shortlist")
  })
})

describe("ageLabel", () => {
  it("is an age, never a deadline", () => {
    expect(ageLabel("2026-09-05T08:00:00Z", NOW)).toBe("today")
    expect(ageLabel("2026-09-04T08:00:00Z", NOW)).toBe("1 day")
    expect(ageLabel("2026-09-02T08:00:00Z", NOW)).toBe("3 days")
    expect(ageLabel("2026-08-15T08:00:00Z", NOW)).toBe("3 weeks")
  })
  it("reads forward for a booked date", () => {
    expect(ageLabel("2026-09-06T10:00:00Z", NOW)).toBe("tomorrow")
    expect(ageLabel("2026-09-08T10:00:00Z", NOW)).toBe("in 3 days")
  })
})

describe("the module stays browser-safe", () => {
  it("imports nothing that would drag the service-role key into the bundle", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync(new URL("../agency/next-action.ts", import.meta.url), "utf8")
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/\bfrom\s+["'][^"']*\bdb["']/)
    expect(code).not.toMatch(/next\/headers/)
    expect(code).not.toMatch(/agencyAdmin/)
    // The only runtime import is the browser-safe phases module.
    const imports = [...code.matchAll(/^\s*import\s[^\n]*from\s+["']([^"']+)["']/gm)].map((m) => m[1])
    expect(imports).toEqual(["./phases"])
  })
})
