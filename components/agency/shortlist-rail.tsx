"use client"

/**
 * The shortlist rail — step 05's right column (Figma board 26, node 528:2,
 * signed off 24 Sep 2026).
 *
 * WHAT IT IS. The shortlist being built, as a place: the people the
 * recruiter has added so far, in score order, with a visible slot for the
 * next add, a quiet count of who is on hold and who was passed, and the one
 * primary action on the step — "Confirm shortlist →". It sits beside BOTH
 * tabs (matrix and recommendation) so an add from either has somewhere to
 * land, and it is the same component in both places.
 *
 * WHAT IT NEVER DOES.
 *   · It never decides. Nobody appears here unless the recruiter clicked
 *     "Add to shortlist" on that person; the × goes back through the same
 *     single human-only decision writer and clears the decision.
 *   · It never sends. Confirm opens the submission step (step 07) exactly
 *     as "Build submission" did; nothing reaches the client until the
 *     recruiter builds it there. The caption under the button says so.
 *   · It never reorders by anything but score, and the order can still be
 *     changed on the submission.
 *
 * On a phone (≤ 900px, where the app sidebar hides) the column is not shown;
 * `ShortlistBar` renders the same content as a sticky bottom bar that opens
 * into a sheet. Same props, same component inside.
 */

import { useEffect, useRef, useState } from "react"
import { ChevronUp } from "lucide-react"

export interface ShortlistEntry {
  id: string
  name: string
  initials: string
  overall: number
  mustHit: number
  mustTotal: number
}

export interface ShortlistRailProps {
  company: string
  entries: ShortlistEntry[]
  holdCount: number
  passedCount: number
  onRemove: (candidateId: string) => void
  onConfirm: () => void
  /** Sheet mode drops the card chrome; the sheet supplies its own. */
  variant?: "card" | "sheet"
}

function railTitle(n: number): string {
  if (n === 0) return "Nobody yet"
  if (n === 1) return "1 person, in score order"
  return `${n} people, in score order`
}

export function ShortlistRail({
  company,
  entries,
  holdCount,
  passedCount,
  onRemove,
  onConfirm,
  variant = "card",
}: ShortlistRailProps) {
  const n = entries.length
  return (
    <section className={`ag-sl ${variant === "card" ? "ag-card ag-sl-card" : "ag-sl-sheet-body"}`} aria-label="Your shortlist">
      <div className="ag-sl-head">
        <span className="ag-field-label ag-sl-eyebrow">
          Your shortlist{company ? ` · ${company}` : ""}
        </span>
        <h2 className="ag-sl-title" aria-live="polite">{railTitle(n)}</h2>
        <p className="ag-sl-sub">
          Add from the cards or the recommendation. The order can change on the submission.
        </p>
      </div>

      <ol className="ag-sl-list">
        {entries.map((e) => (
          <li className="ag-sl-row" key={e.id}>
            <span className="ag-avatar ag-sl-avatar" aria-hidden>{e.initials}</span>
            <span className="ag-sl-who">
              <span className="ag-sl-name">{e.name}</span>
              <span className="ag-meta ag-sl-fit">FIT {Math.round(e.overall)} · MUST {e.mustHit}/{e.mustTotal}</span>
            </span>
            <button
              type="button"
              className="ag-icon-btn ag-sl-x"
              onClick={() => onRemove(e.id)}
              aria-label={`Remove ${e.name} from the shortlist`}
              title={`Remove ${e.name} from the shortlist`}
            >
              ×
            </button>
          </li>
        ))}
        <li className="ag-sl-slot" aria-hidden>Your next add lands here</li>
      </ol>

      <div className="ag-sl-quiet">
        <div>
          <span className="ag-field-label ag-sl-quiet-label">On hold · {holdCount}</span>
          <span className="ag-sl-quiet-note">Kept for later. Never sent.</span>
        </div>
        <div>
          <span className="ag-field-label ag-sl-quiet-label">Passed · {passedCount}</span>
          <span className="ag-sl-quiet-note">Internal record only.</span>
        </div>
      </div>

      <div className="ag-sl-foot">
        <button
          type="button"
          className="ag-btn ag-btn-primary ag-sl-confirm"
          onClick={onConfirm}
          disabled={n === 0}
        >
          Confirm shortlist →
        </button>
        <p className="ag-sl-caption">
          Opens the submission step. Nothing reaches the client until you build it there.
        </p>
      </div>
    </section>
  )
}

/**
 * The phone form of the rail: a sticky bottom bar that names who is in and
 * carries Confirm, and opens the full rail as a bottom sheet when tapped.
 * Hidden above 900px by the stylesheet; the column renders there instead.
 */
export function ShortlistBar(props: ShortlistRailProps) {
  const [open, setOpen] = useState(false)
  const { entries, onConfirm } = props
  const n = entries.length
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  // Escape closes; focus moves into the sheet when it opens and back to the
  // bar when it closes, so a keyboard user is never left behind the scrim.
  // Tab wraps inside the sheet while it is open: aria-modal promises a
  // screen reader that nothing else is reachable, and the keyboard must keep
  // that promise too (the ≤900px breakpoint is also a half-width desktop
  // window with a keyboard). Everything under the scrim is marked inert for
  // the same reason.
  useEffect(() => {
    if (!open) return
    const sheet = sheetRef.current
    sheet?.focus()
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        return
      }
      if (e.key !== "Tab" || !sheet) return
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) {
        e.preventDefault()
        sheet.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && sheet.contains(active)
      if (e.shiftKey) {
        if (!inside || active === first || active === sheet) {
          e.preventDefault()
          last.focus()
        }
      } else if (!inside || active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    // The page behind the sheet: nothing there takes focus or a click until
    // the sheet closes. Siblings of the bar's own wrapper are the page.
    const wrapper = sheet?.parentElement
    const behind: HTMLElement[] = []
    if (wrapper) {
      for (const el of Array.from(wrapper.children)) {
        if (el instanceof HTMLElement && !el.contains(sheet) && !el.classList.contains("ag-sl-scrim")) {
          behind.push(el)
        }
      }
      for (const el of behind) el.setAttribute("inert", "")
    }
    return () => {
      window.removeEventListener("keydown", onKey)
      for (const el of behind) el.removeAttribute("inert")
      openerRef.current?.focus()
    }
  }, [open])

  // Nothing to show once the sheet lists nobody — close rather than leave an
  // empty sheet over the cards.
  useEffect(() => {
    if (n === 0) setOpen(false)
  }, [n])

  const firsts = entries.map((e) => e.name.split(/\s+/)[0]).filter(Boolean)
  const shown = firsts.slice(0, 3).join(", ")
  const more = firsts.length > 3 ? ` +${firsts.length - 3} more` : ""

  return (
    <>
      <div className="ag-sl-bar" data-open={open}>
        <button
          type="button"
          ref={openerRef}
          className="ag-sl-bar-open"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="ag-sl-sheet"
          disabled={n === 0}
        >
          <span className="ag-field-label ag-sl-bar-label">Shortlist · {n}</span>
          <span className="ag-sl-bar-names">{n === 0 ? "Nobody yet" : `${shown}${more}`}</span>
          <ChevronUp size={16} className="ag-sl-bar-chev" aria-hidden />
        </button>
        <button
          type="button"
          className="ag-btn ag-btn-primary ag-sl-bar-confirm"
          onClick={onConfirm}
          disabled={n === 0}
        >
          Confirm →
        </button>
      </div>

      {open && (
        <>
          <div className="ag-sl-scrim" onClick={() => setOpen(false)} aria-hidden />
          <div
            id="ag-sl-sheet"
            ref={sheetRef}
            tabIndex={-1}
            className="ag-sl-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Your shortlist"
          >
            <button
              type="button"
              className="ag-sl-grab"
              onClick={() => setOpen(false)}
              aria-label="Close the shortlist"
            >
              <span aria-hidden />
            </button>
            <ShortlistRail {...props} variant="sheet" />
          </div>
        </>
      )}
    </>
  )
}
