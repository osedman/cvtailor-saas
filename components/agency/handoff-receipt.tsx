"use client"

/**
 * The handoff receipt: what completed, who owns it now, their next task,
 * and what follows. Shown under the role header after a seam.
 *
 * Derived on render from the same facts as the header (lib/agency/
 * next-action.ts handoffFor), so it survives a reload and can never say
 * "sent" when nothing was. Dismissal is per browser session and per event:
 * the same receipt does not come back after you close it, a new event's
 * does. Announced as a status so a screen reader hears the handoff too.
 */

import { useEffect, useState } from "react"
import type { Handoff } from "@/lib/agency/next-action"

export function HandoffReceipt({ handoff, eventKey }: { handoff: Handoff | null; eventKey: string }) {
  const [dismissed, setDismissed] = useState<boolean>(true)
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(`ag-receipt:${eventKey}`) === "1")
    } catch {
      setDismissed(false)
    }
  }, [eventKey])
  if (!handoff || dismissed) return null
  const close = () => {
    try {
      sessionStorage.setItem(`ag-receipt:${eventKey}`, "1")
    } catch {
      /* private mode: the receipt just shows again next time */
    }
    setDismissed(true)
  }
  return (
    <div className="ag-receipt" role="status">
      <div className="ag-receipt-head">
        <span className="ag-receipt-eyebrow">Confirmed</span>
        <span className="ag-receipt-confirmed">{handoff.confirmed}</span>
        <span className="ag-grow" />
        <button type="button" className="ag-receipt-x" onClick={close} aria-label="Dismiss this receipt">
          ×
        </button>
      </div>
      <div className="ag-receipt-cells">
        <div className="ag-receipt-cell">
          <span className="ag-receipt-label">Now owned by</span>
          <span className="ag-receipt-value">{handoff.owner}</span>
        </div>
        <div className="ag-receipt-cell">
          <span className="ag-receipt-label">Their next task</span>
          <span className="ag-receipt-value">{handoff.nextTask}</span>
        </div>
        <div className="ag-receipt-cell">
          <span className="ag-receipt-label">Then</span>
          <span className="ag-receipt-value">{handoff.then}</span>
        </div>
      </div>
    </div>
  )
}
