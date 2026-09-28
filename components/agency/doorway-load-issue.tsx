"use client"

/**
 * The card a token doorway (booking, consent, reference) shows when loading
 * it was refused for a reason that is NOT a dead link — see
 * lib/agency/doorway-messages.ts for the mapping.
 *
 *   busy   the rate limiter said wait. Counts down and retries on its own,
 *          with a "Try again now" for the impatient; the person should not
 *          need to know what a rate limit is to get their page back.
 *   retry  our side failed. One "Try again" button.
 *
 * The dead card stays in each page, because its wording is each page's own.
 * Uses the consent doorway's cs- classes, like the pages it sits in.
 */

import { useEffect, useState } from "react"
import { busyBody, type DoorwayLoadState } from "@/lib/agency/doorway-messages"

export function DoorwayLoadIssue({
  issue,
  onRetry,
  eyebrow,
}: {
  issue: Exclude<DoorwayLoadState, { kind: "dead" }>
  onRetry: () => void
  eyebrow?: string
}) {
  // The countdown belongs to one issue: a fresh 429 is a fresh object and
  // restarts from its own delay (adjusting state during render, not in an
  // effect, so a stale zero can never fire an immediate retry).
  const start = issue.kind === "busy" ? issue.retryInSeconds : 0
  const [count, setCount] = useState({ issue, left: start })
  if (count.issue !== issue) setCount({ issue, left: start })
  const retryIn = count.issue === issue ? count.left : start

  useEffect(() => {
    if (issue.kind !== "busy") return
    if (retryIn <= 0) {
      onRetry()
      return
    }
    const t = setTimeout(() => setCount((c) => (c.issue === issue ? { issue, left: c.left - 1 } : c)), 1000)
    return () => clearTimeout(t)
  }, [issue, retryIn, onRetry])

  return (
    <main className="cs-wrap">
      <div className="cs-card">
        {eyebrow && <p className="cs-eyebrow">{eyebrow}</p>}
        <h1 className="cs-title" aria-live="polite">
          {issue.title}
        </h1>
        <p className="cs-body">{issue.kind === "busy" ? busyBody(retryIn) : issue.body}</p>
        <div className="cs-choice">
          <button
            type="button"
            className={issue.kind === "busy" ? "cs-btn cs-btn-quiet" : "cs-btn"}
            onClick={onRetry}
          >
            {issue.kind === "busy" ? "Try again now" : "Try again"}
          </button>
        </div>
      </div>
    </main>
  )
}
