"use client"

/**
 * The recruiter's score block, once (Figma board 35, approved 30 Sep 2026).
 *
 * The same "nutrition" panel — overall fit, five weighted categories,
 * must-have coverage, confidence — was hand-drawn three times (screening
 * side, compare cards, candidate detail), each with nothing saying what any
 * number was. It lives here now, with board 35's hints on every label.
 *
 * Confidence is THREE bars: the engine only ever gives 1–3
 * (assessment.ts clamps to [1, 2, 3]), and four bars with "of 4" implied a
 * top level nobody could reach.
 */

import { Hint, RECRUITER_HINTS, adjustedHint } from "./hint"

export interface ScoreLike {
  overall: number
  original_overall: number | null
  must_have_hit: number
  must_have_total: number
  confidence_level: number
  requirement_coverage: number
  evidence_strength: number
  seniority_calibration: number
  context_fit: number
  confidence_completeness: number
}

export const FIT_CATEGORIES = [
  { key: "requirement_coverage", label: "Requirement coverage", weight: 45 },
  { key: "evidence_strength", label: "Evidence strength", weight: 25 },
  { key: "seniority_calibration", label: "Seniority calibration", weight: 10 },
  { key: "context_fit", label: "Context fit", weight: 10 },
  { key: "confidence_completeness", label: "Confidence / completeness", weight: 10 },
] as const

const LEVEL_WORD = ["", "Low", "Medium", "High"] as const
const levelOf = (n: number) => Math.min(3, Math.max(1, Math.round(n) || 2))

export function ScoreBreakdown({ score, markWeak = false }: { score: ScoreLike; markWeak?: boolean }) {
  return (
    <>
      <div className="ag-nutrition-top">
        <Hint bare text={RECRUITER_HINTS.fit} className="ag-field-label ag-hint-label">
          Overall fit
        </Hint>
        <span className="ag-nutrition-score">{Math.round(score.overall)}</span>
      </div>
      <div className="ag-nutrition-rule" />
      {FIT_CATEGORIES.map((row) => {
        const v = Math.round(Number(score[row.key]) || 0)
        return (
          <div key={row.key} className="ag-fit-row">
            <Hint bare text={RECRUITER_HINTS[row.key]} className="ag-fit-label">
              {row.label}
            </Hint>
            <span className="ag-fit-num">
              {row.weight}% · <b>{v}</b>
            </span>
            <div className="ag-bar">
              <div className="ag-bar-fill" data-weak={markWeak ? v < 60 : undefined} style={{ width: `${Math.min(100, v)}%` }} />
            </div>
          </div>
        )
      })}
      <div className="ag-nutrition-foot">
        <Hint bare text={RECRUITER_HINTS.mustHaves} className="ag-fit-label">
          Must-have coverage
        </Hint>
        <span className="ag-fit-num">
          <b>
            {score.must_have_hit}/{score.must_have_total}
          </b>
        </span>
      </div>
    </>
  )
}

export function ConfidenceBars({ level }: { level: number }) {
  const l = levelOf(level)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="ag-conf-bars" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className="ag-conf-bar" data-on={n <= l} style={{ height: 4 + n * 4 }} />
        ))}
      </span>
      <Hint bare text={RECRUITER_HINTS.confidence} className="ag-meta">
        {LEVEL_WORD[l]} confidence
      </Hint>
    </div>
  )
}

/** "82 → 88 +6", explained. Renders nothing when the score was not moved. */
export function AdjustedPill({ original, overall, signed = false }: { original: number | null; overall: number; signed?: boolean }) {
  if (original == null || Math.round(original) === Math.round(overall)) return null
  const d = Math.round(overall - original)
  return (
    <Hint bare text={adjustedHint(Math.round(original))} className="ag-delta-pill">
      {Math.round(original)} → {Math.round(overall)}
      {signed ? ` ${d > 0 ? "+" : ""}${d}` : ""}
    </Hint>
  )
}

/** A strength in the compare legend, explained. */
export function StrengthKey({ strength, label }: { strength: "strong" | "transferable" | "partial" | "missing"; label: string }) {
  return (
    <Hint bare text={RECRUITER_HINTS[strength]}>
      <span className={`ag-dot ${strength}`} /> {label}
    </Hint>
  )
}
