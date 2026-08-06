"use client"

/**
 * Candidate detail: the deep dive. Full requirement × evidence map in the
 * expandable pattern (every claim opens to its verbatim quote or an explicit
 * MISSING card), the score breakdown bars, screening call findings when the
 * call happened, still to probe derived from what remains unevidenced, and
 * the decision card. All figures are server computed.
 */

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface Requirement { id: string; ref: string; text: string; weight: string }
interface Candidate { id: string; ref: string; full_name: string; current_title: string; years: number | null; location: string; redacted: boolean }
interface Score {
  candidate_id: string; overall: number; must_have_hit: number; must_have_total: number
  original_overall: number | null; confidence_level: number; effective: Record<string, string>
  requirement_coverage: number; evidence_strength: number; seniority_calibration: number
  context_fit: number; confidence_completeness: number
}
interface Review { candidate_id: string; status: string; communication: number | null; motivation: number | null; availability: string; salary_confirm: string; notice_period: string; notes: string }
interface Evidence { candidate_id: string; requirement_id: string; strength: string; quote: string | null; source_cite: string; origin: string }

const CATEGORY_BARS: Array<{ key: keyof Score; label: string; weight: number }> = [
  { key: "requirement_coverage", label: "Requirement coverage", weight: 45 },
  { key: "evidence_strength", label: "Evidence strength", weight: 25 },
  { key: "seniority_calibration", label: "Seniority calibration", weight: 10 },
  { key: "context_fit", label: "Context fit", weight: 10 },
  { key: "confidence_completeness", label: "Confidence", weight: 10 },
]

export default function CandidateDetailPage({ params }: { params: Promise<{ roleId: string; candidateId: string }> }) {
  const { roleId, candidateId } = use(params)
  const router = useRouter()
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [reviews, setReviews] = useState<Record<string, Review>>({})
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [overridden, setOverridden] = useState<Set<string>>(new Set())
  const [decision, setDecision] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [roleRes, candRes, reviewRes] = await Promise.all([
      fetch(`/api/agency/roles/${roleId}`),
      fetch(`/api/agency/roles/${roleId}/candidates`),
      fetch(`/api/agency/candidates/${candidateId}/review`),
    ])
    if (roleRes.status === 401) return router.push("/agencies")
    if (!roleRes.ok || !candRes.ok) return setError("Not found in your agency")
    const roleBody = await roleRes.json()
    const candBody = await candRes.json()
    setRequirements(roleBody.requirements ?? [])
    setCandidates(candBody.candidates ?? [])
    const sMap: Record<string, Score> = {}
    for (const s of candBody.scores ?? []) sMap[s.candidate_id] = s
    setScores(sMap)
    const rMap: Record<string, Review> = {}
    for (const r of candBody.reviews ?? []) rMap[r.candidate_id] = r
    setReviews(rMap)
    setEvidence(candBody.evidence ?? [])
    const mine = (candBody.decisions ?? []).find((d: { candidate_id: string }) => d.candidate_id === candidateId)
    setDecision(mine?.decision ?? null)
    setNote(mine?.decision_note ?? "")
    if (reviewRes.ok) {
      const reviewBody = await reviewRes.json()
      setOverridden(new Set((reviewBody.overrides ?? []).map((o: { requirement_id: string }) => o.requirement_id)))
    }
  }, [roleId, candidateId, router])

  useEffect(() => { load() }, [load])

  async function decide(next: string | null) {
    const value = decision === next ? null : next
    setDecision(value)
    await fetch(`/api/agency/candidates/${candidateId}/decision`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: value, note }),
    })
  }

  const candidate = candidates.find((c) => c.id === candidateId)
  const score = scores[candidateId]
  const review = reviews[candidateId]
  const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
  const tier = (n: number) => (n >= 80 ? "hi" : n >= 60 ? "med" : "lo")
  const evidenceFor = (reqId: string) => evidence.find((e) => e.candidate_id === candidateId && e.requirement_id === reqId)
  const effective = (reqId: string) => score?.effective?.[reqId] ?? evidenceFor(reqId)?.strength ?? "missing"
  const toProbe = requirements.filter((r) => ["missing", "partial"].includes(effective(r.id)))

  return (
    <>
      <aside className="ag-sidebar">
        <button className="ag-brand" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => router.push("/agencies")}>
          <div className="ag-brand-mark">T</div>
          <div style={{ textAlign: "left" }}>
            <div className="ag-brand-name">Tailr</div>
            <div className="ag-brand-sub">For agencies</div>
          </div>
        </button>
        <button className="ag-btn ag-btn-secondary" onClick={() => router.push(`/agencies/roles/${roleId}`)}>Back to the workflow</button>
        <div className="ag-sidebar-foot">
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>Missing means missing. Nothing on this page is inferred.</div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          {error && <div className="ag-banner"><span style={{ color: "var(--ag-coral-deep)", fontSize: 12.5 }}>{error}</span></div>}
          {!candidate && !error && <div className="ag-card"><div className="ag-card-body"><span className="ag-spin" /></div></div>}

          {candidate && (
            <>
              <div className="ag-tabstrip">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    className={`ag-btn ${c.id === candidateId ? "ag-btn-primary" : "ag-btn-secondary"}`}
                    onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}
                  >
                    {c.full_name.split(" ")[0]}{scores[c.id] ? ` · ${Math.round(scores[c.id].overall)}` : ""}
                  </button>
                ))}
              </div>

              <div className="ag-screen-head">
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <div className="ag-avatar" style={{ width: 54, height: 54, fontSize: 17 }}>{initials(candidate.full_name)}</div>
                  <div>
                    <h1 className="ag-title" style={{ fontSize: 28 }}>{candidate.full_name}</h1>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                      {score && <span className={`ag-score ${tier(score.overall)}`}>{Math.round(score.overall)}</span>}
                      {score?.original_overall != null && score.original_overall !== score.overall && (
                        <span className="ag-delta">{Math.round(score.original_overall)} → {Math.round(score.overall)} after call</span>
                      )}
                      {score && <span className="ag-meta">{score.must_have_hit}/{score.must_have_total} musts · {candidate.ref}</span>}
                      {review?.status === "reviewed" && <span className="ag-reviewed" style={{ position: "static" }}>Call done</span>}
                      {candidate.redacted && <span className="ag-pill ag-pill-warn">Partial CV</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="ag-grid-2" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Requirement × evidence</span>
                    <span className="ag-meta">Click a row for the quote</span>
                  </div>
                  {requirements.map((req) => {
                    const ev = evidenceFor(req.id)
                    const strength = effective(req.id)
                    const isOpen = open === req.id
                    return (
                      <div key={req.id}>
                        <button className="ag-req-btn" onClick={() => setOpen(isOpen ? null : req.id)}>
                          <span className="ag-meta">{req.ref}</span>
                          <span className="ag-grow" style={{ fontSize: 13 }}>
                            {req.text}
                            {overridden.has(req.id) && <span className="ag-reviewed" style={{ position: "static", marginLeft: 8 }}>Your call</span>}
                          </span>
                          <span className="ag-pill">{req.weight}</span>
                          <span className={`ag-dot ${strength}`} />
                          <span className="ag-meta">{strength}</span>
                          <span className="ag-meta">{isOpen ? "−" : "+"}</span>
                        </button>
                        {isOpen && (
                          <div style={{ padding: "0 18px 14px 48px" }}>
                            {ev?.quote ? (
                              <div className="ag-quote">
                                <span className="ag-mark">{ev.quote}</span>
                                <div className="ag-meta" style={{ marginTop: 8, fontStyle: "normal" }}>Source · {ev.source_cite || "CV"}{ev.origin === "tailr_profile" ? " · Tailr profile" : ""}</div>
                              </div>
                            ) : (
                              <div className="ag-drop" style={{ padding: 18, textAlign: "left" }}>
                                <span style={{ fontSize: 12.5, color: "var(--ag-ink-4)", fontStyle: "italic" }}>
                                  No evidence found in the CV. Confirm during the screening call rather than assuming either way.
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="ag-stack">
                  {score && (
                    <div className="ag-card">
                      <div className="ag-card-head"><span className="ag-card-title">Score breakdown</span><span className="ag-meta">Server computed</span></div>
                      <div className="ag-card-body">
                        {CATEGORY_BARS.map((bar) => (
                          <div className="ag-bar-row" key={bar.key}>
                            <span style={{ fontSize: 12.5, width: 150 }}>{bar.label}</span>
                            <div className="ag-bar"><div className="ag-bar-fill" style={{ width: `${Math.min(100, Number(score[bar.key]) || 0)}%` }} /></div>
                            <span className="ag-meta" style={{ width: 60, textAlign: "right" }}>{Math.round(Number(score[bar.key]) || 0)} · {bar.weight}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {review?.status === "reviewed" && (
                    <div className="ag-card">
                      <div className="ag-card-head"><span className="ag-card-title">From the screening call</span><span className="ag-reviewed" style={{ position: "static" }}>Call done</span></div>
                      <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                        {review.notes && <div className="ag-callout" style={{ fontSize: 12.5 }}>{review.notes}</div>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {review.communication != null && <span className="ag-pill">Comms {review.communication}/5</span>}
                          {review.motivation != null && <span className="ag-pill">Motivation {review.motivation}/5</span>}
                          {review.availability && <span className="ag-pill">{review.availability}</span>}
                          {review.salary_confirm && <span className="ag-pill">{review.salary_confirm}</span>}
                          {review.notice_period && <span className="ag-pill">{review.notice_period}</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">{review?.status === "reviewed" ? "Still to probe" : "What to probe on the call"}</span></div>
                    <div className="ag-card-body ag-stack" style={{ gap: 8 }}>
                      {toProbe.length === 0 && <span style={{ fontSize: 12.5, color: "var(--ag-ink-3)" }}>Every requirement has evidence or a confirmed call answer.</span>}
                      {toProbe.map((req, i) => (
                        <div key={req.id} style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
                          <span className="ag-meta">Q{String(i + 1).padStart(2, "0")}</span>
                          <span>{effective(req.id) === "missing" ? "No evidence yet for: " : "Only partial evidence for: "}{req.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Recruiter decision</span><span className="ag-pill">Audit logged</span></div>
                    <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                      <div className="ag-seg" style={{ width: "100%" }}>
                        {["shortlist", "hold", "reject"].map((d) => (
                          <button key={d} style={{ flex: 1 }} className={decision === d ? "on" : ""} onClick={() => decide(d)}>{d}</button>
                        ))}
                      </div>
                      <textarea className="ag-textarea" style={{ minHeight: 70 }} placeholder="Why, in a sentence. Visible to your team, never the client." value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => decision && decide(decision)} />
                      <span className="ag-meta">Attached to {candidate.ref} · visible to team · not shared with client</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}
