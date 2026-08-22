"use client"

/**
 * The candidate's rights page, linked from the Art 14 notice. Plain language,
 * four one click requests, no Tailr signup funnel. Requests are filed for the
 * agency to action; nothing is deleted by this page.
 */

import { use, useCallback, useEffect, useState } from "react"

interface Held {
  full_name: string
  agency: string
  reply_to: string | null
  role_title: string
  role_location: string
  role_open: boolean
  held_since: string
  source: string
  retention_days: number
  retention_expires_at: string | null
  requests: Array<{ kind: string; status: string; requested_at: string }>
  represent_status: "unanswered" | "agreed" | "declined" | "withdrawn"
  represent_answered_at: string | null
}

const OPTIONS: Array<{ kind: string; label: string; blurb: string; strong?: boolean }> = [
  { kind: "access", label: "See my data", blurb: "Ask for a copy of everything they hold about you" },
  { kind: "rectification", label: "Correct something", blurb: "Tell them what is wrong and they must respond" },
  { kind: "erasure", label: "Delete my data", blurb: "Ask them to erase your CV and their assessment of it", strong: true },
  { kind: "objection", label: "Stop processing me", blurb: "Ask them not to assess you again unless you apply" },
]

export default function RightsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<"loading" | "invalid" | "ready">("loading")
  const [held, setHeld] = useState<Held | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [filed, setFiled] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [representBusy, setRepresentBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/rights/${token}`)
    if (!res.ok) return setState("invalid")
    setHeld(await res.json())
    setState("ready")
  }, [token])

  useEffect(() => {
    load().catch(() => setState("invalid"))
  }, [load])

  async function answerRepresent(answer: "agree" | "decline") {
    setError(null)
    setRepresentBusy(true)
    try {
      const res = await fetch(`/api/rights/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ represent: answer }),
      })
      const body = await res.json()
      if (!res.ok) return setError(body.error ?? "Could not save your answer")
      setHeld((h) => (h ? { ...h, represent_status: body.represent_status, represent_answered_at: new Date().toISOString() } : h))
    } finally {
      setRepresentBusy(false)
    }
  }

  async function file(kind: string) {
    setError(null)
    const res = await fetch(`/api/rights/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, note }),
    })
    const body = await res.json()
    if (!res.ok) return setError(body.error ?? "Could not file that request")
    setFiled(kind)
    setChosen(null)
    setNote("")
    load()
  }

  if (state === "loading") {
    return <div style={{ maxWidth: 640, margin: "80px auto", textAlign: "center" }}><span className="ag-spin" /></div>
  }

  if (state === "invalid" || !held) {
    return (
      <div className="ag-drop" style={{ maxWidth: 520, margin: "80px auto" }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>This link is no longer active.</div>
        <p style={{ fontSize: 12.5, color: "var(--ag-ink-3)", margin: "6px auto 0", maxWidth: "44ch" }}>
          If your data was deleted, the link stops working. Reply to the email you received and the agency will confirm.
        </p>
      </div>
    )
  }

  const firstName = held.full_name.split(" ")[0] || "there"

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="ag-eyebrow">Your data</div>
      <h1 className="ag-title" style={{ fontSize: 28, marginTop: 6 }}>
        {held.agency} holds your CV, {firstName}.
      </h1>
      <p className="ag-sub" style={{ marginBottom: 24 }}>
        You are being considered for {held.role_title}{held.role_location ? ` in ${held.role_location}` : ""}. Below is what that means and what you can ask for.
      </p>

      {filed && (
        <div className="ag-banner" style={{ marginBottom: 20 }}>
          <div className="ag-grow">
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Request sent to {held.agency}.</div>
            <div style={{ fontSize: 12.5, color: "var(--ag-ink-2)" }}>
              They have to respond. If you asked for deletion, your data is removed once they action it and this page stops working.
            </div>
          </div>
        </div>
      )}

      <div className="ag-card" style={{ marginBottom: 20 }}>
        <div className="ag-card-head"><span className="ag-card-title">What they hold</span><span className="ag-meta">Held since {new Date(held.held_since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></div>
        <div className="ag-card-body" style={{ fontSize: 13, color: "var(--ag-ink-2)", lineHeight: 1.7 }}>
          Your CV, your contact details, and their assessment of that CV against this one role. Nothing else, and nothing bought from anywhere.
          {" "}Their assessment is their own working record; your CV is yours.
          <div style={{ marginTop: 10 }}>
            If nothing comes of the role, it is deleted automatically {held.retention_expires_at
              ? `on ${new Date(held.retention_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
              : `${held.retention_days} days after the role closes`}.
          </div>
        </div>
      </div>

      {/* Right to represent — Figma "Candidate · Right to represent" (209:2).
          Only while the role is open: a closed role has nothing to put anyone
          forward FOR, and asking would be noise. Applied candidates arrive
          agreed (the manifest is the record) and see their standing answer. */}
      {held.role_open && (
        <div className="ag-card" style={{ marginBottom: 20 }}>
          <div className="ag-card-head">
            <span className="ag-card-title">Being put forward</span>
            <span className="ag-meta">Your call, for this role only</span>
          </div>
          <div className="ag-card-body" style={{ fontSize: 13, color: "var(--ag-ink-2)", lineHeight: 1.7 }}>
            {held.represent_status === "unanswered" && (
              <>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: "var(--ag-ink)", marginBottom: 6 }}>
                  May {held.agency} put you forward for the {held.role_title} role?
                </div>
                Putting you forward means sharing your CV and their assessment of it with the hiring
                company, as your representative for this role only. Saying no costs you nothing here:
                your details stay exactly as they are, under the same deletion clock, and you can
                still apply anywhere yourself.
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button className="ag-btn ag-btn-primary" disabled={representBusy} onClick={() => void answerRepresent("agree")}>
                    Yes, put me forward
                  </button>
                  <button className="ag-btn ag-btn-secondary" disabled={representBusy} onClick={() => void answerRepresent("decline")}>
                    No — not for this role
                  </button>
                </div>
              </>
            )}
            {held.represent_status === "agreed" && (
              <>
                <div style={{ fontWeight: 600, color: "var(--ag-ink)", marginBottom: 6 }}>
                  You agreed to be put forward{held.represent_answered_at ? ` on ${new Date(held.represent_answered_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}.
                </div>
                You can withdraw that at any time. Withdrawing stops anything being sent from now on —
                it does not unsend what the hiring company already received.
                <div style={{ marginTop: 12 }}>
                  <button className="ag-btn ag-btn-secondary" disabled={representBusy} onClick={() => void answerRepresent("decline")}>
                    Withdraw my agreement
                  </button>
                </div>
              </>
            )}
            {(held.represent_status === "declined" || held.represent_status === "withdrawn") && (
              <>
                <div style={{ fontWeight: 600, color: "var(--ag-ink)", marginBottom: 6 }}>
                  You said no{held.represent_answered_at ? ` on ${new Date(held.represent_answered_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}. That stands.
                </div>
                {held.agency} cannot put you forward for this role. Nothing else changes — you are
                still considered, your data keeps its deletion date, and you can change this answer
                whenever you like.
                <div style={{ marginTop: 12 }}>
                  <button className="ag-btn ag-btn-secondary" disabled={representBusy} onClick={() => void answerRepresent("agree")}>
                    Change my mind — put me forward
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="ag-card">
        <div className="ag-card-head"><span className="ag-card-title">What you can ask for</span><span className="ag-meta">One click, no account needed</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 18 }}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              onClick={() => setChosen(chosen === opt.kind ? null : opt.kind)}
              style={{
                border: `1px solid ${opt.strong ? "var(--ag-tint-2)" : "var(--ag-line-2)"}`,
                background: chosen === opt.kind ? "var(--ag-tint-1)" : opt.strong ? "var(--ag-tint-1)" : "var(--ag-paper)",
                borderRadius: 8, padding: 14, textAlign: "left", cursor: "pointer", fontFamily: "var(--ag-sans)",
              }}
            >
              <b style={{ display: "block", fontSize: 13.5, marginBottom: 2, color: opt.strong ? "var(--ag-coral-deep)" : "var(--ag-ink)" }}>{opt.label}</b>
              <span style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>{opt.blurb}</span>
            </button>
          ))}
        </div>
        {chosen && (
          <div style={{ padding: "0 18px 18px" }}>
            <textarea
              className="ag-textarea"
              style={{ minHeight: 80 }}
              placeholder={chosen === "rectification" ? "What is wrong, and what should it say?" : "Anything you want to add (optional)"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
              <button className="ag-btn ag-btn-primary" onClick={() => file(chosen)}>Send this request</button>
              <button className="ag-btn" onClick={() => setChosen(null)}>Cancel</button>
              {error && <span style={{ fontSize: 12.5, color: "var(--ag-coral-deep)" }}>{error}</span>}
            </div>
          </div>
        )}
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--ag-border)" }}>
          <span className="ag-meta">
            Requests go to {held.agency}, who is responsible for your data. Tailr processes it on their behalf and never uses your details for anything else.
          </span>
        </div>
      </div>

      {held.requests.length > 0 && (
        <div className="ag-card" style={{ marginTop: 20 }}>
          <div className="ag-card-head"><span className="ag-card-title">Your requests</span></div>
          <div className="ag-card-body ag-stack" style={{ gap: 8 }}>
            {held.requests.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10, fontSize: 12.5, alignItems: "center" }}>
                <span className="ag-pill">{r.kind}</span>
                <span className="ag-grow">{new Date(r.requested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                <span className="ag-meta">{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
