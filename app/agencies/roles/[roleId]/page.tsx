"use client"

/**
 * The role workflow: intake → parse review → candidates, live against the
 * real APIs. Screening, compare and submission ship next; their rail steps
 * render locked so the seven step shape is already true to the handoff.
 */

import { use, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type Step = "intake" | "parse" | "candidates"
const LOCKED_STEPS = ["Screening calls", "Compare", "Client submission"]

interface Requirement { id: string; ref: string; text: string; weight: "must" | "important" | "nice" }
interface Constraint { id: string; ref: string; text: string; kind: string }
interface Role { id: string; ref: string; title: string; company: string; company_context: string; salary_band: string; location: string; seniority: string; jd_raw: string; recruiter_notes: string; status: string }
interface Candidate { id: string; ref: string; full_name: string; current_title: string; years: number | null; location: string; parse_status: string; duplicate_of: string | null }
interface Score { candidate_id: string; overall: number; must_have_hit: number; must_have_total: number; original_overall: number | null }

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
  const [step, setStep] = useState<Step>("intake")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState("")

  const loadCandidates = useCallback(async () => {
    const res = await fetch(`/api/agency/roles/${roleId}/candidates`)
    if (!res.ok) return
    const body = await res.json()
    setCandidates(body.candidates ?? [])
    const map: Record<string, Score> = {}
    for (const s of body.scores ?? []) map[s.candidate_id] = s
    setScores(map)
    return (body.candidates ?? []).length as number
  }, [roleId])

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

  function patchRole(fields: Partial<Role>) {
    setRole((r) => (r ? { ...r, ...fields } : r))
  }

  async function saveIntake() {
    if (!role) return
    setBusy("save")
    await fetch(`/api/agency/roles/${roleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(role),
    })
    setBusy(null)
  }

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

  async function ingestPaste() {
    if (paste.trim().length < 100) return setError("Paste at least a few paragraphs of CV text")
    setBusy("ingest")
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvText: paste }),
      })
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

  async function ingestFile(file: File) {
    setBusy("ingest")
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`/api/agency/roles/${roleId}/candidates`, { method: "POST", body: form })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Ingestion failed")
      await loadCandidates()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const initials = (name: string) =>
    name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
  const tier = (n: number) => (n >= 80 ? "hi" : n >= 60 ? "med" : "lo")
  const steps: Array<{ key: Step; label: string }> = [
    { key: "intake", label: "Role intake" },
    { key: "parse", label: "Parse review" },
    { key: "candidates", label: "Add candidates" },
  ]

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
          {LOCKED_STEPS.map((label, i) => (
            <div key={label} className="ag-step locked">
              <span className="ag-step-num">{`0${i + 4}`}</span> {label}
            </div>
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
                  <button className="ag-btn ag-btn-primary" onClick={() => setStep("candidates")} disabled={requirements.length === 0}>
                    Continue to candidates
                  </button>
                </div>
              </div>
              <div className="ag-grid-2" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Requirements</span>
                    <span className="ag-meta">
                      {(["must", "important", "nice"] as const).map((w) => `${requirements.filter((r) => r.weight === w).length} ${w}`).join(" · ")}
                    </span>
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
                <button className="ag-btn" onClick={() => setStep("parse")}>Back</button>
              </div>
              <div className="ag-grid-2">
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Candidates ({candidates.length})</span>
                    <label className="ag-btn ag-btn-secondary" style={{ cursor: "pointer" }}>
                      Upload CV
                      <input type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) ingestFile(f) }} />
                    </label>
                  </div>
                  {candidates.length === 0 && (
                    <div className="ag-card-body">
                      <div className="ag-drop">
                        <div style={{ fontWeight: 600, fontSize: 15 }}>No candidates yet for {role.ref}.</div>
                        <p style={{ fontSize: 12.5, color: "var(--ag-ink-3)", margin: "6px 0 0" }}>
                          {requirements.length} requirements ready. Nothing scored yet.
                        </p>
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
                          <div className="ag-meta">
                            {c.ref} · {c.current_title || "Unknown role"}{c.years ? ` · ${c.years} yrs` : ""}{c.location ? ` · ${c.location}` : ""}
                          </div>
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
                      </div>
                    )
                  })}
                </div>
                <div className="ag-stack">
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Paste a CV</span></div>
                    <div className="ag-card-body">
                      <textarea className="ag-textarea" style={{ minHeight: 180 }} placeholder="Paste CV text for candidates who sent a document you cannot upload" value={paste} onChange={(e) => setPaste(e.target.value)} />
                      <button className="ag-btn ag-btn-primary" style={{ marginTop: 12 }} onClick={ingestPaste} disabled={busy !== null}>
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
        </div>
      </main>
    </>
  )
}
