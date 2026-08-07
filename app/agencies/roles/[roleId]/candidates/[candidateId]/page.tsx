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
import { resolveProbes } from "@/lib/agency/probes"
import { WORKFLOW_STEPS, stepNumber } from "@/lib/agency/steps"

interface Requirement { id: string; ref: string; text: string; weight: string; category?: string }
interface Candidate { id: string; ref: string; full_name: string; current_title: string; years: number | null; location: string; redacted: boolean }
interface Score {
  candidate_id: string; overall: number; must_have_hit: number; must_have_total: number
  original_overall: number | null; confidence_level: number; effective: Record<string, string>
  requirement_coverage: number; evidence_strength: number; seniority_calibration: number
  context_fit: number; confidence_completeness: number
}
interface Review { candidate_id: string; status: string; communication: number | null; motivation: number | null; availability: string; salary_confirm: string; notice_period: string; notes: string; call_answers?: Record<string, string> }
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
  // The call script for this candidate, resolved from the ids the recruiter
  // picked during screening, plus the requirements still carrying no evidence.
  const allProbes = resolveProbes(Object.keys(review?.call_answers ?? {}), requirements)
  const answeredProbes = allProbes.filter((q) => (review?.call_answers?.[q.id] ?? "").trim().length > 0)
  const unevidenced = requirements.filter((r) => r.weight !== "nice" && ["missing", "partial"].includes(effective(r.id)))

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
        <div>
          <div className="ag-rail-label">Role workflow</div>
          {WORKFLOW_STEPS.map((st) => (
            <button
              key={st.key}
              className={`ag-step${st.key === "detail" ? " on" : ""}`}
              onClick={() => {
                if (st.key === "detail") return
                router.push(`/agencies/roles/${roleId}?step=${st.key}`)
              }}
            >
              <span className={`ag-step-num${st.key !== "detail" && st.key !== "submission" ? " done" : ""}`}>
                {st.key !== "detail" && st.key !== "submission" ? "✓" : stepNumber(st.key)}
              </span>{" "}
              {st.label}
            </button>
          ))}
        </div>
        {candidate && (
          <div className="ag-active-role">
            <div className="ag-rail-label" style={{ padding: 0 }}>Viewing</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{candidate.full_name}</div>
            <div className="ag-meta">{candidate.ref}</div>
          </div>
        )}
        <div className="ag-sidebar-foot">
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>Missing means missing. Nothing on this page is inferred.</div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
              {" / "}
              <button className="ag-crumb-link" onClick={() => router.push(`/agencies/roles/${roleId}`)}>Role workflow</button>
              {" / "}
              <b>{stepNumber("detail")}. Candidate detail</b>
            </span>
            <span className="ag-grow" />
            <button className="ag-btn ag-btn-secondary" onClick={() => router.push(`/agencies/roles/${roleId}?step=compare`)}>← Compare</button>
            <button className="ag-btn ag-btn-secondary" onClick={() => router.push(`/agencies/roles/${roleId}?step=submission`)}>Submission →</button>
          </div>
          <p className="ag-step-eyebrow">Step {stepNumber("detail")} · Candidate detail</p>
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
                    <div style={{ color: "var(--ag-ink-2)", fontSize: 14 }}>
                      {[candidate.current_title, candidate.years ? `${candidate.years} years` : "", candidate.location].filter(Boolean).join(" · ")}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                      {score && <span className={`ag-score ${tier(score.overall)}`}>{Math.round(score.overall)}</span>}
                      {score?.original_overall != null && score.original_overall !== score.overall && (
                        <span className="ag-delta">{Math.round(score.original_overall)} → {Math.round(score.overall)} after call</span>
                      )}
                      {score && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span className="ag-conf-bars" title={`Confidence ${score.confidence_level} of 4`}>
                            {[1, 2, 3, 4].map((n) => (
                              <span key={n} className="ag-conf-bar" data-on={n <= score.confidence_level} style={{ height: 4 + n * 3 }} />
                            ))}
                          </span>
                          <span className="ag-meta">{["", "LOW", "MEDIUM", "HIGH", "HIGH"][score.confidence_level] ?? "MEDIUM"} CONFIDENCE</span>
                        </span>
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
                          <span className="ag-meta" style={{ paddingTop: 2 }}>{req.ref}</span>
                          <span className="ag-grow" style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>
                              {req.text}
                              {overridden.has(req.id) && <span className="ag-reviewed" style={{ position: "static", marginLeft: 8 }}>Your call</span>}
                            </span>
                            <span className="ag-matrix-weight">{req.weight}{req.category ? ` · ${req.category}` : ""}</span>
                          </span>
                          <span className={`ag-strength ${strength}`}>
                            <span className={`ag-dot ${strength}`} />{strength}
                          </span>
                          <span className="ag-meta">{isOpen ? "−" : "+"}</span>
                        </button>
                        {isOpen && (
                          <div style={{ padding: "0 18px 14px 48px" }}>
                            {ev?.quote ? (
                              <div>
                                <div className="ag-quote"><span className="ag-mark">{ev.quote}</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                                  <span className="ag-meta">Source · {ev.source_cite || "CV"}{ev.origin === "tailr_profile" ? " · Tailr profile" : ""}</span>
                                  <span className="ag-meta">{strength === "strong" ? "Verbatim from the CV" : "Recorded as " + strength}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="ag-drop" style={{ padding: 18, textAlign: "left" }}>
                                <span style={{ fontSize: 13, color: "var(--ag-ink-3)" }}>
                                  No evidence found in the CV for this requirement. Marked{" "}
                                  <span className="ag-missing-chip">MISSING</span>. Confirm during the screening call rather than assuming either way.
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
                        <div className="ag-nutrition-top">
                          <span className="ag-field-label" style={{ marginBottom: 0, color: "var(--ag-ink-3)" }}>Overall fit</span>
                          <span className="ag-nutrition-score">{Math.round(score.overall)}</span>
                        </div>
                        <div className="ag-nutrition-rule" />
                        {CATEGORY_BARS.map((bar) => (
                          <div className="ag-fit-row" key={bar.key} style={{ marginBottom: 8 }}>
                            <span className="ag-fit-label">{bar.label}</span>
                            <span className="ag-fit-num">{bar.weight}% · <b>{Math.round(Number(score[bar.key]) || 0)}</b></span>
                            <div className="ag-bar"><div className="ag-bar-fill" style={{ width: `${Math.min(100, Number(score[bar.key]) || 0)}%` }} /></div>
                          </div>
                        ))}
                        <div className="ag-nutrition-foot">
                          <span className="ag-fit-label">Must-have coverage</span>
                          <span className="ag-fit-num"><b>{score.must_have_hit}/{score.must_have_total}</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {review?.status === "reviewed" && (
                    <div className="ag-card">
                      <div className="ag-card-head">
                        <span className="ag-card-title">From the screening call</span>
                        <span className="ag-meta">{overridden.size} override{overridden.size === 1 ? "" : "s"} · {answeredProbes.length} answer{answeredProbes.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                        {review.notes && <div className="ag-callout" style={{ fontSize: 12.5 }}>&ldquo;{review.notes}&rdquo;</div>}
                        {answeredProbes.map((q, i) => (
                          <div key={q.id}>
                            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                              <span className="ag-qnum">Q{String(i + 1).padStart(2, "0")}</span>
                              <span style={{ fontSize: 12, color: "var(--ag-ink-2)", fontWeight: 500, flex: 1 }}>{q.text}</span>
                            </div>
                            <div style={{ marginLeft: 26, fontSize: 12.5, lineHeight: 1.5 }}>
                              <span style={{ color: "var(--ag-ink-4)" }}>&mdash; </span>{review.call_answers?.[q.id]}
                            </div>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--ag-border)", paddingTop: 10 }}>
                          {review.communication != null && <span className="ag-pill">Comms {review.communication}/5</span>}
                          {review.motivation != null && <span className="ag-pill">Motivation {review.motivation}/5</span>}
                          {review.availability && <span className="ag-pill">{review.availability}</span>}
                          {review.salary_confirm && <span className="ag-pill">{review.salary_confirm}</span>}
                          {review.notice_period && <span className="ag-pill">{review.notice_period}</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="ag-script">
                    <div className="ag-script-head">
                      <span className="ag-script-title">{review?.status === "reviewed" ? "Still to probe in interview" : "What to probe in interview"}</span>
                      <span className="ag-script-count">{answeredProbes.length}/{allProbes.length} answered</span>
                    </div>
                    <div className="ag-script-body">
                      {allProbes.length === 0 && (
                        <p className="ag-script-empty">
                          No questions on the call script yet, and every requirement has evidence. Add questions from the screening step.
                        </p>
                      )}
                      {allProbes.map((q, i) => {
                        const answered = ((review?.call_answers?.[q.id] ?? "").trim().length > 0)
                        return (
                          <div key={q.id} className="ag-probe-line" data-answered={answered}>
                            <span className="ag-qnum">Q{String(i + 1).padStart(2, "0")}</span>
                            <span className="ag-probe-text">{q.text}</span>
                            {answered && <span className="ag-probe-done">Answered</span>}
                          </div>
                        )
                      })}
                      {unevidenced.length > 0 && (
                        <div className="ag-probe-gap">
                          Still unevidenced: {unevidenced.map((r) => r.ref).join(", ")}. Worth a question if the call has not covered them.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Recruiter override</span><span className="ag-pill">Audit logged</span></div>
                    <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                      <div className="ag-field-label" style={{ marginBottom: -4 }}>Your decision</div>
                      <div className="ag-seg" style={{ width: "100%" }}>
                        {["shortlist", "hold", "reject"].map((d) => (
                          <button key={d} style={{ flex: 1 }} className={decision === d ? "on" : ""} onClick={() => decide(d)}>{d}</button>
                        ))}
                      </div>
                      <div className="ag-field-label" style={{ marginBottom: -4 }}>Note for the record</div>
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
