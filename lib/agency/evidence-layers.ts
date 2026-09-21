/**
 * Which layer of evidence wins, when a requirement has more than one.
 *
 * Until migration 37 a candidate had exactly one evidence row per
 * requirement, so "the evidence" was unambiguous and every screen built its
 * own `Record<requirementId, Strength>` by iterating rows in whatever order
 * Postgres returned them. That was safe precisely because there was only ever
 * one row to find.
 *
 * Rounds change that: a second interview may say something about a
 * requirement the CV already covered. With two rows and no rule, every one of
 * those maps silently becomes "whichever row came back last" — non-
 * deterministic, and different on different screens. So the rule lives here,
 * once, and the places that need it import it.
 *
 * THE RULE: the latest layer wins.
 *
 * A round is later than the CV and first-hand rather than claimed, so what it
 * found supersedes what the CV said about that requirement. Two rounds: the
 * later one. It is ordered by `created_at` rather than round number because
 * evidence rows carry the former and not the latter, and enrichment for round
 * 2 is by construction written after round 1's.
 *
 * WHAT THIS DOES NOT DECIDE. A recruiter override still beats every layer —
 * that is applied above this, in scoring.ts, and is the one thing a human
 * says directly. And superseding is not erasing: every layer stays in the
 * table, the dossier renders all of them as stratigraphy, and round-delta
 * shows what a round changed. This function answers "what does the record
 * currently say", not "what has ever been said".
 */

import type { Strength } from "./types"

export interface EvidenceLayerRow {
  requirement_id: string
  strength: Strength
  /** Null for the base layer (CV, Tailr profile, application). */
  round_id?: string | null
  /** ISO. Absent rows sort as oldest, which keeps a base row underneath. */
  created_at?: string | null
}

/**
 * Collapse layered rows to one strength per requirement.
 *
 * Rows may arrive in any order: this sorts rather than trusting the caller,
 * because the bug it exists to prevent is exactly an unordered read.
 */
export function effectiveEvidence<T extends EvidenceLayerRow>(rows: T[]): Record<string, Strength> {
  const out: Record<string, Strength> = {}
  for (const row of sortByLayer(rows)) {
    out[row.requirement_id] = row.strength
  }
  return out
}

/**
 * The same ordering, exposed for callers that need the whole row rather than
 * just the strength — the compare board wants the winning quote and cite too.
 */
export function winningRows<T extends EvidenceLayerRow>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>()
  for (const row of sortByLayer(rows)) {
    out.set(row.requirement_id, row)
  }
  return out
}

/** Oldest first, so a later layer overwrites an earlier one on assignment. */
function sortByLayer<T extends EvidenceLayerRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    // A base row (no round) is always underneath a round row, whatever the
    // timestamps say — a CV re-parse must never leapfrog an interview.
    const aBase = !a.round_id
    const bBase = !b.round_id
    if (aBase !== bBase) return aBase ? -1 : 1
    const at = a.created_at ? Date.parse(a.created_at) : 0
    const bt = b.created_at ? Date.parse(b.created_at) : 0
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt
    return 0
  })
}
