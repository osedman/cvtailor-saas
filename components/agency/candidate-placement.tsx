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
  /** Needed to void it — the correction that `declined` is not. */
  id: string
  status: Status
  startDate: string | null
  feePercent: number | null
  feeValue: number | null
  currency: string
  rebateWeeks: number | null
  rebateUntil: string | null
  inRebateWindow: boolean
  fellThroughReason: string
  outsideProcess: boolean
  outsideProcessReason: string
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
  /**
   * Whether the client ever advanced this person on this role, from the same
   * GET. The route refuses a placement without a reason when they did not —
   * this is only so the ask arrives BEFORE the form is filled rather than as
   * a rejection after it. Optimistic default: assume advanced, so a failed
   * read never invents an accusation.
   */
  const [advanceDecision, setAdvanceDecision] = useState(true)
  const [outsideReason, setOutsideReason] = useState("")

  const hydrate = useCallback((p: Placement | null) => {
    setPlacement(p)
    if (!p) return
    setStatus(p.status)
    setStartDate(p.startDate ?? "")
    setFeePercent(p.feePercent == null ? "" : String(p.feePercent))
    setFeeValue(p.feeValue == null ? "" : String(p.feeValue))
    setRebateWeeks(p.rebateWeeks == null ? "" : String(p.rebateWeeks))
    setReason(p.fellThroughReason ?? "")
    setOutsideReason(p.outsideProcessReason ?? "")
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/agency/candidates/${candidateId}/placement`)
        if (res.ok) {
          const body = await res.json()
          hydrate(body.placement ?? null)
          if (typeof body.advanceDecision === "boolean") setAdvanceDecision(body.advanceDecision)
        }
      } finally {
        setLoaded(true)
      }
    })()
  }, [candidateId, hydrate])

  /**
   * Void the placement (22 Sep 2026). It leaves fill rate, fee value and
   * rebate exposure; the row and its reason stay for the audit. The reason is
   * required by the route AND by a DB constraint, so it is asked for here.
   */
  const voidIt = useCallback(async () => {
    if (!placement) return
    const reason = window.prompt(
      "Void this placement? It comes out of your fill rate, fee value and rebate exposure. The record stays for the audit.\n\nWhy is it being voided?"
    )
    if (reason === null) return
    if (!reason.trim()) {
      toast.error("Say why this placement is being voided.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/placement`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placementId: placement.id, reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || "Could not void that placement.")
      setPlacement(null)
      setOpen(false)
      toast.success("Voided. It leaves your numbers; the record stays for the audit.")
      onSaved?.()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [candidateId, placement, onSaved])

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
          outsideProcessReason: outsideReason,
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
  }, [candidateId, status, startDate, feePercent, feeValue, rebateWeeks, reason, outsideReason, hydrate])

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

            {/* A HIRE THAT SKIPPED THE LOOP SAYS SO (14 Sep 2026). The route
                derives this — the recruiter never ticks a box claiming it.
                Shown only where the trail is actually missing, so a normal
                placement is recorded with no extra field and no friction. */}
            {!advanceDecision && (
              <label className="ag-stack ag-outside-ask" style={{ gap: 4 }}>
                <span className="ag-meta">This candidate has no advance decision on this role.</span>
                <input
                  className="ag-input"
                  value={outsideReason}
                  onChange={(e) => setOutsideReason(e.target.value)}
                  placeholder="Client interviewed them directly after our introduction"
                />
                <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                  Recording it is fine — clients hire off-process. Say how it happened and it
                  travels with the record. This describes the hire, never the person.
                </span>
              </label>
            )}

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
              {/* Void — for a placement recorded against the wrong candidate
                  or at the wrong fee (22 Sep 2026). NOT `declined` or `fell
                  through`: those are outcomes about a person, and using one
                  to fix a clerical mistake writes a false fact about
                  somebody's career into an audited table. */}
              {placement && (
                <button
                  className="ag-btn"
                  style={{ color: "var(--ag-coral-deep)" }}
                  onClick={() => void voidIt()}
                  disabled={busy}
                >
                  Void this placement
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
