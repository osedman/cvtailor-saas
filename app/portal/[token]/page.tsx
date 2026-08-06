"use client"

/**
 * What the hiring manager sees at their personal link. Actions are signals to
 * the recruiter and never change the shortlist by themselves; a decline never
 * hides anyone. Invalid, expired and revoked links render identically and
 * disclose nothing.
 */

import { use, useEffect, useState } from "react"

interface Entry {
  ref: string
  full_name: string
  current_title: string
  years: number | null
  location: string
  overall: number
  original_overall: number | null
  must_have_hit: number
  must_have_total: number
  reviewed: boolean
  narrative: string
  strengths: Array<{ requirement: string; quote: string | null }>
  gaps: Array<{ requirement: string; weight: string }>
}

interface Payload {
  snapshot: {
    role: { ref: string; title: string; company: string; location: string; salary_band: string }
    shortlisted: Entry[]
    generated_at: string
  } | null
  agency: string
  viewer: { name: string; company: string }
}

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<"loading" | "invalid" | "ready">("loading")
  const [data, setData] = useState<Payload | null>(null)
  const [sent, setSent] = useState<Record<string, string>>({})
  const [asking, setAsking] = useState<string | null>(null)
  const [question, setQuestion] = useState("")
  const [evidenceOpen, setEvidenceOpen] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then(async (res) => {
        if (!res.ok) return setState("invalid")
        const body = await res.json()
        if (!body.snapshot) return setState("invalid")
        setData(body)
        setState("ready")
      })
      .catch(() => setState("invalid"))
  }, [token])

  async function act(candidateRef: string, action: string, message = "") {
    const res = await fetch(`/api/portal/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_ref: candidateRef, action, message }),
    })
    if (res.ok) {
      setSent((prev) => ({ ...prev, [candidateRef]: action }))
      setAsking(null)
      setQuestion("")
    }
  }

  const initials = (name: string) =>
    name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
  const tier = (n: number) => (n >= 80 ? "hi" : n >= 60 ? "med" : "lo")

  if (state === "loading") {
    return <div style={{ maxWidth: 720, margin: "80px auto", textAlign: "center" }}><span className="ag-spin" /></div>
  }

  if (state === "invalid" || !data?.snapshot) {
    return (
      <div className="ag-drop" style={{ maxWidth: 520, margin: "80px auto" }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, border: "1px dashed var(--ag-line-2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--ag-ink-4)" }}>🔒</div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>This link is no longer active.</div>
        <p style={{ fontSize: 12.5, color: "var(--ag-ink-3)", margin: "6px auto 0", maxWidth: "44ch" }}>
          Shortlist links are personal and they expire. Contact your recruiter for a fresh one.
        </p>
      </div>
    )
  }

  const { snapshot, agency, viewer } = data

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="ag-card" style={{ borderRadius: 10, boxShadow: "0 20px 60px -30px rgba(0,0,0,0.2)" }}>
        <div style={{ background: "var(--ag-ink)", color: "var(--ag-paper)", padding: "24px 28px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="ag-eyebrow">Shortlist · {snapshot.role.title}</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>
              {snapshot.shortlisted.length === 1 ? "One candidate, backed with evidence." : `${snapshot.shortlisted.length} candidates, ranked with evidence.`}
            </h1>
            <div className="ag-meta" style={{ color: "var(--ag-tint-2)", marginTop: 6 }}>
              Prepared by {agency} · {snapshot.role.ref} · {new Date(snapshot.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
          <div className="ag-brand-mark" style={{ background: "var(--ag-coral)" }}>T</div>
        </div>

        {snapshot.shortlisted.map((entry) => (
          <div key={entry.ref} style={{ padding: "22px 28px", borderBottom: "1px solid var(--ag-border)" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
              <div className="ag-avatar" style={{ width: 44, height: 44 }}>{initials(entry.full_name)}</div>
              <div className="ag-grow">
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {entry.full_name}
                  {entry.reviewed && <span className="ag-meta" style={{ marginLeft: 8 }}>{entry.ref} · Screened ✓</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
                  {entry.current_title}{entry.years ? ` · ${entry.years} yrs` : ""}{entry.location ? ` · ${entry.location}` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className={`ag-score ${tier(entry.overall)}`}>{Math.round(entry.overall)}</span>
                {entry.original_overall != null && entry.original_overall !== entry.overall && (
                  <div className="ag-delta">{Math.round(entry.original_overall)} → {Math.round(entry.overall)} after screening</div>
                )}
                <div className="ag-meta" style={{ marginTop: 4 }}>{entry.must_have_hit}/{entry.must_have_total} must haves</div>
              </div>
            </div>

            {entry.narrative && <p style={{ fontSize: 13.5, color: "var(--ag-ink-2)", maxWidth: "64ch", marginBottom: 14 }}>{entry.narrative}</p>}

            {sent[entry.ref] ? (
              <div className="ag-banner">
                <div className="ag-grow">
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Sent to your recruiter.</div>
                  <div style={{ fontSize: 12.5, color: "var(--ag-ink-2)" }}>
                    {agency} has been notified. They will confirm next steps with you directly. Nothing is scheduled or decided automatically.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="ag-btn ag-btn-coral" onClick={() => act(entry.ref, "interview")}>Accept for interview</button>
                  <button className="ag-btn ag-btn-secondary" onClick={() => setAsking(asking === entry.ref ? null : entry.ref)}>Ask a question</button>
                  <button className="ag-btn" onClick={() => setEvidenceOpen(evidenceOpen === entry.ref ? null : entry.ref)}>
                    {evidenceOpen === entry.ref ? "Hide evidence" : "See evidence"}
                  </button>
                  <button className="ag-btn" onClick={() => act(entry.ref, "decline")}>Not for this role</button>
                </div>
                {asking === entry.ref && (
                  <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                    <input className="ag-input" placeholder="Your question about this candidate" value={question} onChange={(e) => setQuestion(e.target.value)} />
                    <button className="ag-btn ag-btn-primary" onClick={() => question.trim() && act(entry.ref, "question", question.trim())}>Send</button>
                  </div>
                )}
              </>
            )}

            {evidenceOpen === entry.ref && (
              <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                {entry.strengths.length > 0 && (
                  <div>
                    <div className="ag-eyebrow" style={{ marginBottom: 6 }}>Strengths, from the CV itself</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {entry.strengths.map((s, i) => (
                        <div key={i} className="ag-quote">
                          <span className="ag-mark">{s.quote}</span>
                          <div className="ag-meta" style={{ marginTop: 6, fontStyle: "normal" }}>{s.requirement}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {entry.gaps.length > 0 && (
                  <div>
                    <div className="ag-eyebrow" style={{ marginBottom: 6, color: "var(--ag-warn)" }}>Known gaps, stated plainly</div>
                    <div style={{ display: "grid", gap: 4 }}>
                      {entry.gaps.map((g, i) => (
                        <div key={i} style={{ fontSize: 12.5, color: "var(--ag-ink-2)" }}>
                          △ {g.requirement} <span className="ag-meta">({g.weight})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div style={{ background: "var(--ag-cream)", padding: "12px 28px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span className="ag-meta">Viewing as {viewer.name || "your team"}{viewer.company ? ` · ${viewer.company}` : ""} · this link is personal</span>
          <span className="ag-meta">Powered by Tailr</span>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--ag-ink-4)", textAlign: "center", marginTop: 16 }}>
        Every score above traces to CV evidence or the recruiter&apos;s screening call. Declining flags a candidate for your recruiter; it never removes anyone.
      </p>
    </div>
  )
}
