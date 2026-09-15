"use client"

/**
 * The interview loop, with the cohort spread across it.
 *
 * Figma "Tailr — Hiring Manager Concept", frame 11 · The interview loop.
 * Built 15 September 2026 after Ose, walking staging: "I'm sending out the
 * interview invites and I don't know where I am in the process."
 *
 * WHAT MAKES THIS NOT A STEPPER, and why that matters:
 *
 * A stepper says "Step 2 of 4" and puts a marker on one rung. That is the
 * wrong shape for a cohort, because four people sit on four rungs at once —
 * any single marker would have to choose one of them and be wrong about the
 * rest. So this shows a DISTRIBUTION: how many people have reached each
 * point. The separate question, "which part is mine?", is answered by the
 * card below the rail, because it is a different question and deserves its
 * own answer rather than a colour on a bar.
 *
 * DESIGN RULES THIS OBEYS (ui-ux-pro-max, priority order):
 *
 * - COLOUR IS NEVER THE ONLY CUE. The rung that needs the reader carries a
 *   word ("yours") and a caret, not just a coral border — the same rule that
 *   put "STRONG 1.0" on the evidence row instead of a coloured dot.
 * - TABULAR FIGURES on the counts, so a rail does not jitter as numbers
 *   change under a poll.
 * - IT IS NOT INTERACTIVE, so it must not look interactive: no pointer
 *   cursor, no hover lift, no press state. The actions live below it.
 * - A ROW OF NUMBERS IS MEANINGLESS READ ALOUD, so the rail carries one
 *   spoken sentence and the individual counts are hidden from assistive
 *   technology rather than announced as "4 1 2 1 0".
 * - NO SLA. An age is not a breach; nothing here turns red because time
 *   passed. Same refusal as next-action.ts.
 */

import type { LoopProgress, LoopRungKey } from "@/lib/agency/cohort-status"

export function LoopRail({
  progress,
  /** The rung the reader themselves is holding up, if any. */
  yours = null,
}: {
  progress: LoopProgress
  yours?: LoopRungKey | null
}) {
  const { rungs, total, noSuitableTime, cancelled, summary } = progress
  const empty = total === 0

  return (
    <div className="hm-loop">
      {/* One sentence, for the reader who cannot see a row of numbers. The
          rail itself is decorative once this has been said. */}
      <p className="ag-sr-only">{summary}</p>

      <ol className="hm-loop-rail" aria-hidden="true">
        {rungs.map((r) => {
          const isYours = yours === r.key
          // "Reached" is what gives the rail its shape at a glance: the
          // filled run stops where the cohort has got to.
          const reached = !empty && r.n > 0
          return (
            <li
              key={r.key}
              className="hm-loop-rung"
              data-reached={reached}
              data-yours={isYours}
            >
              <span className="hm-loop-n">{empty ? "—" : r.n}</span>
              <span className="hm-loop-label">{r.label}</span>
              {isYours && <span className="hm-loop-yours">↑ yours</span>}
            </li>
          )
        })}
      </ol>

      {/* Exits are not rungs. Somebody who could find no time did not get
          less far — they left the loop, and hiding that inside "invited"
          would quietly inflate every number after it. */}
      {(noSuitableTime > 0 || cancelled > 0) && (
        <p className="hm-loop-exits">
          {[
            noSuitableTime > 0 &&
              `${noSuitableTime} could not find a time that works — your recruiter can offer more`,
            cancelled > 0 && `${cancelled} cancelled`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  )
}
