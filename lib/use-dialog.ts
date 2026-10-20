"use client"

/**
 * The behaviour a `role="dialog" aria-modal="true"` element has to have to
 * mean what it says.
 *
 * The consent sheet on /found announced itself as a modal while the page
 * behind it stayed tabbable, Escape did nothing, focus never entered the
 * dialog, and closing dropped focus to the top of the document. For a
 * surface whose entire job is "read this before anything is shared", a
 * keyboard user being able to tab straight past it into the page underneath
 * is not a polish issue.
 *
 * One hook, so the two dialogs cannot drift:
 *   - focus moves into the dialog on open (the panel itself, not the primary
 *     button — landing on "Send this to X" would put the destructive-ish
 *     action under an accidental Enter)
 *   - Tab and Shift+Tab cycle within it
 *   - Escape closes
 *   - focus returns to whatever opened it
 *   - the page behind cannot scroll
 *
 * Returns a ref to attach to the dialog panel.
 */

import { useCallback, useEffect, useRef } from "react"

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

export function useDialog(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  // Keep the latest onClose without re-running the effect (and so re-locking
  // scroll) every render.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return

    restoreTo.current = document.activeElement as HTMLElement | null

    // The panel takes focus itself: no control is pre-armed for Enter.
    panel.setAttribute("tabindex", "-1")
    panel.focus({ preventScroll: true })

    const { overflow, paddingRight } = document.body.style
    // Compensate for the scrollbar so locking does not shift the layout.
    const gap = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = "hidden"
    if (gap > 0) document.body.style.paddingRight = `${gap}px`

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== "Tab") return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      restoreTo.current?.focus?.({ preventScroll: true })
    }
  }, [open])

  /** Click-outside-to-dismiss, for scrims where that is safe. */
  const onScrimClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) closeRef.current()
    },
    []
  )

  return { panelRef, onScrimClick }
}
