"use client"

/**
 * The phase rail: where this role is, on every screen that belongs to it.
 *
 * Mirrors the strip hiring managers have always had on their own role cards
 * (BRIEF · SHORTLIST · R1 · R2 · DECIDE), so this is a shipped pattern moving
 * across the hat rather than a new invention. The recruiter side had no
 * equivalent, which is why finishing a phase felt like nothing happening.
 *
 * The current chip can carry the sub-state (SCREENING 3 OF 8, WRITE-UP DUE)
 * so the rail names the moment, not just the phase. It comes from
 * lib/agency/next-action.ts via the header route; the rail never derives it.
 *
 * Renders nothing until the facts have loaded. A rail that guesses "Shortlist"
 * while the fetch is in flight would tell a recruiter in handover that they
 * are at the start, and a wrong answer here is worse than no answer.
 */

import { useRouter } from "next/navigation"
import { PHASES, phaseHref, phaseState, type PhaseKey } from "@/lib/agency/phases"

export function PhaseRail({
  current,
  roleId,
  subState,
}: {
  current: PhaseKey | null
  roleId: string
  /** The current chip's sub-state text, already uppercase. */
  subState?: string | null
}) {
  const router = useRouter()
  if (!current) return null

  return (
    <nav className="ag-phase-rail" aria-label="Role phase">
      {PHASES.map((p, i) => {
        const state = phaseState(p.key, current)
        return (
          <span key={p.key} className="ag-phase-item">
            {i > 0 && <span className="ag-phase-link" aria-hidden="true" />}
            <button
              type="button"
              className={`ag-phase-chip ${state}`}
              aria-current={state === "now" ? "step" : undefined}
              title={p.endsWhen}
              onClick={() => router.push(phaseHref(p.key, roleId))}
            >
              {state === "done" && <span aria-hidden="true">✓ </span>}
              {p.label}
              {state === "now" && subState && <span className="ag-phase-sub"> · {subState}</span>}
            </button>
          </span>
        )
      })}
    </nav>
  )
}
