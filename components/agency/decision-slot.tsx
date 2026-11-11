"use client"

/**
 * The one decision control on step 05 (Figma board 26, node 528:2, signed
 * off 24 Sep 2026). It replaces the three-way segmented control on the
 * compare cards and is the SAME control on the recommendation tab's rows.
 *
 * One primary verb — "Add to shortlist" — and a quiet second row for the two
 * states that are not a submission: hold and pass. It renders three shapes:
 *
 *   · undecided   → primary "Add to shortlist"; quiet row "Hold · Pass"
 *   · shortlisted → tint box "✓ Shortlisted" with a quiet "Remove"
 *   · held/passed → SECONDARY "Add to shortlist"; the quiet row marks
 *                   which of the two it is ("On hold ✓" / "Passed ✓")
 *
 * "Pass" is the word on screen for the stored value "reject". The stored
 * value and the API do not change; only the label does, because a recruiter
 * reading "reject" on twenty cards reads a verdict, and this screen makes
 * none. This component never writes anything itself: every click goes back
 * through `onDecide`, which the page routes into the single human-only
 * decision writer — toggling semantics included, so "Remove", "On hold ✓"
 * and "Passed ✓" clear the decision by sending the same value again.
 */

const HOLD = "hold"
const PASS = "reject"
const IN = "shortlist"

export type DecisionValue = "shortlist" | "hold" | "reject" | null

export function DecisionSlot({
  decision,
  name,
  onDecide,
  quietRow = "always",
  disabled = false,
}: {
  decision: DecisionValue | string | null | undefined
  /** For the accessible names — the visible words stay short. */
  name: string
  onDecide: (decision: "shortlist" | "hold" | "reject") => void
  /**
   * "always": the Hold · Pass row is always present (the cards).
   * "when-decided": only shown once the person is held or passed (the
   * recommendation rows, where the head of the row is the verb).
   */
  quietRow?: "always" | "when-decided"
  disabled?: boolean
}) {
  const d = decision ?? null
  const inShortlist = d === IN
  const held = d === HOLD
  const passed = d === PASS
  const showQuiet = quietRow === "always" || held || passed

  return (
    <div className="ag-decision" data-state={inShortlist ? "in" : held ? "hold" : passed ? "pass" : "none"}>
      {inShortlist ? (
        <div className="ag-decision-in">
          <span className="ag-decision-in-label">✓ Shortlisted</span>
          <button
            type="button"
            className="ag-decision-quiet-btn"
            onClick={() => onDecide(IN)}
            disabled={disabled}
            aria-label={`Remove ${name} from the shortlist`}
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`ag-btn ${d ? "ag-btn-secondary" : "ag-btn-primary"} ag-decision-add`}
          onClick={() => onDecide(IN)}
          disabled={disabled}
          aria-label={`Add ${name} to the shortlist`}
        >
          Add to shortlist
        </button>
      )}
      {showQuiet && (
        <div className="ag-decision-quiet">
          <button
            type="button"
            className="ag-decision-quiet-btn"
            data-on={held}
            onClick={() => onDecide(HOLD)}
            disabled={disabled}
            aria-pressed={held}
            aria-label={held ? `${name} is on hold. Press to clear.` : `Hold ${name}`}
          >
            {held ? "On hold ✓" : "Hold"}
          </button>
          <button
            type="button"
            className="ag-decision-quiet-btn"
            data-on={passed}
            onClick={() => onDecide(PASS)}
            disabled={disabled}
            aria-pressed={passed}
            aria-label={passed ? `${name} is passed. Press to clear.` : `Pass on ${name}`}
          >
            {passed ? "Passed ✓" : "Pass"}
          </button>
        </div>
      )}
    </div>
  )
}
