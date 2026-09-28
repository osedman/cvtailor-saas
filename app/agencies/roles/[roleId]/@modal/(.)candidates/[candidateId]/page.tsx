"use client"

/**
 * Candidate detail, intercepted — the same URL, over the pane you were on.
 *
 * Arriving here from compare or screening keeps that pane mounted and
 * scrolled behind the dialog, so closing returns you exactly where you were
 * rather than remounting the list you were working through. A cold load, a
 * refresh, or somebody else opening your link misses the intercept entirely
 * and gets the real page.
 *
 * Three ways out, because a modal with one is a trap: Escape, the backdrop,
 * and the browser's own Back — which works because this is a real navigation
 * and not component state.
 */

import { use, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { CandidateDetail } from "@/components/agency/candidate-detail"

export default function CandidateDetailModal({
  params,
}: {
  params: Promise<{ roleId: string; candidateId: string }>
}) {
  const { roleId, candidateId } = use(params)
  const router = useRouter()
  const panel = useRef<HTMLDivElement>(null)
  /** Whatever had focus when the modal opened, so it can be given back. */
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

    // The pane behind must not scroll while a dialog is over it.
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
      // Back to the row that was clicked, not to the top of the document.
      opener.current?.focus?.()
    }
  }, [close])

  return (
    <div className="ag-modal" role="presentation">
      {/* Backdrop first so the panel paints over it. Clicking it closes;
          clicking inside the panel must not, hence the stopPropagation. */}
      <div className="ag-modal-scrim" onClick={close} />
      <div
        ref={panel}
        className="ag-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Candidate detail"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ag-modal-bar">
          <span className="ag-meta">Step 06 · Candidate detail</span>
          <span className="ag-grow" />
          <button className="ag-btn ag-btn-secondary" onClick={close}>
            Close
          </button>
        </div>
        <div className="ag-modal-body">
          <CandidateDetail roleId={roleId} candidateId={candidateId} inModal />
        </div>
      </div>
    </div>
  )
}
