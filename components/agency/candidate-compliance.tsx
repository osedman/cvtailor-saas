"use client"

/**
 * Right-to-work and logistics, on the candidate detail screen.
 *
 * Self-contained (own GET/PUT to /compliance) so the already-dense detail
 * page does not grow another data dependency. Writes go through the
 * audit-coupled route — this table has no authenticated write grants, so
 * this panel could not cheat even if it wanted to.
 *
 * TWO QUESTIONS, ASKED SEPARATELY (migration 27). This card used to show one
 * row of three buttons — unverified / verified / needs sponsorship — which
 * forced two independent facts into one answer. Somebody on time-limited
 * permission who needs sponsorship to continue AND whose current permission
 * you checked this morning could not be recorded truthfully. Now:
 *
 *   WHAT YOU HAVE SEEN     an act you performed, with a note saying how
 *   WHAT THEY TOLD YOU     the candidate's own answer about sponsorship
 *
 * THE EMPLOYER NOTICE IS NOT DECORATION. For permanent placement the agency
 * is not the employer: the statutory excuse and the civil penalty belong to
 * the client. "Verified" is gone for that reason and EMPLOYER_CHECK_NOTICE
 * is rendered in the card, not hidden in a tooltip. A guardrail test asserts
 * it is on screen.
 *
 * The vocabulary is imported, never re-declared. A local copy of the union is
 * exactly how this component came to be sending a value the API had stopped
 * accepting, with TypeScript silent because the two copies had no
 * relationship. compliance-vocab.ts is server-import-free so importing it
 * here cannot drag agencyAdmin into the browser bundle.
 *
 * Still true, and still deliberate: no document upload. The note records HOW
 * the check was done. Identity documents are their own compliance surface
 * with their own retention rules.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { errorMessage } from "@/lib/error-message"
import {
  EMPLOYER_CHECK_NOTICE,
  EVIDENCE_LABEL,
  RTW_EVIDENCE,
  RTW_SPONSORSHIP,
  SPONSORSHIP_LABEL,
  SPONSORSHIP_NOTICE,
  type RtwEvidence,
  type RtwSponsorship,
} from "@/lib/agency/compliance-vocab"

/** Dates render in UTC and in en-GB, like every other date on the agency
 * surfaces — a permission expires on a day in a jurisdiction, and must not
 * shift because the reader is in another timezone. */
function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** Stated, never colour-coded into an alarm: an expiry is a fact to plan
 * around, not a mark against anybody. */
function expiryLine(expiresOn: string): string {
  const days = Math.round(
    (new Date(`${expiresOn}T00:00:00Z`).getTime() - Date.now()) / 86_400_000
  )
  if (days < 0) return `Permission expired ${fmtDay(expiresOn)}. Ask for current evidence.`
  return `Permission expires ${fmtDay(expiresOn)} (${days} day${days === 1 ? "" : "s"}).`
}

export function CandidateCompliance({ candidateId }: { candidateId: string }) {
  const [evidence, setEvidence] = useState<RtwEvidence>("not_checked")
  const [sponsorship, setSponsorship] = useState<RtwSponsorship>("not_asked")
  const [note, setNote] = useState("")
  const [expiresOn, setExpiresOn] = useState("")
  const [noticePeriod, setNoticePeriod] = useState("")
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [requiredBy, setRequiredBy] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/agency/candidates/${candidateId}/compliance`)
        if (!res.ok) return
        const v = await res.json()
        setEvidence(v.rtwEvidence ?? "not_checked")
        setSponsorship(v.rtwSponsorship ?? "not_asked")
        setNote(v.rtwNote ?? "")
        setExpiresOn(v.rtwExpiresOn ?? "")
        setNoticePeriod(v.noticePeriod ?? "")
        setCheckedAt(v.rtwCheckedAt ?? null)
        setRequiredBy(v.requiredBy ?? null)
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
        body: JSON.stringify({
          rtwEvidence: evidence,
          rtwNote: note,
          rtwExpiresOn: expiresOn || null,
          rtwSponsorship: sponsorship,
          noticePeriod,
        }),
      })
      const v = await res.json()
      if (!res.ok) throw new Error(v?.error || "That did not save.")
      setCheckedAt(v.rtwCheckedAt ?? null)
      setRequiredBy(v.requiredBy ?? null)
      toast.success("Recorded, with your name on it.")
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }, [candidateId, evidence, note, expiresOn, sponsorship, noticePeriod])

  const seen = evidence === "seen"

  return (
    <div className="ag-card">
      <div className="ag-card-head">
        <span className="ag-card-title">Right to work &amp; logistics</span>
        <span className="ag-meta">
          {checkedAt
            ? `SEEN ${new Date(checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).toUpperCase()} · AUDIT LOGGED`
            : "AUDIT LOGGED"}
        </span>
      </div>
      <div className="ag-card-body ag-stack" style={{ gap: 16 }}>
        {!loaded ? (
          <span className="ag-meta">Loading…</span>
        ) : (
          <>
            {/* Derived from the placement's start date, never stored — the
                same reasoning as the rebate window. Context, never a gate. */}
            {requiredBy && (
              <p className="ag-note" style={{ margin: 0 }}>
                This candidate has an offer starting <b>{fmtDay(requiredBy)}</b>. The employer&apos;s
                own check is needed before then.
              </p>
            )}

            <div className="ag-stack" style={{ gap: 8 }}>
              <span className="ag-meta">What you have seen</span>
              <div
                role="radiogroup"
                aria-label="Right-to-work evidence"
                style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
              >
                {RTW_EVIDENCE.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={evidence === s}
                    className="ag-btn ag-btn-secondary"
                    style={
                      evidence === s
                        ? { background: "var(--ag-ink)", color: "var(--ag-paper)", borderColor: "var(--ag-ink)" }
                        : undefined
                    }
                    onClick={() => setEvidence(s)}
                  >
                    {EVIDENCE_LABEL[s]}
                  </button>
                ))}
              </div>
              <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                {EMPLOYER_CHECK_NOTICE}
              </span>
            </div>

            {seen && (
              <>
                <label className="ag-stack" style={{ gap: 4 }}>
                  <span className="ag-meta">How was it checked?</span>
                  <input
                    className="ag-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Share code checked 20 Aug"
                  />
                  <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                    The note is the assertion — how, not the documents. Nothing uploads here, on
                    purpose.
                  </span>
                </label>

                <label className="ag-stack" style={{ gap: 4 }}>
                  <span className="ag-meta">Does that permission expire?</span>
                  <input
                    className="ag-input"
                    type="date"
                    value={expiresOn}
                    onChange={(e) => setExpiresOn(e.target.value)}
                  />
                  <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                    {expiresOn
                      ? expiryLine(expiresOn)
                      : "Leave empty if you did not record one. Empty means unrecorded, not unlimited."}
                  </span>
                </label>
              </>
            )}

            <div className="ag-stack" style={{ gap: 8 }}>
              <span className="ag-meta">What they told you about sponsorship</span>
              <div
                role="radiogroup"
                aria-label="Sponsorship, as the candidate reported it"
                style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
              >
                {RTW_SPONSORSHIP.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={sponsorship === s}
                    className="ag-btn ag-btn-secondary"
                    style={
                      sponsorship === s
                        ? { background: "var(--ag-ink)", color: "var(--ag-paper)", borderColor: "var(--ag-ink)" }
                        : undefined
                    }
                    onClick={() => setSponsorship(s)}
                  >
                    {SPONSORSHIP_LABEL[s]}
                  </button>
                ))}
              </div>
              <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                {SPONSORSHIP_NOTICE}
              </span>
            </div>

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
              <button
                className="ag-btn ag-btn-primary"
                onClick={() => void save()}
                disabled={busy}
                aria-busy={busy}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? "Recording…" : "Record it"}
              </button>
              <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                Attributed to you, in the audit log.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
