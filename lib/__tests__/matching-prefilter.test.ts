/**
 * Stage 1 of the quiet-matching scan.
 *
 * The properties that matter here are not "does it rank well" — it is a
 * keyword heuristic and it is wrong in both directions by construction. They
 * are: it is reproducible (a rescan must not silently reshuffle who gets
 * assessed), it is bounded (a scan cannot cost more than the cap), and it
 * never leaks a number that could be mistaken for a score.
 */
import { describe, it, expect } from "vitest"
import { prefilterPool, type PrefilterCandidate } from "@/lib/matching/prefilter"
import { bucketOf, MATCH_BUCKETS, PREFILTER_KEEP } from "@/lib/matching/limits"
import type { EvidenceRow } from "@/lib/career-arc-ledger"

let seq = 0
function card(claim: string): EvidenceRow {
  seq += 1
  return {
    id: `ev-${seq}`,
    category: "impact",
    claim,
    source_role: "",
    source_company: "",
    source_span: "",
    cv_line: null,
    pinned: false,
    hidden: false,
    rephrased_text: null,
    sort_order: seq,
  }
}

const REQS = [
  { ref: "R1", text: "Kubernetes orchestration at scale", weight: "must" as const },
  { ref: "R2", text: "Payment reconciliation systems", weight: "nice" as const },
]

describe("prefilterPool", () => {
  it("keeps people with signal and drops those with none", () => {
    const pool: PrefilterCandidate[] = [
      { userId: "a", evidence: [card("Ran Kubernetes orchestration for 40 services")] },
      { userId: "b", evidence: [card("Taught secondary school geography")] },
    ]
    const hits = prefilterPool(pool, REQS)
    expect(hits.map((h) => h.userId)).toEqual(["a"])
    expect(hits[0].touched).toContain("R1")
  })

  it("skips an empty evidence bank without counting it as a miss", () => {
    const hits = prefilterPool([{ userId: "empty", evidence: [] }], REQS)
    expect(hits).toEqual([])
  })

  it("weights must-haves above nice-to-haves", () => {
    const mustOnly: PrefilterCandidate = {
      userId: "must",
      evidence: [card("Kubernetes orchestration across regions")],
    }
    const niceOnly: PrefilterCandidate = {
      userId: "nice",
      evidence: [card("Payment reconciliation pipelines")],
    }
    const hits = prefilterPool([niceOnly, mustOnly], REQS)
    expect(hits[0].userId).toBe("must")
  })

  it("does not let a large bank outrank a better-matched small one", () => {
    // Ten cards all mentioning the same skill is not ten times the evidence.
    const padded: PrefilterCandidate = {
      userId: "padded",
      evidence: Array.from({ length: 10 }, () => card("Kubernetes")),
    }
    const focused: PrefilterCandidate = {
      userId: "focused",
      evidence: [
        card("Kubernetes orchestration at scale across 40 services"),
        card("Payment reconciliation systems for a card issuer"),
      ],
    }
    const hits = prefilterPool([padded, focused], REQS)
    expect(hits[0].userId).toBe("focused")
  })

  it("is reproducible — same pool, same slice", () => {
    const pool: PrefilterCandidate[] = Array.from({ length: 40 }, (_, i) => ({
      userId: `u${String(i).padStart(2, "0")}`,
      evidence: [card("Kubernetes orchestration")],
    }))
    // Every person scores identically, so only the tie-break keeps this stable.
    const a = prefilterPool(pool, REQS, 5).map((h) => h.userId)
    const b = prefilterPool([...pool].reverse(), REQS, 5).map((h) => h.userId)
    expect(a).toEqual(b)
  })

  it("never returns more than the cap", () => {
    const pool: PrefilterCandidate[] = Array.from({ length: 30 }, (_, i) => ({
      userId: `u${i}`,
      evidence: [card("Kubernetes orchestration at scale")],
    }))
    expect(prefilterPool(pool, REQS, 7)).toHaveLength(7)
    expect(prefilterPool(pool, REQS, 0)).toHaveLength(0)
  })

  it("returns nothing when the role has no requirements", () => {
    // Not "everyone matches" — an unparsed role must find nobody, or a
    // recruiter who published too early quietly scans the whole pool.
    const pool = [{ userId: "a", evidence: [card("anything at all")] }]
    expect(prefilterPool(pool, [])).toEqual([])
  })
})

describe("bucketOf", () => {
  it("floors small counts so one is indistinguishable from four", () => {
    expect(bucketOf(1)).toBe("fewer_than_5")
    expect(bucketOf(4)).toBe("fewer_than_5")
    expect(bucketOf(5)).toBe("5_to_20")
    expect(bucketOf(20)).toBe("5_to_20")
    expect(bucketOf(21)).toBe("over_20")
  })

  it("reports nothing as none, including impossible input", () => {
    expect(bucketOf(0)).toBe("none")
    expect(bucketOf(-1)).toBe("none")
  })

  it("only ever emits values the database constraint allows", () => {
    for (const n of [0, 1, 4, 5, 20, 21, 5000]) {
      expect(MATCH_BUCKETS).toContain(bucketOf(n))
    }
  })
})

describe("the limits module stays client-safe", () => {
  it("imports nothing that would drag the service-role key into the bundle", async () => {
    // The trap this repo has hit: a client component importing a runtime
    // constant from a module that imports agencyAdmin pulls next/headers and
    // the service-role key into the browser bundle and fails the build.
    const { readFileSync } = await import("fs")
    const source = readFileSync(new URL("../matching/limits.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from\s+["'].*(agency\/db|supabase\/server|next\/headers)/)
    expect(PREFILTER_KEEP).toBeGreaterThan(0)
  })
})
