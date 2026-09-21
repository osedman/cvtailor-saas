/**
 * Per-round enrichment: what a write-up may and may not add to a record.
 *
 * 21 Sep 2026. A hiring manager writes up an interview and, until now, that
 * prose stopped at the round: the candidate's evidence map looked the same
 * after two interviews as it did after the CV. `round-delta.ts` had said so
 * since it was written — "when enrichment ships and rounds start moving
 * strengths, the CHANGED lane fills from real strength transitions".
 *
 * Everything for it existed except one line. Migration 11 added `round_id`,
 * widened `origin` to 'interview' and tied them together; consent withdrawal
 * has deleted `origin='interview'` rows by round and rescored since August.
 * But `unique (candidate_id, requirement_id)` was never lifted, so a round
 * could never add a row beside the CV's. Migration 37 replaces it with two
 * partial indexes: one base row per requirement, one row per round.
 *
 * The rules below are the CV pass's rules, applied to prose a person typed.
 * The one that matters most is verbatim: a paraphrase attributed to the
 * interviewer is a sentence they did not write, appearing in a record that
 * says they did.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { tsCode, sqlCode } from "./helpers/source-scan"
import { validateFindings, verifyQuote, evidenceRows, type EnrichmentRequirement } from "@/lib/agency/enrichment"
import { effectiveEvidence, winningRows } from "@/lib/agency/evidence-layers"

const ROOT = process.cwd()

const REQS: EnrichmentRequirement[] = [
  { id: "req-1", ref: "R01", text: "Python, five years or more", weight: "must" },
  { id: "req-4", ref: "R04", text: "dbt, run in production", weight: "must" },
  { id: "req-7", ref: "R07", text: "Infrastructure as code", weight: "must" },
]

const WRITE_UP =
  "Walked through the ingestion redesign end to end and was clear about what she inherited versus what she built. " +
  "Built the dbt layer from scratch at Nuffield rather than inheriting it. Comfortable with the on-call expectations."

describe("a quote is verbatim or it does not exist", () => {
  it("accepts a span copied from the write-up", () => {
    expect(verifyQuote("Built the dbt layer from scratch at Nuffield", WRITE_UP)).toBe(true)
  })

  it("forgives reflowed whitespace only", () => {
    expect(verifyQuote("Built the dbt   layer\nfrom scratch at Nuffield", WRITE_UP)).toBe(true)
  })

  it("refuses a paraphrase, however fair", () => {
    // The meaning survives; the sentence is not the interviewer's.
    expect(verifyQuote("She built the dbt layer herself at Nuffield", WRITE_UP)).toBe(false)
  })

  it("refuses an invention outright", () => {
    expect(verifyQuote("Ten years of Terraform in production", WRITE_UP)).toBe(false)
  })

  it("refuses a fragment too short to mean anything", () => {
    expect(verifyQuote("dbt", WRITE_UP)).toBe(false)
  })
})

describe("what validation keeps", () => {
  it("keeps a traceable finding", () => {
    const { findings } = validateFindings(
      [{ requirement_ref: "R04", quote: "Built the dbt layer from scratch at Nuffield", strength: "strong" }],
      REQS,
      WRITE_UP
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ requirementId: "req-4", requirementRef: "R04", strength: "strong" })
  })

  it("drops a quote that is not in the write-up", () => {
    const { findings, dropped } = validateFindings(
      [{ requirement_ref: "R07", quote: "Terraform across three environments", strength: "strong" }],
      REQS,
      WRITE_UP
    )
    expect(findings).toHaveLength(0)
    expect(dropped[0]).toMatch(/not in the write-up/)
  })

  it("NEVER writes missing — a round that did not ask has found nothing", () => {
    const { findings, dropped } = validateFindings(
      [{ requirement_ref: "R07", quote: "Comfortable with the on-call expectations", strength: "missing" }],
      REQS,
      WRITE_UP
    )
    expect(findings).toHaveLength(0)
    expect(dropped[0]).toMatch(/never writes MISSING/)
  })

  it("drops a quote that describes the person rather than the evidence", () => {
    const src =
      "She came across as confident throughout. Built the dbt layer from scratch at Nuffield rather than inheriting it."
    const { findings, dropped } = validateFindings(
      [{ requirement_ref: "R04", quote: "She came across as confident throughout", strength: "strong" }],
      REQS,
      src
    )
    // Verbatim, and still refused: the interviewer may write it, but it is
    // not evidence about a requirement.
    expect(findings).toHaveLength(0)
    expect(dropped[0]).toMatch(/describes the person/)
  })

  it("drops a requirement that is not on this role", () => {
    const { findings, dropped } = validateFindings(
      [{ requirement_ref: "R99", quote: "Comfortable with the on-call expectations", strength: "partial" }],
      REQS,
      WRITE_UP
    )
    expect(findings).toHaveLength(0)
    expect(dropped[0]).toMatch(/not a requirement on this role/)
  })

  it("keeps one finding per requirement", () => {
    const { findings, dropped } = validateFindings(
      [
        { requirement_ref: "R04", quote: "Built the dbt layer from scratch at Nuffield", strength: "strong" },
        { requirement_ref: "R04", quote: "Comfortable with the on-call expectations", strength: "partial" },
      ],
      REQS,
      WRITE_UP
    )
    expect(findings).toHaveLength(1)
    expect(dropped[0]).toMatch(/already covered/)
  })

  it("returning nothing is a correct answer", () => {
    const { findings } = validateFindings([], REQS, WRITE_UP)
    expect(findings).toEqual([])
  })
})

describe("the rows it writes", () => {
  it("carry the round, so withdrawal can take exactly what the round produced", () => {
    const { findings } = validateFindings(
      [{ requirement_ref: "R04", quote: "Built the dbt layer from scratch at Nuffield", strength: "strong" }],
      REQS,
      WRITE_UP
    )
    const rows = evidenceRows(findings, { agencyId: "a1", candidateId: "c1", roundId: "rd2", roundNumber: 2 })
    expect(rows[0]).toMatchObject({ origin: "interview", round_id: "rd2", strength: "strong" })
    expect(rows[0].source_cite).toBe("Interview · round 2 · write-up")
    // evidence_quote_iff_present: a non-missing row MUST carry a quote.
    expect(rows[0].quote.length).toBeGreaterThan(0)
  })
})

describe("which layer wins", () => {
  const cv = { requirement_id: "req-4", strength: "partial" as const, round_id: null, created_at: "2026-09-01T09:00:00Z" }
  const r1 = { requirement_id: "req-4", strength: "transferable" as const, round_id: "rd1", created_at: "2026-09-10T09:00:00Z" }
  const r2 = { requirement_id: "req-4", strength: "strong" as const, round_id: "rd2", created_at: "2026-09-20T09:00:00Z" }

  it("the latest round supersedes the CV", () => {
    expect(effectiveEvidence([cv, r1, r2])).toEqual({ "req-4": "strong" })
  })

  it("does not depend on the order rows arrive in", () => {
    // The bug this exists to prevent: an unordered read making the winner
    // "whichever row Postgres returned last".
    expect(effectiveEvidence([r2, cv, r1])).toEqual({ "req-4": "strong" })
    expect(effectiveEvidence([r1, r2, cv])).toEqual({ "req-4": "strong" })
  })

  it("a re-parsed CV never leapfrogs an interview", () => {
    const reparsed = { ...cv, created_at: "2026-09-30T09:00:00Z" }
    expect(effectiveEvidence([reparsed, r1])).toEqual({ "req-4": "transferable" })
  })

  it("falls back to the CV when a round said nothing", () => {
    expect(effectiveEvidence([cv])).toEqual({ "req-4": "partial" })
  })

  it("winningRows returns the whole winning row, not just its strength", () => {
    expect(winningRows([cv, r2]).get("req-4")).toMatchObject({ round_id: "rd2" })
  })
})

describe("the schema actually allows a layer", () => {
  const sql = sqlCode(readFileSync(join(ROOT, "supabase/migrations/20260921090000_evidence_layers.sql"), "utf8"))

  it("drops the one-row-per-requirement key", () => {
    expect(sql).toContain("drop constraint if exists candidate_evidence_candidate_id_requirement_id_key")
  })

  it("keeps the base layer unique", () => {
    expect(sql).toMatch(/candidate_evidence_base_unique[\s\S]*where round_id is null/)
  })

  it("allows one row per requirement per round, and no more", () => {
    expect(sql).toMatch(/candidate_evidence_round_unique[\s\S]*requirement_id, round_id\)[\s\S]*where round_id is not null/)
  })
})

describe("the route holds the product's lines", () => {
  const src = tsCode(readFileSync(join(ROOT, "app/api/agency/rounds/[roundId]/enrich/route.ts"), "utf8"))

  it("replaces this round's layer and touches no other", () => {
    expect(src).toContain('.eq("round_id", roundId)')
    expect(src).toContain('.eq("origin", "interview")')
  })

  it("rescores, because a score is derived from evidence", () => {
    expect(src).toContain("recomputeAndStore")
  })

  it("audits counts and refs, never the quotes", () => {
    // Just the writeAudit call. A slice to end-of-file also caught the HTTP
    // RESPONSE, which does carry quotes — correctly, since the recruiter is
    // entitled to the evidence. The audit row is the thing read by people
    // who are not.
    const start = src.indexOf("writeAudit(")
    const audit = src.slice(start, src.indexOf("})", src.indexOf("requirements:", start)))
    expect(audit).toContain("round_enriched")
    expect(audit).not.toContain("quote")
    expect(audit).toContain("wrote:")
  })

  it("rate limits and runs long enough", () => {
    expect(src).toContain('checkRateLimit(auth.ctx.userId, "ai")')
    expect(src).toContain("export const maxDuration = 300")
  })

  it("treats the write-up as data, not instruction", () => {
    const raw = readFileSync(join(ROOT, "app/api/agency/rounds/[roundId]/enrich/route.ts"), "utf8")
    expect(raw).toMatch(/data, not instruction/)
  })
})
