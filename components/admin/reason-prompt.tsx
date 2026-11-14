"use client"

/**
 * The "say why, then confirm" strip that opens under a row before an admin
 * change is sent. Same pattern as the Admins and agency Team rows, extracted
 * so the client-access and jobs sections cannot drift from it.
 */
import { Loader2 } from "lucide-react"

export function ReasonPrompt(props: {
  id: string
  label: string
  confirmLabel: string
  danger?: boolean
  value: string
  error: string | null
  busy: boolean
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="mt-3 border-t border-[#eee6da] pt-3">
      <label htmlFor={props.id} className="ns-admin-label">{props.label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={props.id} type="text" autoFocus autoComplete="off" maxLength={300}
          className="ns-admin-input sm:flex-1" placeholder="Shown in the activity log"
          value={props.value} disabled={props.busy}
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onConfirm()
            if (e.key === "Escape") props.onCancel()
          }} />
        <button type="button" disabled={props.busy} onClick={props.onConfirm}
          className={`ns-admin-btn ${props.danger ? "ns-admin-btn-danger" : "ns-admin-btn-primary"}`}>
          {props.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {props.confirmLabel}
        </button>
        <button type="button" className="ns-admin-btn" disabled={props.busy} onClick={props.onCancel}>Cancel</button>
      </div>
      <p role="alert" className="mt-2 text-[12px] font-medium text-[#b3341b] empty:hidden">{props.error}</p>
    </div>
  )
}
