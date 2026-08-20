"use client"

/**
 * Right-to-work and logistics, on the candidate detail screen.
 *
 * Self-contained (own GET/PUT to /compliance) so the already-dense detail
 * page does not grow another data dependency. Writes go through the
 * audit-coupled route — this table has no authenticated write grants, so
 * this panel could not cheat even if it wanted to.
 *
 * The design decisions this carries:
 * - Three statuses, all FACTS: unverified / verified / needs sponsorship.
 *   There is no "not eligible" — that is a conclusion about a person, and
 *   conclusions belong to people. Nothing here hides or ranks anyone.
 * - A checked status requires a note saying HOW (share code, date). The
 *   note is the assertion; the status is just its summary.
 * - No document upload, on purpose. Identity documents are their own
 *   compliance surface with their own retention rules.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { errorMessage } from "@/lib/error-message"

type RtwStatus = "unverified" | "verified" | "needs_sponsorship"

const STATUS_LABEL: Record<RtwStatus, string> = {
  unverified: "Not checked yet",
  verified: "Right to work verified",
  needs_sponsorship: "Needs sponsorship",
}

export function CandidateCompliance({ candidateId }: { candidateId: string }) {
  const [status, setStatus] = useState<RtwStatus>("unverified")
  const [note, setNote] = useState("")
  const [noticePeriod, setNoticePeriod] = useState("")
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/agency/candidates/${candidateId}/compliance`)
        if (!res.ok) return
        const v = await res.json()
        setStatus(v.rtwStatus ?? "unverified")
        setNote(v.rtwNote ?? "")
        setNoticePeriod(v.noticePeriod ?? "")
        setCheckedAt(v.rtwCheckedAt ?? null)
      } finally {
        setLoaded(true)
      }
    })()
  }, [candidateId])

  const save = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/compliance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtwStatus: status, rtwNote: note, noticePeriod }),
      })
      const v = await res.json()
      if (!res.ok) throw new Error(v?.error || "That did not save.")
      setCheckedAt(v.rtwCheckedAt ?? null)
      toast.success("Recorded, with your name on it.")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [candidateId, status, note, noticePeriod])

  return (
    <div className="ag-card">
      <div className="ag-card-head">
        <span className="ag-card-title">Right to work &amp; logistics</span>
        <span className="ag-meta">
          {checkedAt
            ? `CHECKED ${new Date(checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).toUpperCase()} · AUDIT LOGGED`
            : "AUDIT LOGGED"}
        </span>
      </div>
      <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
        {!loaded ? (
          <span className="ag-meta">Loading…</span>
        ) : (
          <>
            <div role="radiogroup" aria-label="Right to work status" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(STATUS_LABEL) as RtwStatus[]).map((s) => (
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
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {status !== "unverified" && (
              <label className="ag-stack" style={{ gap: 4 }}>
                <span className="ag-meta">How was it checked?</span>
                <input
                  className="ag-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Share code checked 20 Aug · expires Jan 2028"
                />
                <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                  The note is the assertion — how, not the documents. Nothing uploads here, on
                  purpose.
                </span>
              </label>
            )}

            <label className="ag-stack" style={{ gap: 4 }}>
              <span className="ag-meta">Notice period</span>
              <input
                className="ag-input"
                value={noticePeriod}
                onChange={(e) => setNoticePeriod(e.target.value)}
                placeholder="4 weeks · negotiable"
              />
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="ag-btn ag-btn-primary" onClick={() => void save()} disabled={busy} aria-busy={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? "Saving…" : "Record it"}
              </button>
              <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                A fact about eligibility, never a filter — nothing here hides anyone.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
