"use client"

/**
 * The interview room, intercepted — the same URL, over the loop you were on.
 *
 * Arriving from the cohort board keeps that board mounted and scrolled behind
 * the dialog, so closing returns you exactly where you were rather than
 * remounting a list you were working through. A cold load, a refresh, or
 * somebody else opening your link misses the intercept and gets the page.
 *
 * Three ways out, because a modal with one is a trap: Escape, the backdrop,
 * and the browser's own Back — which works because this is a real navigation
 * and not component state. The half-written draft in the box survives all
 * three; it is kept per round, not per mount.
 *
 * Lifted from the candidate-detail modal (14 Sep) on purpose. Its 14 pins
 * cover exactly these behaviours, and a second, subtly different modal is how
 * a product ends up with two answers to "how do I get out of this".
 */

import { use, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { InterviewRoom } from "@/components/agency/interview-room"

export default function InterviewRoomModal({
  params,
}: {
  params: Promise<{ roleId: string; candidateRef: string }>
}) {
  const { roleId, candidateRef } = use(params)
  const router = useRouter()
  const panel = useRef<HTMLDivElement>(null)
  /** Whatever had focus when it opened, so it can be given back. */
  const opener = useRef<HTMLElement | null>(null)

  const close = useCallback(() => router.back(), [router])

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null
    panel.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener("keydown", onKey)

    // The loop behind must not scroll while a dialog is over it.
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
      // Back to the row that was clicked, not the top of the document.
      opener.current?.focus?.()
    }
  }, [close])

  return (
    <div className="ag-modal" role="presentation">
      <div className="ag-modal-scrim" onClick={close} />
      <div
        ref={panel}
        className="ag-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Interview room"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ag-modal-bar">
          <span className="ag-meta">Interview · {decodeURIComponent(candidateRef)}</span>
          <span className="ag-grow" />
          <button className="ag-btn ag-btn-secondary" onClick={close}>
            Close
          </button>
        </div>
        <div className="ag-modal-body">
          <InterviewRoom roleId={roleId} candidateRef={decodeURIComponent(candidateRef)} inModal />
        </div>
      </div>
    </div>
  )
}
