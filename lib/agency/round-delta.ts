/**
 * What one round added — Figma "HM · Round delta".
 *
 * A pure function over a built Dossier. No database, no server imports: the
 * dossier is already fetched by the page, and keeping this pure means the
 * interesting logic is testable without mocking a single query. Type-only
 * imports from ./dossier are erased at compile time, so this is safe to run in
 * the browser.
 *
 * WHAT IT WILL NOT CLAIM. There is no automatic contradiction detection here.
 * Deciding that "led a team of 8" and "three of us" conflict is a judgement
 * about meaning, and the product's whole argument is that judgements belong to
 * people. So a requirement the round revisited shows what was there BEFORE
 * beside what the round produced, together, and the recruiter reads them. The
 * frame called that lane CONTRADICTION because the example was one; the honest
 * name for what the code can actually know is REVISITED.
 *
 * Score movement per round is likewise absent: score_breakdowns stores the
 * original and the current, not a value per round, so a per-round score delta
 * would be invented. When enrichment ships and rounds start moving strengths,
 * the CHANGED lane fills from real strength transitions.
 */

import type { Dossier, Layer, RequirementStrata, Strength } from "./dossier"

export type DeltaLane = "added" | "changed" | "revisited" | "open"

export interface DeltaItem {
  ref: string
  requirement: string
  weight: string
  lane: DeltaLane
  /** What this round produced for the requirement. */
  now: Layer | null
  /** The most recent layer that existed before this round, if any. */
  before: Layer | null
  /** Only on `changed`: a real strength transition, never inferred. */
  from?: Strength
  to?: Strength
}

export interface RoundDelta {
  roundNumber: number
  when: string | null
  status: string
  artifact: string | null
  decision: string | null
  added: DeltaItem[]
  changed: DeltaItem[]
  revisited: DeltaItem[]
  stillOpen: DeltaItem[]
  /** True when the round produced nothing at all — said plainly rather than
   * rendered as four empty columns. */
  empty: boolean
}

/** `R3` → 3. Labels are produced by the dossier assembler, not user input. */
function roundOf(layer: Layer): number | null {
  if (layer.kind !== "round") return null
  const m = /^R(\d+)$/.exec(layer.label)
  return m ? Number(m[1]) : null
}

function lastBefore(r: RequirementStrata, n: number): Layer | null {
  const before = r.layers.filter((l) => {
    const rn = roundOf(l)
    return rn === null ? true : rn < n
  })
  return before.length > 0 ? before[before.length - 1] : null
}

export function deltaForRound(d: Dossier, roundNumber: number): RoundDelta | null {
  const round = d.rounds.find((r) => r.number === roundNumber)
  if (!round) return null

  const added: DeltaItem[] = []
  const changed: DeltaItem[] = []
  const revisited: DeltaItem[] = []
  const stillOpen: DeltaItem[] = []

  for (const r of d.requirements) {
    const produced = r.layers.filter((l) => roundOf(l) === roundNumber)
    const before = lastBefore(r, roundNumber)

    if (produced.length === 0) {
      // Nothing from this round. It only belongs on the board if the
      // requirement is still unproven — a settled one is not news.
      if (r.open) {
        stillOpen.push({
          ref: r.ref,
          requirement: r.text,
          weight: r.weight,
          lane: "open",
          now: null,
          before,
        })
      }
      continue
    }

    const now = produced[produced.length - 1]
    const base: DeltaItem = {
      ref: r.ref,
      requirement: r.text,
      weight: r.weight,
      lane: "added",
      now,
      before,
    }

    if (!before) {
      added.push(base)
      continue
    }

    // A real transition, only when both sides actually carry a strength.
    // Debrief answers carry none — nobody scored them, a person wrote them —
    // so those land in `revisited` rather than being dressed up as a change.
    if (now.strength && before.strength && now.strength !== before.strength) {
      changed.push({ ...base, lane: "changed", from: before.strength, to: now.strength })
      continue
    }

    revisited.push({ ...base, lane: "revisited" })
  }

  return {
    roundNumber,
    when: round.when,
    status: round.status,
    artifact: round.artifact,
    decision: round.decision,
    added,
    changed,
    revisited,
    stillOpen,
    empty: added.length === 0 && changed.length === 0 && revisited.length === 0,
  }
}
