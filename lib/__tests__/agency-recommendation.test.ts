/**
 * The shortlist recommendation — the guarantees, probed.
 *
 * This feature is the first surface in the product where software offers an
 * opinion about a person rather than a fact about their evidence, so the
 * guarantees are not comments. Each block below fails the build if one goes.
 *
 * Written probe-first, per the lesson that a guardrail counts only once
 * something has made it fail: every assertion here was run against a version
 * of the code with the guard removed before it was kept.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode } from "./helpers/source-scan"
import {
  allowedTraces,
  computedReason,
  computedTraces,
  countGroups,
  forbiddenTerm,
  traceLabel,
  trimToSentence,
  validateRecommendation,
  type RecommendationCandidateInput,
  type RecommendationInput,
} from "@/lib/agency/recommendation"

const ROOT = process.cwd()
const ROUTE = "app/api/agency/roles/[roleId]/recommendation/route.ts"

function candidate(over: Partial<RecommendationCandidateInput> = {}): RecommendationCandidateInput {
  return {
    ref: "CAN-01",
    overall: 91,
    must_hit: 5,
    must_total: 5,
    reviewed: true,
    notes: "",
    requirements: [
      { ref: "R01", weight: "must", strength: "strong", quote: "Ten years of Python.", overridden: false, call_answer: null },
      { ref: "R02", weight: "must", strength: "strong", quote: "Airflow at scale.", overridden: false, call_answer: null },
    ],
    ...over,
  }
}

const identify = (ref: string) => ({ candidate_id: `id-${ref}`, full_name: `Name ${ref}` })

function input(...candidates: RecommendationCandidateInput[]): RecommendationInput {
  return { role_title: "Senior Data Engineer", candidates }
}

describe("nobody falls off the list", () => {
  it("returns every candidate exactly once even when the model returns none", () => {
    const i = input(candidate({ ref: "CAN-01" }), candidate({ ref: "CAN-02" }), candidate({ ref: "CAN-03" }))
    const items = validateRecommendation([], i, identify)
    expect(items).toHaveLength(3)
    expect(items.map((x) => x.ref).sort()).toEqual(["CAN-01", "CAN-02", "CAN-03"])
    // Unmentioned is not hidden: it is listed, with a reason.
    expect(items.every((x) => x.group === "not_yet")).toBe(true)
    expect(items.every((x) => x.reason.length > 0)).toBe(true)
  })

  it("keeps the first of a duplicated ref and drops refs it does not know", () => {
    const i = input(candidate({ ref: "CAN-01" }))
    const items = validateRecommendation(
      [
        { ref: "CAN-01", group: "recommended", reason: "Clears all five must-haves.", traces: ["cv:R01"] },
        { ref: "CAN-01", group: "not_yet", reason: "Second opinion.", traces: ["cv:R01"] },
        { ref: "CAN-99", group: "recommended", reason: "Invented person.", traces: ["cv:R01"] },
      ],
      i,
      identify
    )
    expect(items).toHaveLength(1)
    expect(items[0].group).toBe("recommended")
    expect(items[0].reason).toBe("Clears all five must-haves.")
  })
})

describe("every reason shows its working", () => {
  it("drops trace ids the candidate's own rows do not support", () => {
    const c = candidate()
    const items = validateRecommendation(
      [{ ref: "CAN-01", group: "recommended", reason: "Clears all five.", traces: ["cv:R01", "override:R01", "call:R99", "made-up"] }],
      input(c),
      identify
    )
    // Only cv:R01 survives — there is no override and no call answer.
    expect(items[0].traces).toEqual(["CV · R01 quote"])
  })

  it("replaces a reason that has no surviving trace with a computed fact line", () => {
    const c = candidate()
    const items = validateRecommendation(
      [{ ref: "CAN-01", group: "recommended", reason: "Trust me on this one.", traces: ["override:R01"] }],
      input(c),
      identify
    )
    expect(items[0].computed).toBe(true)
    expect(items[0].reason).not.toContain("Trust me")
    expect(items[0].traces.length).toBeGreaterThan(0)
  })

  it("marks a computed reason so the screen can say it was not written", () => {
    const items = validateRecommendation([], input(candidate()), identify)
    expect(items[0].computed).toBe(true)
  })
})

describe("no inference about a person", () => {
  it.each([
    "She came across as confident on the call.",
    "Strong communication throughout.",
    "Clearly motivated to move.",
    "Good culture fit for the team.",
    "Seems like a safe pair of hands.",
    "Her tone suggested some hesitation.",
  ])("refuses the reason %j", (reason) => {
    expect(forbiddenTerm(reason)).not.toBeNull()
  })

  it.each([
    "Clears all five must-haves on the record as it stands.",
    "R07 has no evidence and no call answer — it has not been asked.",
    "The CV line and your call note both stand and they differ.",
  ])("allows the evidence sentence %j", (reason) => {
    expect(forbiddenTerm(reason)).toBeNull()
  })

  it("throws away a reason about the person even when the traces are valid", () => {
    const c = candidate()
    const items = validateRecommendation(
      [{ ref: "CAN-01", group: "recommended", reason: "Evidenced on R01, and she came across well.", traces: ["cv:R01"] }],
      input(c),
      identify
    )
    expect(items[0].computed).toBe(true)
    expect(items[0].reason).not.toMatch(/came across/i)
  })
})

describe("the verdict vocabulary stays out", () => {
  it.each(["Reject this one.", "Unsuitable for the role.", "A weak candidate overall."])(
    "refuses %j",
    (reason) => {
      expect(forbiddenTerm(reason)).not.toBeNull()
    }
  )

  it("never produces the word rejected in a computed reason", () => {
    const rows = [
      candidate({ reviewed: false }),
      candidate({ must_hit: 3, requirements: [
        { ref: "R01", weight: "must", strength: "missing", quote: null, overridden: false, call_answer: null },
      ] }),
      candidate({ must_hit: 4, requirements: [
        { ref: "R03", weight: "must", strength: "missing", quote: null, overridden: false, call_answer: "Ran them, did not build them." },
      ] }),
    ]
    for (const c of rows) {
      expect(computedReason(c).toLowerCase()).not.toContain("reject")
      expect(forbiddenTerm(computedReason(c))).toBeNull()
    }
  })

  it("keeps the adverb: the third group is not recommended YET", () => {
    const src = readFileSync(join(ROOT, "lib/agency/recommendation.ts"), "utf8")
    expect(src).toContain("Not recommended yet")
    const panel = tsCode(readFileSync(join(ROOT, "components/agency/recommendation-panel.tsx"), "utf8"))
    expect(panel.toLowerCase()).not.toMatch(/\brejected\b/)
  })
})

describe("MISSING is never filled", () => {
  it("says a must-have has not been asked rather than guessing", () => {
    const c = candidate({
      must_hit: 4,
      requirements: [
        { ref: "R07", weight: "must", strength: "missing", quote: null, overridden: false, call_answer: null },
      ],
    })
    const reason = computedReason(c)
    expect(reason).toContain("R07")
    expect(reason).toContain("has not been asked")
  })

  it("offers an unasked trace only when there is no call answer", () => {
    const unasked = candidate({
      requirements: [{ ref: "R07", weight: "must", strength: "missing", quote: null, overridden: false, call_answer: null }],
    })
    expect(allowedTraces(unasked).has("unasked:R07")).toBe(true)

    const asked = candidate({
      requirements: [{ ref: "R07", weight: "must", strength: "missing", quote: null, overridden: false, call_answer: "Never touched it." }],
    })
    expect(allowedTraces(asked).has("unasked:R07")).toBe(false)
    expect(allowedTraces(asked).has("missing:R07")).toBe(true)
    expect(allowedTraces(asked).has("call:R07")).toBe(true)
  })

  it("offers no CV trace for an evidence row with no quote", () => {
    const c = candidate({
      requirements: [{ ref: "R01", weight: "must", strength: "missing", quote: null, overridden: false, call_answer: null }],
    })
    expect(allowedTraces(c).has("cv:R01")).toBe(false)
  })

  it("computed traces always back the computed reason", () => {
    const c = candidate({
      must_hit: 4,
      requirements: [{ ref: "R07", weight: "must", strength: "missing", quote: null, overridden: false, call_answer: null }],
    })
    expect(computedTraces(c)).toContain("unasked:R07")
  })
})

describe("trace labels", () => {
  it("renders the five kinds and refuses anything else", () => {
    expect(traceLabel("cv:R01")).toBe("CV · R01 quote")
    expect(traceLabel("call:R04")).toBe("Your call note · R04")
    expect(traceLabel("override:R04")).toBe("Your override · R04")
    expect(traceLabel("missing:R07")).toBe("R07 · MISSING")
    expect(traceLabel("unasked:R07")).toBe("R07 · not asked on the call")
    expect(traceLabel("notes")).toBe("Your call notes")
    expect(traceLabel("no-call")).toBe("No screening call logged")
    expect(traceLabel("nonsense")).toBeNull()
    expect(traceLabel("cv:../../etc")).toBeNull()
    expect(traceLabel("cv:")).toBeNull()
  })
})

describe("the route sends no judgement of a person to the model", () => {
  const source = tsCode(readFileSync(join(ROOT, ROUTE), "utf8"))

  it("never selects the communication or motivation soft signals", () => {
    // They are the only columns in the schema that rate a person.
    //
    // Scan the SELECT lists, not the whole file: the system prompt names both
    // words in order to forbid them, and a whole-file scan is satisfied by the
    // rule's own statement of itself — the same trap the source-scan helper
    // exists for, one layer along (a string this time, not a comment).
    const selects = [...source.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1])
    expect(selects.length).toBeGreaterThan(0)
    for (const list of selects) {
      expect(list).not.toMatch(/communication/i)
      expect(list).not.toMatch(/motivation/i)
    }
    // And nothing reads them off a row by property access either.
    expect(source).not.toMatch(/\.communication\b/)
    expect(source).not.toMatch(/\.motivation\b/)
    // select("*") would smuggle both in. score_breakdowns is the one table
    // where it is safe — it has no soft signals — so it is named explicitly.
    const stars = [...source.matchAll(/from\("(\w+)"\)\s*\.select\("\*"\)/g)].map((m) => m[1])
    expect(stars).toEqual(["score_breakdowns"])
  })

  it("selects call_answers and notes, which are the recruiter's own words", () => {
    expect(source).toContain("call_answers")
    expect(source).toContain("notes")
  })

  it("never writes a decision", () => {
    expect(source).not.toContain("recruiter_reviews")
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/)
  })

  it("rate limits and runs long enough for fifty candidates", () => {
    expect(source).toContain('checkRateLimit(auth.ctx.userId, "ai")')
    expect(source).toContain("export const maxDuration = 300")
  })

  it("treats CV quotes and recruiter notes as untrusted data in the prompt", () => {
    expect(source).toMatch(/untrusted data/)
  })

  it("audits with counts and never with a name, a reason or a group", () => {
    const audit = source.slice(source.indexOf("writeAudit("))
    expect(audit).toContain('entityType: "recommendation"')
    expect(audit).toContain("role.ref")
    expect(audit).not.toContain("full_name")
    expect(audit).not.toContain("items")
  })
})

describe("counts", () => {
  it("tallies the three groups", () => {
    const items = validateRecommendation(
      [
        { ref: "CAN-01", group: "recommended", reason: "Clears all five.", traces: ["cv:R01"] },
        { ref: "CAN-02", group: "second_look", reason: "R02 evidenced only on the CV.", traces: ["cv:R02"] },
      ],
      input(candidate({ ref: "CAN-01" }), candidate({ ref: "CAN-02" }), candidate({ ref: "CAN-03" })),
      identify
    )
    expect(countGroups(items)).toEqual({ recommended: 1, second_look: 1, not_yet: 1 })
  })
})

describe("a long reason is trimmed at a sentence, never mid-word", () => {
  it("keeps whole sentences up to the cap", () => {
    const long =
      "R01 is evidenced on the CV as ten years of Python across ingestion and modelling. R04 is evidenced twice, on the CV and in your call answer. R07 is recorded as missing with no CV quote and no call answer, and was not asked on the call either, so it stays open. A fourth sentence, deliberately padded out with a good deal more text than anybody needs, pushes this comfortably past the four hundred character cap and should not survive the trim at all."
    const out = trimToSentence(long)
    expect(out.length).toBeLessThanOrEqual(400)
    expect(out.endsWith(".")).toBe(true)
    expect(out).not.toMatch(/\s\S{1,3}$/)
    expect(out).toContain("R01 is evidenced")
    expect(out).not.toContain("A fourth sentence")
  })

  it("leaves a short reason exactly as written", () => {
    const short = "Clears all five must-haves on the record as it stands."
    expect(trimToSentence(short)).toBe(short)
  })

  it("falls back to a word boundary when the first sentence is already too long", () => {
    const runOn = `${"word ".repeat(120)}end.`
    const out = trimToSentence(runOn)
    expect(out.length).toBeLessThanOrEqual(401)
    expect(out.endsWith("…")).toBe(true)
    expect(out).not.toMatch(/wor…$/)
  })

  it("trims what the live model actually returned on 19 Sep", () => {
    // Verbatim from the first real claude-opus-5 response, which ran to 950
    // characters against a brief asking for one sentence.
    const real =
      "R01 (Python, 5+ years) is evidenced on the CV as ten years of Python across ingestion and modelling. R04 (dbt in production) is evidenced twice: the CV records ownership of the dbt migration for the claims warehouse, and the call answer records the dbt layer being built from scratch rather than inherited; a recruiter override is also logged against R04. R07 is recorded as missing, with no CV quote and no call answer."
    const out = trimToSentence(real)
    expect(out.length).toBeLessThanOrEqual(400)
    expect(out.endsWith(".")).toBe(true)
  })
})
