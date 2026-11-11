/**
 * The shortlist's three stages — Figma board 40, band A (approved 8 Oct 2026,
 * Ose; UAT review item 19).
 *
 * "Add to shortlist", "Confirm shortlist" and the client submission were three
 * controls in two places with nothing saying they were one path. The same
 * strip now sits on the shortlist rail and on the submission step: the stage
 * you are in is dark, finished ones tick. It only shows where you are — it
 * never moves you, and no button behaves differently because of it.
 */

export const SHORTLIST_STAGES = ["Add people", "Confirm", "Send to client"] as const

export function ShortlistStages({ at, done = false }: { at: 0 | 1 | 2; done?: boolean }) {
  return (
    <ol className="ag-stages" aria-label={`Stage ${at + 1} of 3: ${SHORTLIST_STAGES[at]}`}>
      {SHORTLIST_STAGES.map((name, i) => {
        const st = i < at || (done && i === at) ? "done" : i === at ? "here" : "next"
        return (
          <li key={name} className="ag-stage-step" data-s={st} aria-current={i === at ? "step" : undefined}>
            <span className="ag-stage-dot" aria-hidden="true">{st === "done" ? "✓" : i + 1}</span>
            <span className="ag-stage-name">{name}</span>
          </li>
        )
      })}
      {/* The phone form: one line instead of three (board 40). */}
      <li className="ag-stages-compact" aria-hidden="true">
        Stage {at + 1} of 3 · {SHORTLIST_STAGES[at]}
      </li>
    </ol>
  )
}
