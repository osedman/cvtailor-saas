/**
 * The client's decision on each round, as a row of dots — Figma frame 21.
 *
 * Shape AND colour carry the outcome (a tick, a cross, a hollow ring, a
 * dashed ring), and each dot has its words for a screen reader, so nothing
 * here is readable by colour alone. The same trail appears on close-out and
 * in the candidates table, so a person reads the same picture in both.
 */

import { Check, X } from "lucide-react"
import type { Stage, TrailStep } from "@/lib/agency/stage"

const OUTCOME_WORD: Record<TrailStep["outcome"], string> = {
  advance: "advanced",
  decline: "not advanced",
  hold: "on hold",
  open: "no decision yet",
  cancelled: "cancelled",
}

export function RoundTrail({ trail }: { trail: TrailStep[] }) {
  if (trail.length === 0) return null
  return (
    <ol className="ag-trail" aria-label="The client’s decision on each round">
      {trail.map((s) => (
        <li key={s.round} className={`ag-trail-step ${s.outcome}`}>
          <span className="ag-trail-dot" aria-hidden="true">
            {s.outcome === "advance" && <Check size={11} strokeWidth={3} />}
            {s.outcome === "decline" && <X size={10} strokeWidth={3} />}
          </span>
          <span aria-hidden="true">R{s.round}</span>
          <span className="ag-sr-only">Round {s.round}: {OUTCOME_WORD[s.outcome]}</span>
        </li>
      ))}
    </ol>
  )
}

/** Trail plus its one-line summary. `null` stage renders the quiet dash. */
export function StageCell({ stage, emptyLabel = "Not shortlisted — not interviewed" }: { stage: Stage | null; emptyLabel?: string }) {
  if (!stage) return <span className="ag-stage-none">{emptyLabel}</span>
  return (
    <span className="ag-stage">
      <RoundTrail trail={stage.trail} />
      <span className={`ag-stage-label${stage.kind === "taken-forward" || stage.kind === "placed" ? " fwd" : ""}`}>{stage.label}</span>
    </span>
  )
}
