"use client"

/**
 * Before a CV reaches the employer — frame 47 §E, signed off by Ose
 * 14 Nov 2026. One row per shortlisted candidate on the submission step.
 *
 *   not told  → submit is blocked for them, with no override. "Tell them and
 *               ask now" sends one email that is both the Art 14 notice and
 *               the ask, and the day-7 notice is closed by it.
 *   told      → they know we hold their CV but have not been asked.
 *   waiting   → asked; one reminder goes after two days, or now.
 *   agreed    → ready.
 *   said no   → their answer stands. No submit, no override.
 *
 * Labels only: nobody is hidden, filtered or ranked by their answer here.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { errorMessage } from "@/lib/error-message"

interface Row {
  candidateId: string
  ref: string
  name: string
  state: "not_told" | "told" | "waiting" | "agreed" | "declined" | "withdrawn"
  askedAt: string | null
  remindedAt: string | null
  answeredAt: string | null
  hasEmail: boolean
}

function day(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })
}

const CHIP: Record<Row["state"], { label: string; tone: string }> = {
  not_told: { label: "Not told", tone: "is-act" },
  told: { label: "Not asked", tone: "is-off" },
  waiting: { label: "Waiting", tone: "is-wait" },
  agreed: { label: "Ready", tone: "is-ok" },
  declined: { label: "Said no", tone: "is-off" },
  withdrawn: { label: "Withdrew", tone: "is-off" },
}

export function PutForwardPanel({
  roleId,
  company,
  refreshKey,
  canWrite,
}: {
  roleId: string
  company: string
  /** Bump to reload, e.g. after a submission refused someone. */
  refreshKey: number
  canWrite: boolean
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/put-forward`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || "Could not read who has been asked.")
      setRows(body.rows as Row[])
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }, [roleId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const ask = useCallback(
    async (row: Row) => {
      setBusy(row.candidateId)
      try {
        const res = await fetch(`/api/agency/candidates/${row.candidateId}/put-forward`, { method: "POST" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Could not send that.")
        toast.success(row.state === "waiting" ? `Reminder sent to ${row.name || row.ref}.` : `Asked ${row.name || row.ref}.`)
        await load()
      } catch (err) {
        toast.error(errorMessage(err))
      } finally {
        setBusy(null)
      }
    },
    [load]
  )

  if (!rows || rows.length === 0) return null
  const employer = company || "the employer"

  return (
    <section className="ag-card ag-pf" aria-labelledby="pf-h" style={{ marginBottom: 16 }}>
      <div className="ag-card-head">
        <span className="ag-card-title" id="pf-h">Before it goes</span>
      </div>
      <ul className="ag-pf-list">
        {rows.map((r) => {
          const chip = CHIP[r.state]
          const who = r.name || r.ref
          return (
            <li key={r.candidateId} className="ag-pf-row">
              <div className="ag-pf-main">
                <div className="ag-pf-head">
                  <span className="ag-pf-name">
                    {r.state === "waiting" ? `${who} · asked ${day(r.askedAt)}, no answer yet` : r.state === "agreed" ? `${who} agreed${r.answeredAt ? ` · ${day(r.answeredAt)}` : ""}` : who}
                  </span>
                  <span className={`ag-capture-chip ${chip.tone}`}>{chip.label}</span>
                </div>
                <p className="ag-note ag-pf-copy">
                  {r.state === "not_told" && `They have to be told we hold their CV before it goes to ${employer}.`}
                  {r.state === "told" && `They know we hold their CV, but have not been asked about ${employer}.`}
                  {r.state === "waiting" &&
                    (r.remindedAt
                      ? `Reminded ${day(r.remindedAt)}. You can still submit without their answer if you say why.`
                      : "They get one reminder after 2 days. You can still submit without their answer if you say why.")}
                  {r.state === "agreed" && `Agreed to be put forward to ${employer}.`}
                  {(r.state === "declined" || r.state === "withdrawn") && `${who} said no to ${employer}. Their answer stands.`}
                </p>
                {!r.hasEmail && (r.state === "not_told" || r.state === "told" || r.state === "waiting") && (
                  <p className="ag-meta">No email on file. Add one on their profile to ask.</p>
                )}
              </div>
              {canWrite && r.hasEmail && (r.state === "not_told" || r.state === "told" || r.state === "waiting") && (
                <button
                  className={`ag-btn ${r.state === "not_told" ? "ag-btn-primary" : "ag-btn-secondary"}`}
                  onClick={() => void ask(r)}
                  disabled={busy !== null}
                  aria-busy={busy === r.candidateId}
                >
                  {busy === r.candidateId && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {r.state === "not_told" ? "Tell them and ask now" : r.state === "told" ? "Ask now" : "Send a reminder now"}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
