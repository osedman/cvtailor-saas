"use client"

/**
 * "Ask for another round" — Figma board 33, band A (approved 29 Sep 2026).
 *
 * Replaces a sentence that pointed at the recruiter with nothing behind it.
 * Who with (everyone taken forward, ticked by default) and what you still
 * need to find out — required, because it is the brief the recruiter plans
 * the round around. Sending it books nothing and tells no candidate.
 */

import { useCallback, useEffect, useState } from "react"

interface OpenRequest {
  candidateRefs: string[]
  note: string
  roundNumber: number | null
  at: string
}

type Live = { state: "loading" } | { state: "error" } | { state: "ready"; request: OpenRequest | null }

export function useRoundRequest(roleId: string) {
  const [live, setLive] = useState<Live>({ state: "loading" })
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/hiring/roles/${roleId}/round-request`, { cache: "no-store" })
      if (!r.ok) return setLive({ state: "error" })
      const b = (await r.json()) as { request: OpenRequest | null }
      setLive({ state: "ready", request: b.request })
    } catch {
      setLive({ state: "error" })
    }
  }, [roleId])
  useEffect(() => {
    void load()
  }, [load])
  return { live, setLive, reload: load }
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })

/** The open request, as the hiring manager sees it after sending (band A, right). */
export function RoundRequestSent({
  roleId,
  request,
  nameOf,
  onChange,
}: {
  roleId: string
  request: OpenRequest
  nameOf: (ref: string) => string
  onChange: (r: OpenRequest | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firsts = request.candidateRefs.map((r) => nameOf(r).split(" ")[0])
  const who = firsts.length <= 2 ? firsts.join(" and ") : `${firsts.slice(0, -1).join(", ")} and ${firsts.at(-1)}`

  async function withdraw() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/hiring/roles/${roleId}/round-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdrawn" }),
      })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return setError(b.error || "That did not save. Try again.")
      onChange(null)
    } catch {
      setError("That did not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hm-rr-sent">
      <p className="agd-eyebrow">Decision · waiting on your recruiter</p>
      <h2 className="agd-h1 hm-decision-head">
        You asked for {request.roundNumber ? `round ${request.roundNumber}` : "another round"} with {who}.
      </h2>
      <figure className="hm-final-reason">
        <figcaption className="agd-eyebrow">What you want to find out · sent {fmt(request.at)}</figcaption>
        <blockquote>{request.note}</blockquote>
      </figure>
      <p className="agd-sub">
        When your recruiter books it, the round appears on this page and in your diary. You can still choose now if
        you change your mind.
      </p>
      <div className="hm-final-row">
        <button className="hm-linkbtn" disabled={busy} onClick={() => void withdraw()}>
          Take the request back
        </button>
      </div>
      {error && <p className="ag-banner" role="alert">{error}</p>}
    </div>
  )
}

/** The form, opened in place under the finalists (band A, left). */
export function RoundRequestForm({
  roleId,
  finalists,
  nameOf,
  agencyName,
  onSent,
  onCancel,
}: {
  roleId: string
  finalists: string[]
  nameOf: (ref: string) => string
  agencyName: string
  onSent: (r: OpenRequest) => void
  onCancel: () => void
}) {
  const [refs, setRefs] = useState<string[]>(finalists)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/hiring/roles/${roleId}/round-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "asked", candidateRefs: refs, note }),
      })
      const b = (await res.json().catch(() => ({}))) as { request?: OpenRequest; error?: string }
      if (!res.ok || !b.request) return setError(b.error || "That did not save. Try again.")
      onSent(b.request)
    } catch {
      setError("That did not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const why = refs.length === 0 ? "Choose who the round is with." : !note.trim() ? "Say what you still need to find out." : null

  return (
    <div className="hm-rr-form">
      <p className="agd-eyebrow">Ask {agencyName || "your recruiter"} for another round</p>
      <fieldset className="hm-rr-who">
        <legend>Who with?</legend>
        {finalists.map((ref) => (
          <label key={ref} className="hm-rr-check">
            <input
              type="checkbox"
              checked={refs.includes(ref)}
              onChange={(e) => setRefs((prev) => (e.target.checked ? [...prev, ref] : prev.filter((r) => r !== ref)))}
            />
            {nameOf(ref)}
          </label>
        ))}
      </fieldset>
      <label className="hm-field" htmlFor="hm-rr-note">
        <span className="hm-rr-label">What do you still need to find out?</span>
        <textarea
          id="hm-rr-note"
          className="ag-textarea"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 2000))}
          placeholder="What would a further conversation settle? Your recruiter plans the round around this."
        />
      </label>
      <div className="agd-tbtn-row">
        <button className="agd-tbtn primary" disabled={busy || why !== null} onClick={() => void send()}>
          {busy ? "Sending…" : "Ask for another round"}
        </button>
        <button className="agd-tbtn" onClick={onCancel}>
          Cancel
        </button>
        {why && <p className="agd-tbtn-why">{why}</p>}
      </div>
      <p className="ag-quiet">Nobody is told anything. Your recruiter plans the round and books it from your diary.</p>
      {error && <p className="ag-banner" role="alert">{error}</p>}
    </div>
  )
}
