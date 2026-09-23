/**
 * The brief's option sets, its state machine and its diff (23 Sep 2026,
 * Figma frame 25). All pure, so tested on values — nothing here is a mock
 * agreeing with itself.
 *
 * The rule worth the most: APPROVED MEANS BOTH SIGNATURES ON ONE VERSION.
 * Every other state falls out of who wrote the version and whether it left
 * their side.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import {
  normaliseBrief,
  DEFAULT_BRIEF,
  briefState,
  waitingOn,
  diffBrief,
  applyClientAmendment,
  CLIENT_EDITABLE,
  TIER,
  describe as describeKey,
  TIME_STEPS,
  MAX_ROUNDS,
} from "@/lib/agency/brief-options"

const sig = (o: Partial<Parameters<typeof briefState>[0]>): Parameters<typeof briefState>[0] => ({
  version: 1,
  recruiterApprovedAt: null,
  clientApprovedAt: null,
  authoredBy: "recruiter",
  sentAt: null,
  ...o,
})

describe("the state machine", () => {
  it("is a draft until it is sent", () => {
    expect(briefState(sig({}), true)).toBe("draft")
  })
  it("is sent when the recruiter's version has left with their signature", () => {
    expect(briefState(sig({ sentAt: "t", recruiterApprovedAt: "t" }), true)).toBe("sent")
    expect(waitingOn("sent")).toBe("client")
  })
  it("is amended when the client's version has left with theirs", () => {
    expect(briefState(sig({ authoredBy: "client", sentAt: "t", clientApprovedAt: "t" }), true)).toBe("amended")
    expect(waitingOn("amended")).toBe("recruiter")
  })
  it("is approved only with BOTH signatures", () => {
    expect(briefState(sig({ sentAt: "t", recruiterApprovedAt: "t", clientApprovedAt: "t" }), true)).toBe("approved")
    expect(briefState(sig({ sentAt: "t", recruiterApprovedAt: "t" }), true)).not.toBe("approved")
    expect(briefState(sig({ sentAt: "t", clientApprovedAt: "t" }), true)).not.toBe("approved")
    expect(waitingOn("approved")).toBeNull()
  })
  it("is superseded the moment it is not the latest, whatever it was", () => {
    expect(briefState(sig({ sentAt: "t", recruiterApprovedAt: "t", clientApprovedAt: "t" }), false)).toBe("superseded")
    expect(briefState(sig({}), false)).toBe("superseded")
  })
})

describe("normaliseBrief never lets an out-of-set value through", () => {
  it("returns the defaults for garbage", () => {
    expect(normaliseBrief(null)).toEqual(DEFAULT_BRIEF)
    expect(normaliseBrief("x")).toEqual(DEFAULT_BRIEF)
    expect(normaliseBrief({ nonsense: 1 })).toEqual(DEFAULT_BRIEF)
  })
  it("snaps every dropdown to its set", () => {
    const c = normaliseBrief({
      decisionTurnaroundDays: 4, // not in 1·2·3·5
      noticeHours: 36,
      bufferMinutes: 7,
      feeBasis: "handshake",
      rebateShape: "generous",
      invoicePoint: "whenever",
      ownershipMonths: 9,
      feedbackMode: "maybe",
      feedbackDays: 4,
    })
    expect(c.decisionTurnaroundDays).toBe(DEFAULT_BRIEF.decisionTurnaroundDays)
    expect(c.noticeHours).toBe(24)
    expect(c.bufferMinutes).toBe(15)
    expect(c.feeBasis).toBe("contingent")
    expect(c.rebateShape).toBe("sliding")
    expect(c.invoicePoint).toBe("start_date")
    expect(c.ownershipMonths).toBe(12)
    expect(c.feedbackMode).toBe("via_recruiter")
    expect(c.feedbackDays).toBe(5)
  })
  it("clamps the steppers", () => {
    const c = normaliseBrief({ maxPerDay: 40, rebateWeeks: -3, shortlistSize: 0, feePercent: 99, offerCeiling: 95_432 })
    expect(c.maxPerDay).toBe(6)
    expect(c.rebateWeeks).toBe(0)
    expect(c.shortlistSize).toBe(1)
    expect(c.feePercent).toBe(50)
    expect(c.offerCeiling).toBe(95_000)
  })
  it("rounds the fee to half a percent", () => {
    expect(normaliseBrief({ feePercent: 17.26 }).feePercent).toBe(17.5)
    expect(normaliseBrief({ feePercent: 17.2 }).feePercent).toBe(17)
  })
  it("caps rounds and drops non-uuid interviewers", () => {
    const rounds = Array.from({ length: 9 }, () => ({ purpose: "panel", format: "video", interviewerIds: ["Priya Raman", "3e386262-12b7-8155-bdeb-fa19cc33e7b8"], durationMinutes: 60 }))
    const c = normaliseBrief({ rounds })
    expect(c.rounds).toHaveLength(MAX_ROUNDS)
    expect(c.rounds[0].interviewerIds).toEqual(["3e386262-12b7-8155-bdeb-fa19cc33e7b8"])
  })
  it("keeps references in canonical order — the candidates constraint refuses the other", () => {
    expect(normaliseBrief({ referencesWanted: ["hr", "character"] }).referencesWanted).toEqual(["character", "hr"])
    expect(normaliseBrief({ referencesWanted: ["hr", "hr", "personal"] }).referencesWanted).toEqual(["hr"])
  })
  it("refuses a window that ends before it starts", () => {
    const c = normaliseBrief({ windowFrom: "15:00", windowTo: "10:00" })
    expect(c.windowTo > c.windowFrom).toBe(true)
    expect(TIME_STEPS).toContain(c.windowFrom)
  })
  it("caps the one free-text field", () => {
    expect(normaliseBrief({ note: "x".repeat(2000) }).note).toHaveLength(600)
  })
  it("accepts only YYYY-MM for the start target", () => {
    expect(normaliseBrief({ startTargetMonth: "2026-11" }).startTargetMonth).toBe("2026-11")
    expect(normaliseBrief({ startTargetMonth: "November" }).startTargetMonth).toBeNull()
    expect(normaliseBrief({ startTargetMonth: "2026-13" }).startTargetMonth).toBeNull()
  })
})

describe("the two tiers", () => {
  it("puts exactly the four agreed sections in tier one", () => {
    const tier1 = (Object.keys(TIER) as Array<keyof typeof TIER>).filter((k) => TIER[k] === 1)
    // rounds · deciding (6 keys) · what is shown · feedback (2 keys)
    expect(tier1.sort()).toEqual(
      ["rounds", "decisionTurnaroundDays", "interviewDays", "windowFrom", "windowTo", "noticeHours", "bufferMinutes", "maxPerDay", "disclosure", "feedbackMode", "feedbackDays"].sort()
    )
    expect(CLIENT_EDITABLE).toEqual(expect.arrayContaining(tier1))
    expect(CLIENT_EDITABLE).not.toContain("feePercent")
  })

  it("lets a client amendment move tier-one keys only", () => {
    const { config, changes } = applyClientAmendment(DEFAULT_BRIEF, {
      decisionTurnaroundDays: 3,
      feePercent: 5, // tier two — must be ignored, not applied
    })
    expect(config.decisionTurnaroundDays).toBe(3)
    expect(config.feePercent).toBe(DEFAULT_BRIEF.feePercent)
    expect(changes.map((c) => c.key)).toEqual(["decisionTurnaroundDays"])
  })
})

describe("the diff", () => {
  it("names exactly the keys that moved, with both values", () => {
    const next = { ...DEFAULT_BRIEF, maxPerDay: 4, disclosure: { ...DEFAULT_BRIEF.disclosure, notes: true } }
    const d = diffBrief(DEFAULT_BRIEF, next)
    expect(d.map((c) => c.key).sort()).toEqual(["disclosure", "maxPerDay"])
    expect(d.find((c) => c.key === "maxPerDay")).toMatchObject({ from: 3, to: 4, tier: 1 })
  })
  it("is empty for an identical config", () => {
    expect(diffBrief(DEFAULT_BRIEF, normaliseBrief(DEFAULT_BRIEF))).toEqual([])
  })
})

describe("the words", () => {
  it("resolves contact ids to names and never shows a uuid", () => {
    const id = "3e386262-12b7-8155-bdeb-fa19cc33e7b8"
    const c = normaliseBrief({ rounds: [{ purpose: "screen", format: "video", interviewerIds: [id], durationMinutes: 45 }], offerAuthorityContactId: id, offerCeiling: 95000 })
    const names = { [id]: "P. R." }
    expect(describeKey("rounds", c, names)).toContain("P. R.")
    expect(describeKey("rounds", c, names)).not.toContain(id)
    expect(describeKey("offerAuthorityContactId", c, names)).toBe("P. R., up to £95,000")
  })
  it("says when nobody is named rather than inventing someone", () => {
    expect(describeKey("rounds", DEFAULT_BRIEF)).toContain("interviewer to confirm")
    expect(describeKey("offerAuthorityContactId", DEFAULT_BRIEF)).toBe("Not named")
  })
})

describe("the module stays out of the server", () => {
  it("imports nothing", () => {
    const src = readFileSync(join(process.cwd(), "lib/agency/brief-options.ts"), "utf8")
    expect(src).not.toMatch(/^\s*import /m)
  })
})
