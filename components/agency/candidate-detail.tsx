"use client"

/**
 * Candidate detail: the deep dive. Full requirement × evidence map in the
 * expandable pattern (every claim opens to its verbatim quote or an explicit
 * MISSING card), the score breakdown bars, screening call findings when the
 * call happened, still to probe derived from what remains unevidenced, and
 * the decision card. All figures are server computed.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { resolveProbes } from "@/lib/agency/probes"
import { strengthLabel, weightPointsLabel } from "@/lib/agency/strengths"
import type { Strength, Weight } from "@/lib/agency/types"
import { stepNumber } from "@/lib/agency/steps"
import { RoleHeader } from "@/components/agency/role-header"
import { CandidateCompliance } from "@/components/agency/candidate-compliance"
import { CandidatePlacement } from "@/components/agency/candidate-placement"

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

/**
 * The candidate's evidence record, rendered in two places.
 *
 * It is a PAGE at /agencies/roles/[roleId]/candidates/[candidateId] — step 06
 * of seven, the address you send a colleague, the thing a refresh returns to.
 * It is also a MODAL over compare and screening, so opening somebody does not
 * cost you your place in the list you were working through.
 *
 * Both entrances render this component and both sit on the same URL; see the
 * @modal slot beside the page. The only difference is chrome: inside the
 * modal you are already on the role and already in step 06, so repeating the
 * role header and the step eyebrow would be exactly what the modal exists to
 * avoid.
 */
export function CandidateDetail({
  roleId,
  candidateId,
  inModal = false,
}: {
  roleId: string
  candidateId: string
  /** Suppresses the page-level chrome. See the note above. */
  inModal?: boolean
}) {
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
  /**
   * WHICH QUOTES ARE OPEN — a set, not a single id.
   *
   * This was `useState<string | null>`, so opening one requirement's evidence
   * closed the last. That is a working-surface control: it assumes you are
   * handling one thing. Step 06 is where the whole record is read, and
   * reading a record means holding two requirements side by side.
   */
  const [open, setOpen] = useState<Set<string>>(new Set())
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
  /**
   * Evidence indexed once per data change, never scanned per row.
   *
   * `evidenceFor` was `evidence.find(...)` and ran twice for every
   * requirement rendered — the exact linear-scan-inside-a-row the compare
   * matrix was fixed for. Ten requirements times two calls times a re-render
   * is not slow today; the invariant exists so it is not discovered to be
   * slow later, on a role with forty.
   */
  const evidenceByReq = useMemo(() => {
    const m = new Map<string, Evidence>()
    for (const e of evidence) {
      if (e.candidate_id !== candidateId) continue
      m.set(e.requirement_id, e)
    }
    return m
  }, [evidence, candidateId])
  const evidenceFor = useCallback((reqId: string) => evidenceByReq.get(reqId), [evidenceByReq])
  const effective = useCallback(
    (reqId: string): Strength => (score?.effective?.[reqId] ?? evidenceByReq.get(reqId)?.strength ?? "missing") as Strength,
    [score, evidenceByReq],
  )
  // The call script for this candidate, resolved from the ids the recruiter
  // picked during screening, plus the requirements still carrying no evidence.
  const allProbes = resolveProbes(Object.keys(review?.call_answers ?? {}), requirements)
  const answeredProbes = allProbes.filter((q) => (review?.call_answers?.[q.id] ?? "").trim().length > 0)
  const unevidenced = requirements.filter((r) => r.weight !== "nice" && ["missing", "partial"].includes(effective(r.id)))

  // Only requirements that actually have a quote can be opened, so "open
  // every quote" must not claim to have opened the MISSING ones — whose copy
  // is on the row already, and never collapses.
  const quotedReqIds = useMemo(
    () => requirements.filter((r) => (evidenceByReq.get(r.id)?.quote ?? "").length > 0).map((r) => r.id),
    [requirements, evidenceByReq],
  )
  const allOpen = quotedReqIds.length > 0 && quotedReqIds.every((id) => open.has(id))

  const idx = candidates.findIndex((c) => c.id === candidateId)
  const prev = idx > 0 ? candidates[idx - 1] : null
  const next = idx >= 0 && idx < candidates.length - 1 ? candidates[idx + 1] : null
  const delta = score?.original_overall != null ? Math.round(score.overall - score.original_overall) : 0
  const strengthsList = requirements.filter((r) => effective(r.id) === "strong")
  const risksList = requirements.filter((r) => ["missing", "partial"].includes(effective(r.id)))
  const confWord = ["", "LOW", "MEDIUM", "HIGH", "HIGH"][score?.confidence_level ?? 2] ?? "MEDIUM"

  return (
    <div className="ag-screen">
          {!inModal && <RoleHeader roleId={roleId} hat="recruiter" />}
          {!inModal && (
            <p className="ag-step-eyebrow">Step {stepNumber("detail")} · Candidate detail</p>
          )}

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
                      {/* The read-the-whole-thing pass. Rows also toggle
                          individually and independently of each other.
                          Hidden when nothing has a quote to open — a control
                          that cannot do anything is worse than no control,
                          and a candidate whose every requirement is MISSING
                          is exactly the case you least want to look broken. */}
                      {quotedReqIds.length > 0 && (
                        <button className="ag-evrow-all" onClick={() => setOpen(allOpen ? new Set() : new Set(quotedReqIds))}>
                          {allOpen ? "Close every quote" : "Open every quote"}
                        </button>
                      )}
                    </div>
                    <div className="ag-card-body ag-stack" style={{ gap: 8 }}>
                      {requirements.map((req) => {
                        const ev = evidenceFor(req.id)
                        const strength = effective(req.id)
                        const isOpen = open.has(req.id)
                        const mine = overridden.has(req.id)
                        return (
                          <div key={req.id} className="ag-evrow" data-override={mine} data-open={isOpen}>
                            {/* The identity strip: which requirement, what it
                                is worth, and — in words — how this person
                                reads against it. Strength was a bare dot and
                                a legend that scrolled away. */}
                            <div className="ag-evrow-strip">
                              <span className="ag-evrow-ref">{req.ref}</span>
                              <span className="ag-evrow-weight" data-must={req.weight === "must"}>
                                {req.weight} {weightPointsLabel(req.weight as Weight)}
                              </span>
                              <span className="ag-evrow-strength" data-strength={strength}>
                                <span className={`ag-dot ${strength}`} />
                                {strengthLabel(strength)}
                              </span>
                              {mine && <span className="ag-evrow-mine">Your call · attributed</span>}
                            </div>

                            {/* Wraps. This is the label you navigate ten of
                                these by; it was the thing being truncated. */}
                            <p className="ag-evrow-text">{req.text}</p>

                            {ev?.quote ? (
                              <>
                                <button
                                  className="ag-evrow-quote"
                                  aria-expanded={isOpen}
                                  /* aria-expanded alone announces "expanded"
                                     and names nothing. The citation line is
                                     what expanding reveals, so point at it. */
                                  aria-controls={`ev-src-${req.id}`}
                                  onClick={() =>
                                    setOpen((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(req.id)) next.delete(req.id)
                                      else next.add(req.id)
                                      return next
                                    })
                                  }
                                >
                                  <span className="ag-evrow-rule" aria-hidden="true" />
                                  <span className="ag-evrow-said">&ldquo;{ev.quote}&rdquo;</span>
                                  <span className="ag-evrow-cite">{ev.source_cite || "CV"}</span>
                                  <span className="ag-evrow-chev" aria-hidden="true">{isOpen ? "\u2303" : "\u2304"}</span>
                                </button>
                                {isOpen && (
                                  <p className="ag-evrow-source" id={`ev-src-${req.id}`}>
                                    Source · {ev.source_cite || "CV"}
                                    {ev.origin === "tailr_profile" ? " · Tailr profile" : ""}
                                    {" · "}
                                    {strength === "strong" ? "verbatim from the CV" : `recorded as ${strength}`}
                                  </p>
                                )}
                              </>
                            ) : (
                              /* Never clipped, never collapsed. This sentence
                                 refuses to let an absence read as a negative
                                 judgement, which is work no chip does alone. */
                              <p className="ag-evrow-missing">
                                No evidence found in the CV for this requirement. Marked{" "}
                                <span className="ag-missing-chip">MISSING</span>. Confirm on the screening call rather than
                                assuming either way.
                              </p>
                            )}

                            {/* A person disagreeing with the machine about
                                another person, said in a sentence. The
                                picker that made this call lives at step 04;
                                this screen reads the record, it does not
                                edit it. */}
                            {mine && ev && ev.strength !== strength && (
                              <p className="ag-evrow-override">
                                Tailr read this as {ev.strength}. You marked it {strength}.
                              </p>
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

                  <p className="ag-note" style={{ marginBottom: 8 }}>
                    Also on the{" "}
                    <a className="ag-crumb-link" style={{ textDecoration: "underline" }} href={`/agencies/candidates/${candidateId}`}>
                      candidate file
                    </a>
                    {" "}— the operational record outside the workflow, where these travel into the
                    handover pack.
                  </p>
                  <CandidateCompliance candidateId={candidateId} />

                  <CandidatePlacement candidateId={candidateId} />

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
  )
}
