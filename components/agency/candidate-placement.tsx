"use client"

/**
 * The placement, on the candidate it belongs to.
 *
 * Sits beside the compliance card and follows the same shape: self-contained
 * reads and writes, going through the audit-coupled route because
 * agency.placements has no authenticated write grants.
 *
 * The copy holds two lines the schema also holds: 'They declined' is an
 * outcome and never a mark against anyone, and recording a start does NOT
 * close the role — closing starts the retention clock and stays a deliberate
 * act, not a side effect of good news.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { errorMessage } from "@/lib/error-message"

type Status = "offered" | "accepted" | "declined" | "started" | "fell_through"

const LABEL: Record<Status, string> = {
  offered: "Offer made",
  accepted: "They accepted",
  declined: "They declined",
  started: "Started",
  fell_through: "Fell through",
}

interface Placement {
  status: Status
  startDate: string | null
  feePercent: number | null
  feeValue: number | null
  currency: string
  rebateWeeks: number | null
  rebateUntil: string | null
  inRebateWindow: boolean
  fellThroughReason: string
  notes: string
}

const fmtDay = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—"

export function CandidatePlacement({
  candidateId,
  onSaved,
}: {
  candidateId: string
  /** Fired after a successful write — see CandidateCompliance. */
  onSaved?: () => void
}) {
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  const [status, setStatus] = useState<Status>("offered")
  const [startDate, setStartDate] = useState("")
  const [feePercent, setFeePercent] = useState("")
  const [feeValue, setFeeValue] = useState("")
  const [rebateWeeks, setRebateWeeks] = useState("")
  const [reason, setReason] = useState("")

  const hydrate = useCallback((p: Placement | null) => {
    setPlacement(p)
    if (!p) return
    setStatus(p.status)
    setStartDate(p.startDate ?? "")
    setFeePercent(p.feePercent == null ? "" : String(p.feePercent))
    setFeeValue(p.feeValue == null ? "" : String(p.feeValue))
    setRebateWeeks(p.rebateWeeks == null ? "" : String(p.rebateWeeks))
    setReason(p.fellThroughReason ?? "")
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/agency/candidates/${candidateId}/placement`)
        if (res.ok) hydrate((await res.json()).placement ?? null)
      } finally {
        setLoaded(true)
      }
    })()
  }, [candidateId, hydrate])

  const save = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/placement`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          startDate: startDate || null,
          feePercent: feePercent === "" ? null : Number(feePercent),
          feeValue: feeValue === "" ? null : Number(feeValue),
          rebateWeeks: rebateWeeks === "" ? null : Number(rebateWeeks),
          fellThroughReason: reason,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || "That did not save.")
      hydrate(body.placement)
      setOpen(false)
      toast.success("Recorded. The role stays open until you close it.")
      onSaved?.()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [candidateId, status, startDate, feePercent, feeValue, rebateWeeks, reason, hydrate])

  if (!loaded) return null

  return (
    <div className="ag-card">
      <div className="ag-card-head">
        <span className="ag-card-title">Placement</span>
        <span className="ag-meta">
          {placement ? `${LABEL[placement.status].toUpperCase()} · AUDIT LOGGED` : "AUDIT LOGGED"}
        </span>
      </div>
      <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
        {placement && !open && (
          <>
            <p className="ag-note">
              {placement.status === "started" && placement.startDate
                ? `Started ${fmtDay(placement.startDate)}.`
                : placement.status === "declined"
                  ? "They turned the offer down. An outcome, not a mark against them — nothing here ranks or hides anyone."
                  : placement.status === "fell_through"
                    ? `Fell through — ${placement.fellThroughReason}`
                    : `${LABEL[placement.status]}${placement.startDate ? ` · due to start ${fmtDay(placement.startDate)}` : ""}.`}
            </p>
            {(placement.feeValue != null || placement.feePercent != null) && (
              <p className="ag-meta">
                FEE{placement.feeValue != null ? ` · ${placement.currency} ${placement.feeValue.toLocaleString("en-GB")}` : ""}
                {placement.feePercent != null ? ` · ${placement.feePercent}%` : ""}
              </p>
            )}
            {placement.rebateUntil && (
              <p className="ag-meta" style={{ color: placement.inRebateWindow ? "var(--ag-warn)" : "var(--ag-ink-3)" }}>
                REBATE {placement.inRebateWindow ? "OPEN UNTIL" : "CLOSED"} {fmtDay(placement.rebateUntil)}
              </p>
            )}
            <button className="ag-btn ag-btn-secondary" onClick={() => setOpen(true)}>
              Update it
            </button>
          </>
        )}

        {(!placement || open) && (
          <>
            <div role="radiogroup" aria-label="Placement status" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(LABEL) as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  className="ag-btn ag-btn-secondary"
                  style={
                    status === s
                      ? { background: "var(--ag-ink)", color: "var(--ag-paper)", borderColor: "var(--ag-ink)" }
                      : undefined
                  }
                  onClick={() => setStatus(s)}
                >
                  {LABEL[s]}
                </button>
              ))}
            </div>

            {status === "fell_through" && (
              <label className="ag-stack" style={{ gap: 4 }}>
                <span className="ag-meta">What happened?</span>
                <input
                  className="ag-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Counter-offered by their current employer at week 3"
                />
                <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                  The most expensive thing that happens to an agency. Recording one without a
                  reason teaches nobody anything.
                </span>
              </label>
            )}

            <div className="ag-setting-row">
              <label className="ag-stack" style={{ gap: 4 }}>
                <span className="ag-meta">Start date</span>
                <input className="ag-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="ag-stack" style={{ gap: 4 }}>
                <span className="ag-meta">Fee %</span>
                <input className="ag-input ag-setting-input" inputMode="decimal" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} placeholder="20" />
              </label>
              <label className="ag-stack" style={{ gap: 4 }}>
                <span className="ag-meta">Fee value</span>
                <input className="ag-input ag-setting-input" inputMode="decimal" value={feeValue} onChange={(e) => setFeeValue(e.target.value)} placeholder="17000" />
              </label>
              <label className="ag-stack" style={{ gap: 4 }}>
                <span className="ag-meta">Rebate weeks</span>
                <input className="ag-input ag-setting-input" inputMode="numeric" value={rebateWeeks} onChange={(e) => setRebateWeeks(e.target.value)} placeholder="12" />
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button className="ag-btn ag-btn-primary" onClick={() => void save()} disabled={busy} aria-busy={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? "Saving…" : placement ? "Save the change" : "Record the placement"}
              </button>
              {placement && (
                <button className="ag-btn" onClick={() => { setOpen(false); hydrate(placement) }} disabled={busy}>
                  Cancel
                </button>
              )}
              <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                Recording this does not close the role — closing starts the retention clock and
                stays yours to do.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
