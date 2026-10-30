"use client"

/**
 * The client asked for another round — the recruiter's side (Figma board 33,
 * band B, approved 29 Sep 2026). "Add round N" raises the role's planned
 * rounds by one, so the existing invite flow reaches the people asked for
 * from the hiring manager's offered times; "Reply instead" closes the
 * request without a round. Renders nothing when no request is open.
 */

import { useCallback, useEffect, useState } from "react"

interface OpenRequest {
  candidateRefs: string[]
  note: string
  roundNumber: number | null
  at: string
}

export function RoundRequestCard({
  roleId,
  company,
  nameOf,
  onAnswered,
}: {
  roleId: string
  company: string
  nameOf: (ref: string) => string
  onAnswered?: () => void
}) {
  const [req, setReq] = useState<OpenRequest | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/roles/${roleId}/round-request`, { cache: "no-store" })
      if (!r.ok) return setLoadFailed(true)
      const b = (await r.json()) as { request: OpenRequest | null }
      setReq(b.request)
    } catch {
      setLoadFailed(true)
    }
  }, [roleId])
  useEffect(() => {
    void load()
  }, [load])

  async function answer(action: "added" | "replied") {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/round-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const b = (await res.json().catch(() => ({}))) as { plannedRounds?: number; error?: string }
      if (!res.ok) return setError(b.error || "That did not save. Try again.")
      setDone(
        action === "added"
          ? `Round ${b.plannedRounds} added. The people asked for are invited from the client's offered times.`
          : "Closed without a round. The client's request stays on the record."
      )
      setReq(null)
      onAnswered?.()
    } catch {
      setError("That did not save. Try again.")
    } finally {
      setBusy(null)
    }
  }

  // A failed load is not an empty one — but it is also not worth a banner on
  // a page whose main job is elsewhere; say it quietly.
  if (loadFailed) return <p className="ag-note">Could not check for a request for another round. Reload to try again.</p>
  if (done) return <p className="ag-note" role="status">{done}</p>
  if (!req) return null

  const names = req.candidateRefs.map(nameOf)
  const who = names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
  const n = req.roundNumber
  const when = new Date(req.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

  return (
    <section className="ag-card ag-rr-card" aria-labelledby="rr-h">
      <p className="ag-rr-eyebrow">Next · the client asked</p>
      <h2 className="ag-rr-title" id="rr-h">
        {company || "The client"} asked for {n ? `round ${n}` : "another round"}
      </h2>
      <div className="ag-rr-quote">
        <p className="ag-rr-meta">
          {when} · with {who}
        </p>
        <blockquote>{req.note}</blockquote>
      </div>
      <div className="agd-tbtn-row">
        <button className="agd-tbtn primary" disabled={busy !== null} onClick={() => void answer("added")}>
          {busy === "added" ? "Adding…" : n ? `Add round ${n}` : "Add the round"}
        </button>
        <button className="agd-tbtn" disabled={busy !== null} onClick={() => void answer("replied")}>
          {busy === "replied" ? "Saving…" : "Reply instead"}
        </button>
        <p className="agd-tbtn-why">Adding it invites {names.length === 1 ? "them" : "each of them"} from the client&apos;s offered times.</p>
      </div>
      {error && <p className="ag-banner" role="alert">{error}</p>}
    </section>
  )
}
