"use client"

/**
 * The role workflow, all six steps live against the real APIs:
 * intake → parse review → candidates → screening calls → compare → submission.
 * Every score on this page came from the server; the browser never computes
 * one. Overrides, decisions and submissions are audit coupled server side.
 */

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type Step = "intake" | "parse" | "candidates" | "screening" | "compare" | "submission"

interface Requirement { id: string; ref: string; text: string; weight: "must" | "important" | "nice" }
interface Constraint { id: string; ref: string; text: string; kind: string }
interface Role { id: string; ref: string; title: string; company: string; company_context: string; salary_band: string; location: string; seniority: string; jd_raw: string; recruiter_notes: string; status: string }
interface Candidate { id: string; ref: string; full_name: string; current_title: string; years: number | null; location: string; parse_status: string; duplicate_of: string | null }
interface Score { candidate_id: string; overall: number; must_have_hit: number; must_have_total: number; original_overall: number | null; confidence_level: number; effective: Record<string, string> }
interface Review { candidate_id: string; status: string; communication: number | null; motivation: number | null; availability: string; salary_confirm: string; notice_period: string; notes: string }
interface Evidence { candidate_id: string; requirement_id: string; strength: string; quote: string | null }

type Strength = "strong" | "transferable" | "partial" | "missing"
const STRENGTHS: Strength[] = ["strong", "transferable", "partial", "missing"]
const WEIGHT_ORDER: Record<string, "must" | "important" | "nice"> = { must: "important", important: "nice", nice: "must" }
const GROUPS: Array<{ weight: "must" | "important" | "nice"; label: string; hint: string }> = [
  { weight: "must", label: "Must have", hint: "Weight about 45% of the score. Zero here is a hard fail." },
  { weight: "important", label: "Important", hint: "Weighted, but not disqualifying if missing." },
  { weight: "nice", label: "Nice to have", hint: "Signal only. Adds bonus points, never subtracts." },
]

export default function RoleWorkflowPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = use(params)
  const router = useRouter()
  const [role, setRole] = useState<Role | null>(null)
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [reviews, setReviews] = useState<Record<string, Review>>({})
  const [decisions, setDecisions] = useState<Record<string, string | null>>({})
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [overrides, setOverrides] = useState<Record<string, Record<string, Strength>>>({})
  const [step, setStep] = useState<Step>("intake")
  const [activeCandidate, setActiveCandidate] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState("")
  const [submissionResult, setSubmissionResult] = useState<{ format: string; entries: number; links: Array<{ url: string }> } | null>(null)
  const [contacts, setContacts] = useState<Array<{ id: string; company: string; email: string; full_name: string }>>([])
  const [chosenContacts, setChosenContacts] = useState<string[]>([])
  const [newContact, setNewContact] = useState({ company: "", email: "", full_name: "" })

  const loadCandidates = useCallback(async () => {
    const res = await fetch(`/api/agency/roles/${roleId}/candidates`)
    if (!res.ok) return 0
    const body = await res.json()
    setCandidates(body.candidates ?? [])
    const sMap: Record<string, Score> = {}
    for (const s of body.scores ?? []) sMap[s.candidate_id] = s
    setScores(sMap)
    const rMap: Record<string, Review> = {}
    for (const r of body.reviews ?? []) rMap[r.candidate_id] = r
    setReviews(rMap)
    const dMap: Record<string, string | null> = {}
    for (const d of body.decisions ?? []) dMap[d.candidate_id] = d.decision
    setDecisions(dMap)
    setEvidence(body.evidence ?? [])
    return (body.candidates ?? []).length as number
  }, [roleId])

  const loadReviewDetail = useCallback(async (candidateId: string) => {
    const res = await fetch(`/api/agency/candidates/${candidateId}/review`)
    if (!res.ok) return
    const body = await res.json()
    const map: Record<string, Strength> = {}
    for (const o of body.overrides ?? []) map[o.requirement_id] = o.to_strength
    setOverrides((prev) => ({ ...prev, [candidateId]: map }))
    if (body.review) setReviews((prev) => ({ ...prev, [candidateId]: body.review }))
  }, [])

  useEffect(() => {
    ;(async () => {
      const res = await fetch(`/api/agency/roles/${roleId}`)
      if (res.status === 401) return router.push("/agencies")
      if (!res.ok) return setError("Role not found in your agency")
      const body = await res.json()
      setRole(body.role)
      setRequirements(body.requirements ?? [])
      setConstraints(body.constraints ?? [])
      const count = (await loadCandidates()) ?? 0
      setStep(count > 0 ? "candidates" : (body.requirements ?? []).length > 0 ? "parse" : "intake")
    })()
  }, [roleId, router, loadCandidates])

  useEffect(() => {
    if (step === "screening" && candidates.length > 0) {
      const first = activeCandidate ?? candidates[0].id
      setActiveCandidate(first)
      for (const c of candidates) loadReviewDetail(c.id)
    }
  }, [step, candidates, activeCandidate, loadReviewDetail])

  function patchRole(fields: Partial<Role>) {
    setRole((r) => (r ? { ...r, ...fields } : r))
  }

  async function saveIntake() {
    if (!role) return
    // Intake fields only. Status changes go through closeRole so they are
    // audit logged deliberately, never as a side effect of typing.
    const { title, company, company_context, salary_band, location, seniority, jd_raw, recruiter_notes } = role
    await fetch(`/api/agency/roles/${roleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, company, company_context, salary_band, location, seniority, jd_raw, recruiter_notes }),
    })
  }

  async function setRoleStatus(status: string) {
    const res = await fetch(`/api/agency/roles/${roleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const body = await res.json()
      patchRole({ status: body.role.status })
    }
  }

  const loadContacts = useCallback(async () => {
    const res = await fetch("/api/agency/contacts")
    if (res.ok) {
      const body = await res.json()
      setContacts(body.contacts ?? [])
    }
  }, [])

  async function createContact() {
    if (!newContact.email.trim() || !newContact.company.trim()) {
      return setError("A contact needs a company and an email address")
    }
    const res = await fetch("/api/agency/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newContact),
    })
    const body = await res.json()
    if (!res.ok) return setError(body.error ?? "Could not save the contact")
    setNewContact({ company: "", email: "", full_name: "" })
    setChosenContacts((prev) => [...prev, body.contact.id])
    await loadContacts()
  }

  useEffect(() => {
    if (step === "submission") loadContacts()
  }, [step, loadContacts])

  async function extract() {
    if (!role) return
    setBusy("extract")
    setError(null)
    try {
      await saveIntake()
      const res = await fetch(`/api/agency/roles/${roleId}/parse`, { method: "POST" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Extraction failed")
      setRequirements(body.requirements ?? [])
      setConstraints((body.constraints ?? []).map((c: Constraint, i: number) => ({ ...c, id: c.id ?? String(i), ref: c.ref ?? `C0${i + 1}` })))
      setStep("parse")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function cycleWeight(req: Requirement) {
    const weight = WEIGHT_ORDER[req.weight]
    setRequirements((rs) => rs.map((r) => (r.id === req.id ? { ...r, weight } : r)))
    await fetch(`/api/agency/requirements/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weight }),
    })
  }

  async function removeRequirement(req: Requirement) {
    setRequirements((rs) => rs.filter((r) => r.id !== req.id))
    await fetch(`/api/agency/requirements/${req.id}`, { method: "DELETE" })
  }

  async function ingest(bodyInit: RequestInit) {
    setBusy("ingest")
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/candidates`, { method: "POST", ...bodyInit })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Ingestion failed")
      setPaste("")
      await loadCandidates()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function patchReview(candidateId: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/agency/candidates/${candidateId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const body = await res.json()
      if (body.score) {
        setScores((prev) => ({ ...prev, [candidateId]: { ...prev[candidateId], ...body.score, candidate_id: candidateId } }))
      }
      await loadReviewDetail(candidateId)
      const listRes = await fetch(`/api/agency/roles/${roleId}/candidates`)
      if (listRes.ok) {
        const list = await listRes.json()
        const rMap: Record<string, Review> = {}
        for (const r of list.reviews ?? []) rMap[r.candidate_id] = r
        setReviews(rMap)
      }
    }
  }

  async function setOverride(candidateId: string, requirementId: string, strength: Strength | null) {
    setOverrides((prev) => {
      const mine = { ...(prev[candidateId] ?? {}) }
      if (strength === null) delete mine[requirementId]
      else mine[requirementId] = strength
      return { ...prev, [candidateId]: mine }
    })
    await patchReview(candidateId, { overrides: { [requirementId]: strength } })
  }

  async function resetCall(candidateId: string) {
    const res = await fetch(`/api/agency/candidates/${candidateId}/review`, { method: "DELETE" })
    if (res.ok) {
      setOverrides((prev) => ({ ...prev, [candidateId]: {} }))
      await loadCandidates()
    }
  }

  async function decide(candidateId: string, decision: string | null) {
    const next = decisions[candidateId] === decision ? null : decision
    setDecisions((prev) => ({ ...prev, [candidateId]: next }))
    await fetch(`/api/agency/candidates/${candidateId}/decision`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: next }),
    })
  }

  async function generateSubmission(format: string) {
    if (format === "portal" && chosenContacts.length === 0) {
      return setError("Choose at least one recipient. Portal links are personal, one per named person.")
    }
    setBusy("submission")
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/submission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          ...(format === "portal" ? { recipients: chosenContacts.map((id) => ({ contact_id: id })) } : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Generation failed")
      setSubmissionResult({ format, entries: body.submission?.snapshot?.shortlisted?.length ?? 0, links: body.links ?? [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const initials = (name: string) =>
    name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
  const tier = (n: number) => (n >= 80 ? "hi" : n >= 60 ? "med" : "lo")
  const parsedStrength = (candidateId: string, requirementId: string): Strength =>
    ((evidence.find((e) => e.candidate_id === candidateId && e.requirement_id === requirementId)?.strength ?? "missing") as Strength)
  const effectiveStrength = (candidateId: string, requirementId: string): Strength =>
    (overrides[candidateId]?.[requirementId] ?? scores[candidateId]?.effective?.[requirementId] ?? parsedStrength(candidateId, requirementId)) as Strength
  const reviewedCount = Object.values(reviews).filter((r) => r.status === "reviewed").length
  const shortlisted = Object.values(decisions).filter((d) => d === "shortlist").length
  const decisionTotals = ["shortlist", "hold", "reject"].map((d) => `${Object.values(decisions).filter((x) => x === d).length} ${d}`).join(" · ")

  const steps: Array<{ key: Step; label: string }> = [
    { key: "intake", label: "Role intake" },
    { key: "parse", label: "Parse review" },
    { key: "candidates", label: "Add candidates" },
    { key: "screening", label: "Screening calls" },
    { key: "compare", label: "Compare" },
    { key: "submission", label: "Client submission" },
  ]
  const active = activeCandidate ? candidates.find((c) => c.id === activeCandidate) : null
  const activeScore = activeCandidate ? scores[activeCandidate] : null
  const activeReview = activeCandidate ? reviews[activeCandidate] : null

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
          {steps.map((s, i) => (
            <button key={s.key} className={`ag-step${step === s.key ? " on" : ""}`} onClick={() => setStep(s.key)}>
              <span className="ag-step-num">{`0${i + 1}`}</span> {s.label}
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
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Decision support only. All shortlists are subject to recruiter judgment.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          {error && (
            <div className="ag-banner" style={{ marginBottom: 16 }}>
              <div className="ag-grow" style={{ fontSize: 12.5, color: "var(--ag-coral-deep)" }}>{error}</div>
              <button className="ag-btn" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          {!role && !error && <div className="ag-card"><div className="ag-card-body"><span className="ag-spin" /></div></div>}

          {role && step === "intake" && (
            <>
              <div className="ag-screen-head">
                <div>
                  <h1 className="ag-title">Paste the brief.<br />We&apos;ll structure it with you.</h1>
                  <p className="ag-sub">The job description and your notes are the input everything downstream is scored against.</p>
                </div>
                <button className="ag-btn ag-btn-primary" onClick={extract} disabled={busy !== null || !role.jd_raw.trim()}>
                  {busy === "extract" ? <><span className="ag-spin" /> Extracting requirements</> : "Extract requirements"}
                </button>
              </div>
              <div className="ag-grid-2">
                <div className="ag-card">
                  <div className="ag-card-head"><span className="ag-card-title">Job description</span><span className="ag-meta">The main source</span></div>
                  <div className="ag-card-body">
                    <textarea className="ag-textarea jd" placeholder="Paste the client's job description here" value={role.jd_raw} onChange={(e) => patchRole({ jd_raw: e.target.value })} onBlur={saveIntake} />
                  </div>
                </div>
                <div className="ag-stack">
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Role &amp; client</span></div>
                    <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                      <div><label className="ag-label">Role title</label><input className="ag-input" value={role.title} onChange={(e) => patchRole({ title: e.target.value })} onBlur={saveIntake} /></div>
                      <div><label className="ag-label">Company</label><input className="ag-input" value={role.company} onChange={(e) => patchRole({ company: e.target.value })} onBlur={saveIntake} /></div>
                      <div><label className="ag-label">Context</label><textarea className="ag-textarea" style={{ minHeight: 80 }} value={role.company_context} onChange={(e) => patchRole({ company_context: e.target.value })} onBlur={saveIntake} /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><label className="ag-label">Comp band</label><input className="ag-input" value={role.salary_band} onChange={(e) => patchRole({ salary_band: e.target.value })} onBlur={saveIntake} /></div>
                        <div><label className="ag-label">Location</label><input className="ag-input" value={role.location} onChange={(e) => patchRole({ location: e.target.value })} onBlur={saveIntake} /></div>
                      </div>
                    </div>
                  </div>
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Recruiter notes</span><span className="ag-pill">Private</span></div>
                    <div className="ag-card-body">
                      <textarea className="ag-textarea" placeholder="What the client said that never made the JD" value={role.recruiter_notes} onChange={(e) => patchRole({ recruiter_notes: e.target.value })} onBlur={saveIntake} />
                      <p style={{ fontSize: 11.5, color: "var(--ag-ink-4)", marginTop: 8 }}>Notes feed the scoring and never reach the client.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ag-callout" style={{ marginTop: 24 }}>
                <div className="ag-eyebrow" style={{ marginBottom: 4 }}>Evidence first</div>
                Every score traces to CV evidence, your override, or an explicit MISSING. Nothing is inferred and nobody is rejected automatically.
              </div>
            </>
          )}

          {role && step === "parse" && (
            <>
              <div className="ag-screen-head">
                <div>
                  <h1 className="ag-title">Check what we extracted.</h1>
                  <p className="ag-sub">Click a chip to cycle its weight. This is the human in the loop moment before anything is scored.</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="ag-btn" onClick={() => setStep("intake")}>Back</button>
                  <button className="ag-btn ag-btn-primary" onClick={() => setStep("candidates")} disabled={requirements.length === 0}>Continue to candidates</button>
                </div>
              </div>
              <div className="ag-grid-2" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Requirements</span>
                    <span className="ag-meta">{(["must", "important", "nice"] as const).map((w) => `${requirements.filter((r) => r.weight === w).length} ${w}`).join(" · ")}</span>
                  </div>
                  <div className="ag-card-body ag-stack" style={{ gap: 20 }}>
                    {GROUPS.map((group) => (
                      <div key={group.weight}>
                        <div className="ag-meta" style={{ marginBottom: 2 }}>{group.label}</div>
                        <div className="ag-group-hint">{group.hint}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {requirements.filter((r) => r.weight === group.weight).map((req) => (
                            <span key={req.id} className={`ag-chip ${req.weight === "must" ? "must" : req.weight === "nice" ? "nice" : ""}`} onClick={() => cycleWeight(req)}>
                              <span className="id">{req.ref}</span> {req.text}
                              <button className="x" onClick={(e) => { e.stopPropagation(); removeRequirement(req) }}>×</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ag-stack">
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Constraints</span></div>
                    <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                      {constraints.length === 0 && <span style={{ fontSize: 12.5, color: "var(--ag-ink-4)" }}>None extracted.</span>}
                      {constraints.map((c, i) => (
                        <div key={c.id ?? i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="ag-meta">{c.ref}</span>
                          <span className="ag-grow" style={{ fontSize: 13 }}>{c.text}</span>
                          <span className="ag-pill">{c.kind}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Weighting model</span></div>
                    <div className="ag-card-body">
                      {[["Requirement coverage", 45], ["Evidence strength", 25], ["Seniority calibration", 10], ["Context fit", 10], ["Confidence", 10]].map(([name, pct]) => (
                        <div className="ag-weight-row" key={name as string}>
                          <span style={{ fontSize: 12.5, width: 150 }}>{name}</span>
                          <div className="ag-weight-bar"><div className="ag-weight-fill" style={{ width: `${(pct as number) * 2}%` }} /></div>
                          <span className="ag-meta">{pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {role && step === "candidates" && (
            <>
              <div className="ag-screen-head">
                <div>
                  <h1 className="ag-title">Add candidates.</h1>
                  <p className="ag-sub">PDF, DOCX or pasted text, up to 10 per role. Scoring runs on the server the moment a CV lands.</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="ag-btn" onClick={() => setStep("parse")}>Back</button>
                  <button className="ag-btn ag-btn-primary" onClick={() => setStep("screening")} disabled={candidates.length === 0}>Continue to screening</button>
                </div>
              </div>
              <div className="ag-grid-2">
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Candidates ({candidates.length})</span>
                    <label className="ag-btn ag-btn-secondary" style={{ cursor: "pointer" }}>
                      Upload CV
                      <input type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { const form = new FormData(); form.append("file", f); ingest({ body: form }) } }} />
                    </label>
                  </div>
                  {candidates.length === 0 && (
                    <div className="ag-card-body">
                      <div className="ag-drop">
                        <div style={{ fontWeight: 600, fontSize: 15 }}>No candidates yet for {role.ref}.</div>
                        <p style={{ fontSize: 12.5, color: "var(--ag-ink-3)", margin: "6px 0 0" }}>{requirements.length} requirements ready. Nothing scored yet.</p>
                      </div>
                    </div>
                  )}
                  {candidates.map((c) => {
                    const s = scores[c.id]
                    return (
                      <div className="ag-row" key={c.id}>
                        <div className="ag-avatar">{initials(c.full_name)}</div>
                        <div className="ag-grow">
                          <div style={{ fontWeight: 500 }}>
                            {c.full_name}
                            {c.duplicate_of && <span className="ag-pill ag-pill-warn" style={{ marginLeft: 8 }}>Also in your pipeline</span>}
                          </div>
                          <div className="ag-meta">{c.ref} · {c.current_title || "Unknown role"}{c.years ? ` · ${c.years} yrs` : ""}{c.location ? ` · ${c.location}` : ""}</div>
                        </div>
                        {c.parse_status === "failed" ? (
                          <span className="ag-pill ag-pill-failed">Failed</span>
                        ) : s ? (
                          <div style={{ textAlign: "right" }}>
                            <span className={`ag-score ${tier(s.overall)}`}>{Math.round(s.overall)}</span>
                            <div className="ag-meta" style={{ marginTop: 4 }}>{s.must_have_hit}/{s.must_have_total} musts</div>
                          </div>
                        ) : (
                          <span className="ag-pill">Parsing</span>
                        )}
                        <button className="ag-btn" onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}>
                          Evidence →
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div className="ag-stack">
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Paste a CV</span></div>
                    <div className="ag-card-body">
                      <textarea className="ag-textarea" style={{ minHeight: 180 }} placeholder="Paste CV text for candidates who sent a document you cannot upload" value={paste} onChange={(e) => setPaste(e.target.value)} />
                      <button
                        className="ag-btn ag-btn-primary"
                        style={{ marginTop: 12 }}
                        onClick={() => { if (paste.trim().length < 100) setError("Paste at least a few paragraphs of CV text"); else ingest({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cvText: paste }) }) }}
                        disabled={busy !== null}
                      >
                        {busy === "ingest" ? <><span className="ag-spin" /> Reading the CV</> : "Add candidate"}
                      </button>
                    </div>
                  </div>
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">What happens on add</span></div>
                    <div className="ag-card-body" style={{ fontSize: 12.5, color: "var(--ag-ink-2)" }}>
                      <ol style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
                        <li>The CV is read and mapped against every requirement.</li>
                        <li>Each claim carries a verbatim quote, or shows MISSING.</li>
                        <li>The score is computed on the server, never in your browser.</li>
                        <li>The candidate is told your agency is considering them, within your notice window.</li>
                      </ol>
                      <p style={{ marginTop: 10, color: "var(--ag-ink-3)" }}>No candidate is rejected automatically.</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {role && step === "screening" && (
            <>
              <div className="ag-screen-head">
                <div>
                  <h1 className="ag-title">What did they actually say?</h1>
                  <p className="ag-sub">The CV parse is provisional. Confirm or override it from the call; the score updates as you type.</p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="ag-meta">{reviewedCount}/{candidates.length} reviewed</span>
                  <button className="ag-btn" onClick={() => setStep("candidates")}>Back</button>
                  <button className="ag-btn ag-btn-primary" onClick={() => setStep("compare")} disabled={reviewedCount === 0}>Finalize scoring</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20, alignItems: "start" }}>
                <div className="ag-stack" style={{ gap: 10 }}>
                  <div className="ag-rail-label" style={{ padding: 0 }}>Candidates</div>
                  {candidates.map((c) => {
                    const s = scores[c.id]
                    const r = reviews[c.id]
                    return (
                      <button key={c.id} className={`ag-tile${activeCandidate === c.id ? " on" : ""}`} onClick={() => setActiveCandidate(c.id)}>
                        {r?.status === "reviewed" && <span className="ag-reviewed">Call done</span>}
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{c.full_name}</div>
                        <div className="ag-meta">{c.ref}{s ? ` · ${Math.round(s.overall)}` : ""}{s?.original_overall != null && s.original_overall !== s.overall ? ` (was ${Math.round(s.original_overall)})` : ""}</div>
                      </button>
                    )
                  })}
                </div>
                {active && (
                  <div className="ag-stack">
                    <div className="ag-card">
                      <div className="ag-card-body" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div className="ag-avatar" style={{ width: 48, height: 48 }}>{initials(active.full_name)}</div>
                        <div className="ag-grow">
                          <div style={{ fontWeight: 700, fontSize: 18 }}>{active.full_name}</div>
                          <div className="ag-meta">{active.ref} · {activeScore ? `${activeScore.must_have_hit}/${activeScore.must_have_total} musts` : ""}</div>
                        </div>
                        {activeScore && (
                          <div style={{ textAlign: "right" }}>
                            <span className={`ag-score ${tier(activeScore.overall)}`}>{Math.round(activeScore.overall)}</span>
                            {activeScore.original_overall != null && activeScore.original_overall !== activeScore.overall && (
                              <div className="ag-delta">{Math.round(activeScore.original_overall)} → {Math.round(activeScore.overall)} after call</div>
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button className={`ag-btn ${activeReview?.status === "reviewed" ? "ag-btn-coral" : "ag-btn-primary"}`} onClick={() => patchReview(active.id, { status: activeReview?.status === "reviewed" ? "unreviewed" : "reviewed" })}>
                            {activeReview?.status === "reviewed" ? "Reviewed" : "Mark reviewed"}
                          </button>
                          <button className="ag-btn" onClick={() => resetCall(active.id)}>Reset call</button>
                        </div>
                      </div>
                    </div>
                    <div className="ag-grid-2" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
                      <div className="ag-card">
                        <div className="ag-card-head">
                          <span className="ag-card-title">Confirm or override the CV assessment</span>
                          <span className="ag-meta">{Object.keys(overrides[active.id] ?? {}).length} overridden</span>
                        </div>
                        {requirements.map((req) => {
                          const parsed = parsedStrength(active.id, req.id)
                          const mine = overrides[active.id]?.[req.id] ?? null
                          return (
                            <div key={req.id} style={{ padding: "10px 18px", borderTop: "1px solid var(--ag-border)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <span className="ag-meta">{req.ref}</span>
                                <span className="ag-grow" style={{ fontSize: 13 }}>{req.text}</span>
                                {mine && <span className="ag-reviewed" style={{ position: "static" }}>Your call</span>}
                                <span className="ag-pill">{req.weight}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span className="ag-meta" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                  CV <span className={`ag-dot ${parsed}`} /> {parsed}
                                </span>
                                <div className="ag-seg">
                                  {STRENGTHS.map((s) => (
                                    <button key={s} className={mine === s ? "on" : ""} onClick={() => setOverride(active.id, req.id, mine === s ? null : s)}>
                                      {s.slice(0, 4)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="ag-stack">
                        <div className="ag-card">
                          <div className="ag-card-head"><span className="ag-card-title">Soft signals</span><span className="ag-meta">Affects context fit</span></div>
                          <div className="ag-card-body ag-stack" style={{ gap: 14 }}>
                            {(["communication", "motivation"] as const).map((signal) => (
                              <div key={signal} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 12.5, width: 110, textTransform: "capitalize" }}>{signal}</span>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button key={n} className={`ag-star${(activeReview?.[signal] ?? 0) >= n ? " on" : ""}`} onClick={() => patchReview(active.id, { [signal]: activeReview?.[signal] === n ? null : n })} />
                                ))}
                              </div>
                            ))}
                            <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--ag-border)", paddingTop: 12 }}>
                              {(["availability", "salary_confirm", "notice_period"] as const).map((field) => (
                                <input key={field} className="ag-input" placeholder={field.replace("_", " ")} defaultValue={activeReview?.[field] ?? ""} onBlur={(e) => patchReview(active.id, { [field]: e.target.value })} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="ag-card">
                          <div className="ag-card-head"><span className="ag-card-title">Call notes</span><span className="ag-pill">Private</span></div>
                          <div className="ag-card-body">
                            <textarea className="ag-textarea" style={{ minHeight: 120 }} placeholder="What they said, in your words. This feeds the client narrative." defaultValue={activeReview?.notes ?? ""} onBlur={(e) => patchReview(active.id, { notes: e.target.value })} />
                            <p className="ag-meta" style={{ marginTop: 8 }}>Attached to {active.ref} · feeds submission narrative</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {role && step === "compare" && (
            <>
              <div className="ag-screen-head">
                <div>
                  <h1 className="ag-title">{candidates.length} candidates, ranked with evidence.</h1>
                  <p className="ag-sub">{decisionTotals || "No decisions yet"} · clicking an active decision clears it. Nothing is hidden, whatever the score.</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="ag-btn" onClick={() => setStep("screening")}>Back</button>
                  <button className="ag-btn ag-btn-primary" onClick={() => setStep("submission")} disabled={shortlisted === 0}>Generate submission · {shortlisted} shortlisted</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(candidates.length, 1)}, 1fr)`, gap: 14, marginBottom: 20 }}>
                {[...candidates].sort((a, b) => (scores[b.id]?.overall ?? 0) - (scores[a.id]?.overall ?? 0)).map((c, rank) => {
                  const s = scores[c.id]
                  return (
                    <div className="ag-card" key={c.id}>
                      <div className="ag-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="ag-meta">#{rank + 1}</span>
                          <div className="ag-avatar">{initials(c.full_name)}</div>
                          {reviews[c.id]?.status === "reviewed" && <span className="ag-reviewed" style={{ position: "static", marginLeft: "auto" }}>Call done</span>}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.full_name}</div>
                          <div className="ag-meta">{c.current_title || c.ref}</div>
                        </div>
                        {s && (
                          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                            <span className={`ag-score ${tier(s.overall)}`}>{Math.round(s.overall)}</span>
                            <span className="ag-meta">{s.must_have_hit}/{s.must_have_total} musts</span>
                          </div>
                        )}
                        <button className="ag-btn ag-btn-secondary" style={{ width: "100%", justifyContent: "center" }} onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}>
                          Open evidence →
                        </button>
                        <div className="ag-seg" style={{ width: "100%" }}>
                          {["shortlist", "hold", "reject"].map((d) => (
                            <button key={d} style={{ flex: 1 }} className={decisions[c.id] === d ? "on" : ""} onClick={() => decide(c.id, d)}>{d}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="ag-card" style={{ overflowX: "auto" }}>
                <table className="ag-matrix">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }} className="ag-meta">Requirement</th>
                      {candidates.map((c) => <th key={c.id} className="ag-meta">{initials(c.full_name)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map((req) => (
                      <tr key={req.id}>
                        <td className="req">
                          <span className="ag-meta">{req.ref}</span> <span style={{ fontSize: 12.5 }}>{req.text}</span>
                        </td>
                        {candidates.map((c) => {
                          const strength = effectiveStrength(c.id, req.id)
                          return (
                            <td
                              key={c.id}
                              className={strength === "strong" ? "wash" : ""}
                              style={{ cursor: "pointer" }}
                              title="Open the evidence for this candidate"
                              onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}
                            >
                              <span className={`ag-dot ${strength}`} style={{ marginRight: 6 }} />
                              <span className="ag-meta">{strength.slice(0, 4)}</span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {role && step === "submission" && (
            <>
              <div className="ag-screen-head">
                <div>
                  <h1 className="ag-title">{shortlisted > 0 ? `Ready to send to ${role.company || "the client"}.` : "Nothing shortlisted yet."}</h1>
                  <p className="ag-sub">{shortlisted > 0 ? `${shortlisted} shortlisted. Scores are recomputed on the server at the moment of generation.` : "Shortlist at least one candidate on the compare board first."}</p>
                </div>
                <button className="ag-btn" onClick={() => setStep("compare")}>Back</button>
              </div>
              {shortlisted > 0 && (
                <div className="ag-stack">
                  <div className="ag-card">
                    <div className="ag-card-head">
                      <span className="ag-card-title">Who is receiving this</span>
                      <span className="ag-meta">One link per person, individually revocable</span>
                    </div>
                    <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                      {contacts.length === 0 && (
                        <span style={{ fontSize: 12.5, color: "var(--ag-ink-3)" }}>
                          No client contacts yet. Add the hiring manager below.
                        </span>
                      )}
                      {contacts.map((contact) => (
                        <label key={contact.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={chosenContacts.includes(contact.id)}
                            onChange={(e) =>
                              setChosenContacts((prev) => (e.target.checked ? [...prev, contact.id] : prev.filter((id) => id !== contact.id)))
                            }
                          />
                          <span className="ag-grow" style={{ fontSize: 13 }}>
                            {contact.full_name || contact.email}
                            <span className="ag-meta" style={{ marginLeft: 8 }}>{contact.company}</span>
                          </span>
                        </label>
                      ))}
                      <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--ag-border)", paddingTop: 12, flexWrap: "wrap" }}>
                        <input className="ag-input" style={{ flex: 1, minWidth: 130 }} placeholder="Company" value={newContact.company} onChange={(e) => setNewContact({ ...newContact, company: e.target.value })} />
                        <input className="ag-input" style={{ flex: 1, minWidth: 130 }} placeholder="Name" value={newContact.full_name} onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })} />
                        <input className="ag-input" style={{ flex: 1, minWidth: 160 }} placeholder="Email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                        <button className="ag-btn ag-btn-secondary" onClick={createContact}>Add contact</button>
                      </div>
                    </div>
                  </div>
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Generate</span><span className="ag-meta">Same content, different container</span></div>
                    <div className="ag-card-body" style={{ display: "flex", gap: 10 }}>
                      {["document", "email", "portal"].map((format) => (
                        <button key={format} className="ag-btn ag-btn-secondary" onClick={() => generateSubmission(format)} disabled={busy !== null} style={{ textTransform: "capitalize" }}>
                          {busy === "submission" ? <span className="ag-spin" /> : null} {format}
                        </button>
                      ))}
                    </div>
                  </div>
                  {submissionResult && (
                    <div className="ag-doc">
                      <div className="ag-eyebrow">Candidate shortlist</div>
                      <h2 style={{ fontSize: 22, fontWeight: 500, margin: "6px 0 4px" }}>{role.title}</h2>
                      <div className="ag-meta">{role.ref} · prepared by your agency · {submissionResult.entries} candidate{submissionResult.entries === 1 ? "" : "s"} · {submissionResult.format}</div>
                      <p style={{ fontSize: 13, color: "var(--ag-ink-2)", marginTop: 14 }}>
                        The submission snapshot is stored and immutable: later overrides never rewrite what the client received. Your private notes on the role are not in it.
                      </p>
                      {submissionResult.links.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <div className="ag-meta" style={{ marginBottom: 6 }}>Portal links · shown once, one per recipient · copy them now</div>
                          {submissionResult.links.map((l) => (
                            <div key={l.url} className="ag-meta" style={{ color: "var(--ag-coral-deep)", wordBreak: "break-all" }}>
                              {typeof window !== "undefined" ? window.location.origin : ""}{l.url}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="ag-card">
                    <div className="ag-card-head">
                      <span className="ag-card-title">Close this role</span>
                      <span className="ag-pill">{role.status}</span>
                    </div>
                    <div className="ag-card-body">
                      <p style={{ fontSize: 12.5, color: "var(--ag-ink-2)", maxWidth: "60ch" }}>
                        Closing the role starts the retention clock on every candidate attached to it. Their CV data is erased automatically once the window passes, and the closure is audit logged. Reopening clears the clock again.
                      </p>
                      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        {role.status === "closed" ? (
                          <button className="ag-btn ag-btn-secondary" onClick={() => setRoleStatus("open")}>Reopen role</button>
                        ) : (
                          <button className="ag-btn ag-btn-primary" onClick={() => setRoleStatus("closed")}>Close role and start retention</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  )
}
