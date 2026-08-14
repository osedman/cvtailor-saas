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
interface Candidate { id: string; ref: string; full_name: string; current_title: string; years: number | null; location: string; salary_text?: string; redacted: boolean }
interface Role { id: string; ref: string; title: string; company: string }
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
  const [role, setRole] = useState<Role | null>(null)
  const [narrative, setNarrative] = useState("")
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
    setRole(roleBody.role ?? null)
    setRequirements(roleBody.requirements ?? [])
    setCandidates(candBody.candidates ?? [])
    const sMap: Record<string, Score> = {}
    for (const s of candBody.scores ?? []) sMap[s.candidate_id] = s
    setScores(sMap)
    const rMap: Record<string, Review> = {}
    for (const r of candBody.reviews ?? []) rMap[r.candidate_id] = r
    setReviews(rMap)
    setNarrative(rMap[candidateId]?.notes ?? "")
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

  /** The client-facing write up. Same field the submission narrative reads,
   *  so what you type here is what the hiring manager gets. */
  async function saveNarrative(text: string) {
    setNarrative(text)
    setReviews((prev) => ({ ...prev, [candidateId]: { ...(prev[candidateId] ?? ({} as Review)), notes: text } }))
    await fetch(`/api/agency/candidates/${candidateId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: text }),
    })
  }

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

  const idx = candidates.findIndex((c) => c.id === candidateId)
  const prev = idx > 0 ? candidates[idx - 1] : null
  const next = idx >= 0 && idx < candidates.length - 1 ? candidates[idx + 1] : null
  const delta = score?.original_overall != null ? Math.round(score.overall - score.original_overall) : 0
  // Weight multipliers from the scoring engine: must 3, important 2, nice 1.
  const weightPoints: Record<string, string> = { must: "+3.0", important: "+2.0", nice: "+1.0" }
  const strengthsList = requirements.filter((r) => effective(r.id) === "strong")
  const risksList = requirements.filter((r) => ["missing", "partial"].includes(effective(r.id)))
  const confWord = ["", "LOW", "MEDIUM", "HIGH", "HIGH"][score?.confidence_level ?? 2] ?? "MEDIUM"

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
        {role && (
          <div className="ag-active-role">
            <div className="ag-rail-label" style={{ padding: 0 }}>Active role</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{role.title}</div>
            <div className="ag-meta">{role.company || "No company"} · {role.ref}</div>
          </div>
        )}
        <div className="ag-sidebar-foot">
          <div className="ag-eyebrow" style={{ marginBottom: 6 }}>Decision support only</div>
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            No candidate is ever auto-rejected. All shortlists are subject to recruiter judgment.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          <div className="ag-crumbbar">
            <span className="ag-crumb">
              <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
              {" / "}
              <button className="ag-crumb-link" onClick={() => router.push(`/agencies/roles/${roleId}`)}>
                {role ? `${role.company || "Role"} — ${role.title}` : "Role workflow"}
              </button>
              {" / "}
              <b>{stepNumber("detail")}. Candidate detail</b>
            </span>
          </div>
          <p className="ag-step-eyebrow">Step {stepNumber("detail")} · Candidate detail</p>

          {error && <div className="ag-banner"><span style={{ color: "var(--ag-coral-deep)", fontSize: 12.5 }}>{error}</span></div>}
          {!candidate && !error && <div className="ag-card"><div className="ag-card-body"><span className="ag-spin" /></div></div>}

          {candidate && (
            <>
              <div className="ag-screen-head" style={{ alignItems: "center" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
                  <div className="ag-avatar" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(candidate.full_name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <h1 className="ag-title" style={{ fontSize: 30, margin: 0 }}>{candidate.full_name}</h1>
                    <div className="ag-meta">
                      {[candidate.ref, candidate.current_title, candidate.years ? `${candidate.years} yrs` : "", candidate.location].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flex: "none" }}>
                  <button className="ag-btn" disabled={!prev} onClick={() => prev && router.push(`/agencies/roles/${roleId}/candidates/${prev.id}`)}>← Prev</button>
                  <button className="ag-btn" disabled={!next} onClick={() => next && router.push(`/agencies/roles/${roleId}/candidates/${next.id}`)}>Next →</button>
                  {/* The stratigraphy view: not another step, a deeper read of
                      the same evidence — how each requirement came to be
                      believed, layer by layer. */}
                  <button
                    className="ag-btn"
                    onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${candidateId}/dossier`)}
                  >
                    Dossier
                  </button>
                  <button className="ag-btn ag-btn-primary" onClick={() => decide("shortlist")}>
                    {decision === "shortlist" ? "✓ On the shortlist" : "Add to submission"}
                  </button>
                </div>
              </div>

              <div className="ag-det-grid">
                <div className="ag-stack" style={{ minWidth: 0 }}>
                  <div className="ag-card">
                    <div className="ag-card-head">
                      <span className="ag-card-title">Recruiter narrative</span>
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {review?.status === "reviewed" && <span className="ag-reviewed inline">Call done</span>}
                        {delta !== 0 && score?.original_overall != null && (
                          <span className="ag-delta-pill">
                            {Math.round(score.original_overall)} → {Math.round(score.overall)} {delta > 0 ? `+${delta}` : delta}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="ag-card-body ag-stack" style={{ gap: 14 }}>
                      {narrative ? (
                        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65 }}>{narrative}</p>
                      ) : (
                        <p className="ag-note ag-note-quiet">
                          No narrative written yet. Whatever you record here travels to the client as this candidate&apos;s write up.
                        </p>
                      )}
                      <textarea
                        key={`${candidateId}:narrative`}
                        className="ag-textarea"
                        style={{ minHeight: 70 }}
                        placeholder="Your write up for the client. This is the paragraph the hiring manager reads first."
                        defaultValue={narrative}
                        onBlur={(e) => {
                          if (e.target.value === narrative) return
                          saveNarrative(e.target.value)
                        }}
                      />
                      {review?.notes && (
                        <div className="ag-callout">
                          <div className="ag-field-label">From your screening call</div>
                          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{review.notes}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ag-card">
                    <div className="ag-card-head">
                      <span className="ag-card-title">Evidence by requirement</span>
                      <span className="ag-meta">Click a row to see the source</span>
                    </div>
                    <div className="ag-card-body ag-stack" style={{ gap: 8 }}>
                      <div className="ag-legend" style={{ marginBottom: 0 }}>
                        <span className="ag-field-label" style={{ marginBottom: 0, marginRight: 4 }}>Legend</span>
                        <span><span className="ag-dot strong" /> Strong evidence — 1.0</span>
                        <span><span className="ag-dot transferable" /> Transferable — 0.7</span>
                        <span><span className="ag-dot partial" /> Partial — 0.4</span>
                        <span><span className="ag-dot missing" /> Missing — 0.0</span>
                      </div>
                      {requirements.map((req) => {
                        const ev = evidenceFor(req.id)
                        const strength = effective(req.id)
                        const isOpen = open === req.id
                        const mine = overridden.has(req.id)
                        return (
                          <div key={req.id} className="ag-evrow" data-override={mine} data-open={isOpen}>
                            <button className="ag-evrow-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : req.id)}>
                              <span className={`ag-dot ${strength}`} />
                              <span className="ag-meta" style={{ flex: "none" }}>{req.ref}</span>
                              <span className="ag-evrow-text">{req.text}</span>
                              {mine && <span className="ag-reviewed inline" style={{ flex: "none" }}>Your call</span>}
                              <span className="ag-evrow-weight" data-must={req.weight === "must"}>{req.weight}</span>
                              <span className="ag-evrow-pts">{weightPoints[req.weight] ?? ""}</span>
                              <span className="ag-evrow-chev">{isOpen ? "⌃" : "⌄"}</span>
                            </button>
                            {isOpen && (
                              <div className="ag-evrow-body">
                                {ev?.quote ? (
                                  <>
                                    <div className="ag-quote"><span className="ag-mark">{ev.quote}</span></div>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                                      <span className="ag-meta">Source · {ev.source_cite || "CV"}{ev.origin === "tailr_profile" ? " · Tailr profile" : ""}</span>
                                      <span className="ag-meta">{strength === "strong" ? "Verbatim from the CV" : `Recorded as ${strength}`}</span>
                                    </div>
                                  </>
                                ) : (
                                  <span style={{ fontSize: 13, color: "var(--ag-ink-3)" }}>
                                    No evidence found in the CV for this requirement. Marked{" "}
                                    <span className="ag-missing-chip">MISSING</span>. Confirm on the screening call rather than assuming either way.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="ag-det-cols">
                    <div className="ag-card">
                      <div className="ag-card-head"><span className="ag-card-title">Strengths</span><span className="ag-meta">{strengthsList.length}</span></div>
                      <div className="ag-card-body ag-stack" style={{ gap: 8 }}>
                        {strengthsList.length === 0 && <span className="ag-note">Nothing reads strong yet.</span>}
                        {strengthsList.map((r) => (
                          <div key={r.id} className="ag-sr-row">
                            <span className="ag-dot strong" />
                            <span>{r.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="ag-card">
                      <div className="ag-card-head"><span className="ag-card-title">Risks and gaps</span><span className="ag-meta">{risksList.length}</span></div>
                      <div className="ag-card-body ag-stack" style={{ gap: 8 }}>
                        {risksList.length === 0 && <span className="ag-note">Every requirement has evidence.</span>}
                        {risksList.map((r) => (
                          <div key={r.id} className="ag-sr-row">
                            <span className={`ag-dot ${effective(r.id)}`} />
                            <span>{r.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="ag-card">
                    <div className="ag-card-head">
                      <span className="ag-card-title">Call answers</span>
                      <span className="ag-meta">{answeredProbes.length}/{allProbes.length} answered</span>
                    </div>
                    <div className="ag-card-body ag-stack" style={{ gap: 14 }}>
                      {allProbes.length === 0 && (
                        <span className="ag-note">
                          No questions were put on the call script for this candidate.
                        </span>
                      )}
                      {allProbes.map((q, i) => {
                        const answer = (review?.call_answers?.[q.id] ?? "").trim()
                        return (
                          <div key={q.id} className="ag-qa">
                            <div className="ag-qa-q">
                              <span className="ag-qnum">Q{String(i + 1).padStart(2, "0")}</span>
                              <span>{q.text}</span>
                            </div>
                            {answer ? (
                              <div className="ag-qa-a"><span className="ag-qa-dash">— </span>{answer}</div>
                            ) : (
                              <div className="ag-qa-a ag-note-quiet">Not answered on the call.</div>
                            )}
                          </div>
                        )
                      })}
                      {unevidenced.length > 0 && (
                        <p className="ag-note">
                          Still unevidenced: {unevidenced.map((r) => r.ref).join(", ")}. Worth asking if the call has not covered them.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="ag-det-side">
                  {score && (
                    <div className="ag-card">
                      <div className="ag-card-head"><span className="ag-card-title">Score breakdown</span></div>
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
                            <div className="ag-bar"><div className="ag-bar-fill" data-weak={(Number(score[bar.key]) || 0) < 60} style={{ width: `${Math.min(100, Number(score[bar.key]) || 0)}%` }} /></div>
                          </div>
                        ))}
                        <div className="ag-nutrition-foot">
                          <span className="ag-fit-label">Must-have coverage</span>
                          <span className="ag-fit-num"><b>{score.must_have_hit}/{score.must_have_total}</b></span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                          <span className="ag-conf-bars" title={`Confidence ${score.confidence_level} of 4`}>
                            {[1, 2, 3, 4].map((n) => (
                              <span key={n} className="ag-conf-bar" data-on={n <= score.confidence_level} style={{ height: 4 + n * 3 }} />
                            ))}
                          </span>
                          <span className="ag-meta">{confWord} confidence</span>
                        </div>
                        {delta !== 0 && (
                          <p className="ag-score-moved">
                            Score moved {delta > 0 ? "up" : "down"} {Math.abs(delta)} point{Math.abs(delta) === 1 ? "" : "s"} after your screening call.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Your decision</span></div>
                    <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                      <div className="ag-seg" style={{ width: "100%" }}>
                        {["shortlist", "hold", "reject"].map((d) => (
                          <button key={d} style={{ flex: 1 }} className={decision === d ? "on" : ""} onClick={() => decide(d)}>{d}</button>
                        ))}
                      </div>
                      <p className="ag-note">
                        Decisions are yours and reversible. Tailr never rejects a candidate.
                      </p>
                      <div>
                        <div className="ag-field-label">Note for the record</div>
                        <textarea
                          className="ag-textarea"
                          style={{ minHeight: 64 }}
                          placeholder="Why, in a sentence. Visible to your team, never the client."
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          onBlur={() => decision && decide(decision)}
                        />
                      </div>
                      <span className="ag-meta">Attached to {candidate.ref} · visible to team · not shared with client</span>
                    </div>
                  </div>

                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Soft signals</span></div>
                    <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                      {!review?.status && <span className="ag-note">No call logged yet.</span>}
                      {review?.availability && <div className="ag-kv"><span>Availability</span><b>{review.availability}</b></div>}
                      {review?.salary_confirm && <div className="ag-kv"><span>Comp position</span><b>{review.salary_confirm}</b></div>}
                      {review?.notice_period && <div className="ag-kv"><span>Notice</span><b>{review.notice_period}</b></div>}
                      {review?.communication != null && <div className="ag-kv"><span>Communication</span><b>{review.communication}/5</b></div>}
                      {review?.motivation != null && <div className="ag-kv"><span>Motivation</span><b>{review.motivation}/5</b></div>}
                    </div>
                  </div>

                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Logistics</span></div>
                    <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                      <div className="ag-kv"><span>Comp expectation</span><b>{candidate.salary_text || "Not parsed"}</b></div>
                      <div className="ag-kv"><span>Location</span><b>{candidate.location || "Not parsed"}</b></div>
                      <div className="ag-kv"><span>Experience</span><b>{candidate.years ? `${candidate.years} years` : "Not parsed"}</b></div>
                      {candidate.redacted && <span className="ag-pill ag-pill-warn">Partial CV</span>}
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