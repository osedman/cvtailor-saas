"use client"

/**
 * References for one candidate: the list, the ask/chase acts, and adding a
 * referee. Extracted from the close-out page (23→24 Aug 2026) so the
 * candidate file — the operational screen outside the shortlist workflow —
 * and close-out render the SAME control instead of two drifting copies.
 *
 * Self-contained by candidateId, like candidate-compliance and
 * candidate-placement: own fetches, own state. `onRefsChange` reports the
 * rows upward because close-out's pack warning ("2 references still
 * outstanding") is computed from them — the parent needs the facts, not a
 * second fetch.
 */

import { useCallback, useEffect, useState } from "react"

export interface ReferenceListRow {
  id: string
  refereeName: string
  relationship: string
  status: "drafted" | "requested" | "chasing" | "received" | "declined"
  noticeSentAt: string | null
}

const STATUS_TONE: Record<ReferenceListRow["status"], string> = {
  received: "var(--ag-ok, #4c7c54)",
  requested: "var(--ag-coral)",
  chasing: "var(--ag-coral-deep)",
  drafted: "var(--ag-ink-3)",
  declined: "var(--ag-ink-3)",
}

const STATUS_LABEL: Record<ReferenceListRow["status"], string> = {
  received: "Received",
  requested: "Asked",
  chasing: "Chasing",
  drafted: "Not asked yet",
  declined: "Declined",
}

export function CandidateReferences({
  candidateId,
  onRefsChange,
}: {
  candidateId: string
  onRefsChange?: (refs: ReferenceListRow[]) => void
}) {
  const [refs, setRefs] = useState<ReferenceListRow[] | null>(null)
  const [newRef, setNewRef] = useState({ refereeName: "", refereeEmail: "", relationship: "" })
  const [askedLink, setAskedLink] = useState<{ id: string; url: string; emailed: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!candidateId) return setRefs(null)
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/references`)
      if (!res.ok) return setRefs([])
      const body = await res.json()
      const rows = Array.isArray(body?.references) ? (body.references as ReferenceListRow[]) : []
      setRefs(rows)
      onRefsChange?.(rows)
    } catch {
      setRefs([])
    }
    // onRefsChange is a notification, not an input; re-running on its identity
    // would refetch every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId])

  useEffect(() => {
    void load()
  }, [load])

  async function addReferee() {
    if (!newRef.refereeName.trim() || !newRef.refereeEmail.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRef),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body?.error === "string" ? body.error : "Could not add that referee.")
        return
      }
      setNewRef({ refereeName: "", refereeEmail: "", relationship: "" })
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function ask(referenceId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/references`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not send that request.")
        return
      }
      setAskedLink({ id: referenceId, url: String(body.url ?? ""), emailed: Boolean(body.emailed) })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const total = refs?.length ?? 0
  const received = (refs ?? []).filter((r) => r.status === "received").length

  return (
    <section className="ag-card ag-print-hide" style={{ padding: "18px 22px" }} aria-labelledby="refs">
      <div className="ag-card-head" style={{ padding: 0, border: "none" }}>
        <span className="ag-card-title" id="refs">
          References
          {refs ? ` — ${received} of ${total} in` : ""}
        </span>
        <span className="ag-grow" />
        <span className="ag-pill">Audit logged</span>
      </div>

      {error && <p className="ag-banner" role="alert" style={{ marginTop: 10 }}>{error}</p>}

      <div className="ag-stack" style={{ gap: 10, marginTop: 12 }}>
        {(refs ?? []).map((r) => (
          <div key={r.id} className="ag-sentlink">
            <span className="ag-ref-dot" style={{ background: STATUS_TONE[r.status] }} aria-hidden />
            <span className="ag-grow" style={{ minWidth: 0 }}>
              <span style={{ fontSize: 13 }}>{r.refereeName}</span>
              <span className="ag-meta" style={{ display: "block" }}>
                {r.relationship || "Referee"}
                {r.noticeSentAt ? " · notice sent" : " · no notice yet"}
              </span>
            </span>
            <span className="ag-meta">{STATUS_LABEL[r.status]}</span>
            {r.status !== "received" && r.status !== "declined" && (
              <button className="ag-btn ag-btn-secondary" onClick={() => ask(r.id)} disabled={busy}>
                {r.status === "drafted" ? "Ask" : "Chase"}
              </button>
            )}
            {askedLink?.id === r.id && !askedLink.emailed && (
              <p className="ag-note ag-ask-result">
                We could not email them — send this link yourself:
                <code className="ag-ask-url">{askedLink.url}</code>
              </p>
            )}
          </div>
        ))}
        {refs !== null && refs.length === 0 && <p className="ag-note">No referees named yet.</p>}
      </div>

      <div
        className="ag-stack"
        style={{ gap: 8, marginTop: 14, borderTop: "1px solid var(--ag-border)", paddingTop: 12 }}
      >
        <label className="ag-field-label" htmlFor="ref-name">
          Referee name
        </label>
        <input
          id="ref-name"
          className="ag-input"
          name="refereeName"
          autoComplete="off"
          placeholder="Dr Sarah Lindqvist"
          value={newRef.refereeName}
          onChange={(e) => setNewRef({ ...newRef, refereeName: e.target.value })}
        />
        <label className="ag-field-label" htmlFor="ref-email">
          Referee email
        </label>
        {/* type=email gets the right keyboard and validation; spellcheck off
            because an address is not prose. */}
        <input
          id="ref-email"
          className="ag-input"
          type="email"
          name="refereeEmail"
          autoComplete="off"
          spellCheck={false}
          placeholder="s.lindqvist@example.nhs.uk"
          value={newRef.refereeEmail}
          onChange={(e) => setNewRef({ ...newRef, refereeEmail: e.target.value })}
        />
        <label className="ag-field-label" htmlFor="ref-rel">
          Relationship
        </label>
        <input
          id="ref-rel"
          className="ag-input"
          name="relationship"
          autoComplete="off"
          placeholder="Manager, NHS Digital 2022–2025"
          value={newRef.relationship}
          onChange={(e) => setNewRef({ ...newRef, relationship: e.target.value })}
        />
        <div>
          <button className="ag-btn ag-btn-secondary" onClick={addReferee} disabled={busy}>
            Add referee
          </button>
        </div>
      </div>

      <p className="ag-note" style={{ marginTop: 12 }}>
        Referees are data subjects too. The request and their fair-processing notice are the same
        email — they cannot be asked without being told what you hold — and their words join the
        pack attributed, never paraphrased.
      </p>
    </section>
  )
}
