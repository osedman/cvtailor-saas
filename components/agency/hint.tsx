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
  bare = false,
}: {
  /** The sentence. Plain words, one job. */
  text: string
  /** The pill's label. */
  children: ReactNode
  className?: string
  /** Optional visual tone of the pill; the hint itself never changes. */
  tone?: "fit" | "warn" | "muted" | "coral"
  /** Board 35: explain a value that already has its own look (a score
   *  badge, a label) without turning it into a pill. Same dot, same bubble. */
  bare?: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState(false)
  /** Where the open bubble sits, in viewport coordinates. */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLSpanElement>(null)

  const close = useCallback(() => setOpen(false), [])
  const show = useCallback(() => {
    if (openHint && openHint !== close) openHint()
    openHint = close
    const r = rootRef.current?.getBoundingClientRect()
    // A 280px hint leaving the right edge flips to hang from the pill's
    // right side instead. Measured on open, not on every scroll.
    const w = Math.min(280, window.innerWidth - 32)
    const flipped = !!r && r.left + w > window.innerWidth - 16
    setFlip(flipped)
    // FIXED WHILE OPEN (board 35, 30 Sep 2026). Absolutely positioned, the
    // bubble was clipped by any scrolling ancestor — the recruiter's sticky
    // score column cut it in half. Placed in viewport coordinates instead,
    // it escapes every overflow; it closes on scroll so it never drifts.
    if (r) setPos({ top: r.bottom + 6, left: Math.max(16, flipped ? r.right - w : r.left) })
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
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onDown)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
      if (openHint === close) openHint = null
    }
  }, [open, close])

  return (
    <span ref={rootRef} className={`ag-hint${open ? " is-open" : ""}${flip ? " is-flip" : ""}`}>
      <button
        type="button"
        className={bare ? "ag-hint-bare" : `ag-pill ag-hint-pill${tone ? ` tone-${tone}` : ""} ${className}`.trim()}
        aria-describedby={id}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={close}
        onFocus={show}
        onBlur={close}
        onClick={() => (open ? close() : show())}
      >
        {/* Bare: the value keeps its own classes on an inner span, so the
            button's reset cannot strip a badge's border or a label's face. */}
        {bare && className ? <span className={className}>{children}</span> : children}
        <span className="ag-hint-dot" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        id={id}
        className="ag-hint-bubble"
        style={open && pos ? { position: "fixed", top: pos.top, left: pos.left, right: "auto" } : undefined}
      >
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

/**
 * The recruiter's numbers (Figma board 35, approved 30 Sep 2026). The
 * recruiter gets the mechanics — weights, what moves a number — where the
 * hiring manager's HINTS keep the plain version. Mechanics only: nothing
 * here describes the person.
 */
export const RECRUITER_HINTS = {
  fit: "Out of 100: coverage of this role’s requirements 45%, strength of the quoted evidence 25%, seniority 10%, context 10%, CV completeness 10%. Your overrides move it; the original stays on record.",
  mustHaves: "Must-haves with any quoted evidence from the CV. The rest are gaps to probe on the call — a gap is a question, not a rejection.",
  confidence: "How complete the CV was to judge from. Low means ask on the call, not score them down.",
  requirement_coverage: "Coverage: the share of this role’s requirements the CV evidences.",
  evidence_strength: "Evidence: how strong the quotes are — stated directly counts for more than transferable or partial.",
  seniority_calibration: "Seniority: fit for the level the role is pitched at, judged from the CV.",
  context_fit: "Context: fit for the company’s setting, judged from the CV.",
  confidence_completeness: "Completeness: how much the CV lets us judge. A thin CV scores low here — that is about the document, not the person.",
  strong: "Strong: stated directly in the CV, with the quote.",
  transferable: "Transferable: the same skill, shown somewhere else.",
  partial: "Partial: some evidence, but thin.",
  missing: "Missing: nothing quoted — never filled in by guessing.",
} as const

/** The adjusted-score pill. */
export function adjustedHint(original: number): string {
  return `You changed this from ${original}. Your reason is in the audit log, and the client sees the change was made by a named person.`
}
