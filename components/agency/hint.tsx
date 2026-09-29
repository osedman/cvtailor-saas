"use client"

/**
 * A hint: one sentence that explains a number or a state — Figma board 32,
 * band A (approved 29 Sep 2026).
 *
 * Ose, 29 Sep: "things like tooltips". The pills said FIT 97 and 6 OF 7
 * MUST-HAVES and NEEDS YOUR WRITE-UP, and nothing on the page said what any
 * of them meant. A hint says what the value already is — never a new fact.
 *
 * It opens on hover and on keyboard focus (desktop), and on tap (touch,
 * where hover does not exist). Esc closes it; so does a tap or click
 * anywhere else. One is open at a time, because a second one opening over
 * the first is how tooltips become clutter.
 *
 * ACCESSIBLE BY CONSTRUCTION. The pill is a button (so it is reachable and
 * has a name); the hint is its aria-describedby, present in the DOM even
 * when hidden, so a screen reader hears the sentence with the value. No
 * portal: the hint is a sibling, positioned under the pill, and flips to
 * the left when it would leave the viewport. Reduced motion respected via
 * the stylesheet.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"

let openHint: (() => void) | null = null

export function Hint({
  text,
  children,
  className = "",
  tone,
}: {
  /** The sentence. Plain words, one job. */
  text: string
  /** The pill's label. */
  children: ReactNode
  className?: string
  /** Optional visual tone of the pill; the hint itself never changes. */
  tone?: "fit" | "warn" | "muted" | "coral"
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  const close = useCallback(() => setOpen(false), [])
  const show = useCallback(() => {
    if (openHint && openHint !== close) openHint()
    openHint = close
    const r = rootRef.current?.getBoundingClientRect()
    // A 280px hint leaving the right edge flips to hang from the pill's
    // right side instead. Measured on open, not on every scroll.
    setFlip(!!r && r.left + 280 > window.innerWidth - 16)
    setOpen(true)
  }, [close])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onDown)
      if (openHint === close) openHint = null
    }
  }, [open, close])

  return (
    <span ref={rootRef} className={`ag-hint${open ? " is-open" : ""}${flip ? " is-flip" : ""}`}>
      <button
        type="button"
        className={`ag-pill ag-hint-pill${tone ? ` tone-${tone}` : ""} ${className}`.trim()}
        aria-describedby={id}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={close}
        onFocus={show}
        onBlur={close}
        onClick={() => (open ? close() : show())}
      >
        {children}
        <span className="ag-hint-dot" aria-hidden="true" />
      </button>
      <span role="tooltip" id={id} className="ag-hint-bubble">
        {text}
      </span>
    </span>
  )
}

/** The sentences, in one place, so a number means the same thing on every screen. */
export const HINTS = {
  fit: "How much of your brief their CV evidences, out of 100, worked out from the quoted evidence. If your recruiter adjusted it, their reason is on record. Not a prediction about the person.",
  mustHaves: "Must-haves from your brief with a direct quote from their CV under them. Any without are listed under known gaps.",
  needsWriteUp: "The interview has ended. Write what you saw — your decision opens once it is saved.",
  needsDecision: "Your write-up is saved. Advance, hold, or decline — none of these removes anyone.",
  scheduled: "Booked and not yet happened. Nothing for you to do until it has.",
  happeningNow: "Started, not yet over. The write-up opens when it ends.",
  hold: "Not this wave. They stay on your list and are not told.",
  advance: "Invited to the next round from the times you offer.",
  takenForward: "You advanced them at the last planned round. They are in your final choice.",
  decline: "Not for this role. A signal to your recruiter, never a removal — the candidate is not told by Tailr.",
  handoverLocked: "Opens when your recruiter delivers the handover pack. Nothing for you to do yet.",
} as const
