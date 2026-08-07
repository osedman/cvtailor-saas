"use client"

/**
 * The role workflow, all six steps live against the real APIs:
 * intake → parse review → candidates → screening calls → compare → submission.
 * Every score on this page came from the server; the browser never computes
 * one. Overrides, decisions and submissions are audit coupled server side.
 */

import { use, useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type Step = "intake" | "parse" | "candidates" | "screening" | "compare" | "submission"

interface Requirement { id: string; ref: string; text: string; weight: "must" | "important" | "nice" }
interface Constraint { id: string; ref: string; text: string; kind: string }
interface Role { id: string; ref: string; title: string; company: string; company_context: string; salary_band: string; location: string; seniority: string; jd_raw: string; recruiter_notes: string; status: string }
interface Candidate { id: string; ref: string; full_name: string; current_title: string; years: number | null; location: string; parse_status: string; duplicate_of: string | null }
interface Score {
  candidate_id: string; overall: number; must_have_hit: number; must_have_total: number
  original_overall: number | null; confidence_level: number; effective: Record<string, string>
  // Category sub-scores, 0-100 pre-weight — the API has always sent them
  // (select *), the compare cards just never drew them.
  requirement_coverage: number; evidence_strength: number
  seniority_calibration: number; context_fit: number; confidence_completeness: number
}

/**
 * Probe questions.
 *
 * Two sources, no model call and no new table. Gap questions are derived
 * from the role's own requirements wherever the CV did not evidence one
 * outright, which is exactly the thing a screening call is for. Library
 * questions are the standard recruiter probes that apply to any role.
 *
 * Answers live in the `call_answers` jsonb that has been on
 * candidate_reviews since the scoring migration and had no UI. Keys are the
 * question id (requirement ref like R02, or a library id like L03) and the
 * API caps them at 10 characters, so ids stay short by design. A selected
 * but unanswered question is stored as an empty string, which is how the
 * card knows it was picked.
 */
interface Probe { id: string; text: string; why: string; source: "gap" | "library" }

/** The immutable submission snapshot, exactly as the portal reads it. */
interface SnapshotEntry {
  ref: string; full_name: string; current_title: string | null; years: number | null
  location: string | null; redacted?: boolean
  overall: number; original_overall: number | null
  must_have_hit: number; must_have_total: number; confidence_level: number; reviewed: boolean
  narrative: string
  strengths: Array<{ requirement: string; quote: string | null }>
  gaps: Array<{ requirement: string; weight: string }>
}
interface Snapshot {
  generated_at: string
  role: { ref: string; title: string; company: string; location: string; salary_band: string }
  shortlisted: SnapshotEntry[]
  not_submitted_count: number
}

const PROBE_LIBRARY: Array<{ id: string; text: string; why: string }> = [
  { id: "L01", text: "How much hands-on delivery versus management are they looking for next?", why: "Seniority calibration" },
  { id: "L02", text: "What does the next step in their career actually look like to them?", why: "Motivation" },
  { id: "L03", text: "Why are they open to moving right now?", why: "Motivation" },
  { id: "L04", text: "What would have to be true for them to turn this down?", why: "Motivation" },
  { id: "L05", text: "Is the notice period negotiable, and does garden leave overlap?", why: "Logistics" },
  { id: "L06", text: "Where are they in any other processes?", why: "Logistics" },
  { id: "L07", text: "How firm is the salary expectation, and what sits behind the number?", why: "Logistics" },
  { id: "L08", text: "What does their week look like on site versus at home?", why: "Ways of working" },
  { id: "L09", text: "Walk me through the hardest problem they owned end to end.", why: "Depth" },
  { id: "L10", text: "What did they inherit versus what did they build?", why: "Depth" },
  { id: "L11", text: "How do they handle disagreement with a stakeholder who outranks them?", why: "Ways of working" },
  { id: "L12", text: "Which part of this role would stretch them most?", why: "Self awareness" },
]

// Weighted category rows for the compare cards, handoff order.
const FIT_ROWS: Array<{ key: keyof Score; label: string; weight: number }> = [
  { key: "requirement_coverage", label: "Requirement coverage", weight: 45 },
  { key: "evidence_strength", label: "Evidence strength", weight: 25 },
  { key: "seniority_calibration", label: "Seniority calibration", weight: 10 },
  { key: "context_fit", label: "Context fit", weight: 10 },
  { key: "confidence_completeness", label: "Confidence / completeness", weight: 10 },
]
interface Review { candidate_id: string; status: string; communication: number | null; motivation: number | null; availability: string; salary_confirm: string; notice_period: string; notes: string; call_answers?: Record<string, string> }
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
  const [jdUrl, setJdUrl] = useState("")
  const [extractResult, setExtractResult] = useState<{ requirements: number; constraints: number; filled: string[] } | null>(null)
  const [submissionResult, setSubmissionResult] = useState<{ format: string; entries: number; links: Array<{ url: string }>; snapshot: Snapshot | null } | null>(null)
  const [contacts, setContacts] = useState<Array<{ id: string; company: string; email: string; full_name: string }>>([])
  const [chosenContacts, setChosenContacts] = useState<string[]>([])
  const [newContact, setNewContact] = useState({ company: "", email: "", full_name: "" })
  const [probePicker, setProbePicker] = useState(false)
  const [previewFormat, setPreviewFormat] = useState<"document" | "email" | "portal">("document")

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
      // The dashboard deep links into a specific step (?step=screening).
      // Read it off the URL rather than useSearchParams so this page needs
      // no Suspense boundary. An unknown value falls back to the auto pick.
      const asked = new URLSearchParams(window.location.search).get("step")
      const valid: Step[] = ["intake", "parse", "candidates", "screening", "compare", "submission"]
      if (asked && (valid as string[]).includes(asked)) setStep(asked as Step)
      else setStep(count > 0 ? "candidates" : (body.requirements ?? []).length > 0 ? "parse" : "intake")
    })()
  }, [roleId, router, loadCandidates])

  // Review detail is fetched once per candidate, not once per click. This
  // effect re-runs whenever activeCandidate changes (it sets it), so the old
  // unconditional loop fired one request per candidate on every switch: eight
  // candidates meant eight requests each time the recruiter changed tile.
  const loadedDetail = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (step !== "screening" || candidates.length === 0) return
    if (!activeCandidate) setActiveCandidate(candidates[0].id)
    for (const c of candidates) {
      if (loadedDetail.current.has(c.id)) continue
      loadedDetail.current.add(c.id)
      loadReviewDetail(c.id)
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

  async function extract(payload?: { file?: File; url?: string }) {
    if (!role) return
    setBusy("extract")
    setError(null)
    try {
      await saveIntake()
      let init: RequestInit = { method: "POST" }
      if (payload?.file) {
        const form = new FormData()
        form.append("file", payload.file)
        init = { method: "POST", body: form }
      } else if (payload?.url) {
        init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: payload.url }) }
      }
      const res = await fetch(`/api/agency/roles/${roleId}/parse`, init)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Extraction failed")
      setRequirements(body.requirements ?? [])
      setConstraints((body.constraints ?? []).map((c: Constraint, i: number) => ({ ...c, id: c.id ?? String(i), ref: c.ref ?? `C0${i + 1}` })))
      if (body.role) setRole(body.role)
      // Stay on intake: the recruiter reviews what was extracted here, then
      // moves to parse review deliberately.
      setExtractResult({
        requirements: (body.requirements ?? []).length,
        constraints: (body.constraints ?? []).length,
        filled: body.filled ?? [],
      })
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

  /**
   * Review edits paint immediately, then persist.
   *
   * This used to await three sequential round trips before the star or the
   * strength button changed colour: the PATCH, a review refetch, then a full
   * candidate-list refetch. On a call that reads as a broken control, so the
   * recruiter clicks again and toggles their own answer back off. Now the
   * local state moves first and the server is the reconciler: the PATCH
   * response already carries the recomputed score, which is the only thing
   * we could not have known locally. A failure re-reads the truth and says so
   * rather than leaving the UI showing an edit that never landed.
   */
  async function patchReview(candidateId: string, patch: Record<string, unknown>, optimistic?: Partial<Review>) {
    const rollback = reviews[candidateId]
    if (optimistic) {
      setReviews((prev) => {
        const base: Review = prev[candidateId] ?? {
          candidate_id: candidateId, status: "unreviewed",
          communication: null, motivation: null,
          availability: "", salary_confirm: "", notice_period: "", notes: "",
        }
        return { ...prev, [candidateId]: { ...base, ...optimistic } }
      })
    }
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(res.status === 403 ? "You have view-only access to this agency." : "That change did not save.")
      const body = await res.json()
      if (body.score) {
        setScores((prev) => ({ ...prev, [candidateId]: { ...prev[candidateId], ...body.score, candidate_id: candidateId } }))
      }
      if (!optimistic) await loadReviewDetail(candidateId)
      setError(null)
    } catch (e) {
      if (optimistic) {
        setReviews((prev) => {
          const next = { ...prev }
          if (rollback) next[candidateId] = rollback
          else delete next[candidateId]
          return next
        })
      }
      await loadReviewDetail(candidateId)
      setError(e instanceof Error ? e.message : "That change did not save.")
    }
  }

  async function setOverride(candidateId: string, requirementId: string, strength: Strength | null) {
    const rollback = overrides[candidateId] ?? {}
    setOverrides((prev) => {
      const mine = { ...(prev[candidateId] ?? {}) }
      if (strength === null) delete mine[requirementId]
      else mine[requirementId] = strength
      return { ...prev, [candidateId]: mine }
    })
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: { [requirementId]: strength } }),
      })
      if (!res.ok) throw new Error(res.status === 403 ? "You have view-only access to this agency." : "That override did not save.")
      const body = await res.json()
      if (body.score) {
        setScores((prev) => ({ ...prev, [candidateId]: { ...prev[candidateId], ...body.score, candidate_id: candidateId } }))
      }
      setError(null)
    } catch (e) {
      // An override that never persisted must not keep showing as "Your call".
      setOverrides((prev) => ({ ...prev, [candidateId]: rollback }))
      setError(e instanceof Error ? e.message : "That override did not save.")
    }
  }

  async function resetCall(candidateId: string) {
    // Destructive, and the button lives one click away from "Reviewed":
    // wiping soft signals, notes and every override deserves a breath first.
    if (!window.confirm("Reset this call? Soft signals, notes and every override go, and the score returns to the CV parse. The audit log keeps the history.")) return
    const res = await fetch(`/api/agency/candidates/${candidateId}/review`, { method: "DELETE" })
    if (res.ok) {
      setOverrides((prev) => ({ ...prev, [candidateId]: {} }))
      setReviews((prev) => {
        const nextMap = { ...prev }
        delete nextMap[candidateId]
        return nextMap
      })
      await loadCandidates()
    } else {
      setError("The reset did not go through.")
    }
  }

  async function decide(candidateId: string, decision: string | null) {
    const rollback = decisions[candidateId] ?? null
    const next = decisions[candidateId] === decision ? null : decision
    setDecisions((prev) => ({ ...prev, [candidateId]: next }))
    try {
      const res = await fetch(`/api/agency/candidates/${candidateId}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: next }),
      })
      if (!res.ok) throw new Error(res.status === 403 ? "You have view-only access to this agency." : "That decision did not save.")
    } catch (e) {
      // A decision that never persisted must not stay lit — a recruiter would
      // shortlist on the strength of it.
      setDecisions((prev) => ({ ...prev, [candidateId]: rollback }))
      setError(e instanceof Error ? e.message : "That decision did not save.")
    }
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
      setSubmissionResult({
        format,
        entries: body.submission?.snapshot?.shortlisted?.length ?? 0,
        links: body.links ?? [],
        // The whole immutable snapshot, so the preview renders exactly what
        // the client will get rather than a re-derivation of it.
        snapshot: body.submission?.snapshot ?? null,
      })
      setPreviewFormat(format as "document" | "email" | "portal")
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

  // Every probe this candidate could be asked: their own unmet requirements
  // first (weighted ones only, the nice-to-haves are not worth call time),
  // then the standard library.
  const activeAnswers: Record<string, string> = activeReview?.call_answers ?? {}
  const probeCatalogue: Probe[] = active
    ? [
        ...requirements
          .filter((req) => {
            if (req.weight === "nice") return false
            const s = effectiveStrength(active.id, req.id)
            return s === "missing" || s === "partial" || s === "transferable"
          })
          .map((req) => ({
            id: req.ref,
            text: `On ${req.text.toLowerCase()}: what have they actually done here?`,
            why: `${req.ref} reads ${effectiveStrength(active.id, req.id)} from the CV`,
            source: "gap" as const,
          })),
        ...PROBE_LIBRARY.map((q) => ({ ...q, source: "library" as const })),
      ]
    : []
  const chosenProbes = probeCatalogue.filter((q) => q.id in activeAnswers)
  const answeredProbes = chosenProbes.filter((q) => (activeAnswers[q.id] ?? "").trim().length > 0).length
  const suggestedProbes = probeCatalogue.filter((q) => !(q.id in activeAnswers))

  function setProbe(candidateId: string, id: string, value: string | null) {
    const current = reviews[candidateId]?.call_answers ?? {}
    const next = { ...current }
    if (value === null) delete next[id]
    else next[id] = value
    patchReview(candidateId, { call_answers: next }, { call_answers: next })
  }

  // Handoff chrome: which steps are behind you (checkmark in the rail),
  // where you are (breadcrumb + eyebrow), and Back / Next at the top.
  const stepIndex = steps.findIndex((s) => s.key === step)
  const stepDone: Record<Step, boolean> = {
    intake: requirements.length > 0,
    parse: candidates.length > 0,
    candidates: candidates.length > 0,
    screening: candidates.length > 0 && reviewedCount === candidates.length && reviewedCount > 0,
    compare: candidates.length > 0 && candidates.every((c) => decisions[c.id]),
    submission: role?.status === "submitted" || submissionResult !== null,
  }

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
              <span className={`ag-step-num${stepDone[s.key] && step !== s.key ? " done" : ""}`}>
                {stepDone[s.key] && step !== s.key ? "✓" : `0${i + 1}`}
              </span>{" "}
              {s.label}
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
          {role && (
            <div className="ag-crumbbar">
              <span className="ag-crumb">
                <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Roles</button>
                {" / "}
                <b>{role.company ? `${role.company} — ${role.title}` : role.title}</b>
                {" / "}
                {`0${stepIndex + 1}. ${steps[stepIndex]?.label ?? ""}`}
              </span>
              <span className="ag-grow" />
              <button
                className="ag-btn ag-btn-secondary"
                disabled={stepIndex <= 0}
                onClick={() => setStep(steps[stepIndex - 1].key)}
              >
                ← Back
              </button>
              <button
                className="ag-btn ag-btn-secondary"
                disabled={stepIndex >= steps.length - 1}
                onClick={() => setStep(steps[stepIndex + 1].key)}
              >
                Next →
              </button>
            </div>
          )}
          {role && (
            <p className="ag-step-eyebrow">Step 0{stepIndex + 1} · {steps[stepIndex]?.label}</p>
          )}
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
                <div style={{ display: "flex", gap: 10 }}>
                  {requirements.length > 0 ? (
                    <>
                      <button className="ag-btn ag-btn-secondary" onClick={() => extract()} disabled={busy !== null || !role.jd_raw.trim()}>
                        {busy === "extract" ? <><span className="ag-spin" /> Extracting</> : "Extract again"}
                      </button>
                      <button className="ag-btn ag-btn-primary" onClick={() => setStep("parse")} disabled={busy !== null}>
                        Continue to parse review
                      </button>
                    </>
                  ) : (
                    <button className="ag-btn ag-btn-primary" onClick={() => extract()} disabled={busy !== null || !role.jd_raw.trim()}>
                      {busy === "extract" ? <><span className="ag-spin" /> Extracting requirements</> : "Extract requirements"}
                    </button>
                  )}
                </div>
              </div>
              {extractResult && (
                <div className="ag-banner" style={{ marginBottom: 20 }}>
                  <div className="ag-grow">
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>
                      {extractResult.requirements} requirements and {extractResult.constraints} constraints extracted.
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--ag-ink-2)" }}>
                      {extractResult.filled.length > 0
                        ? `Filled from the JD: ${extractResult.filled.map((f) => f.replace(/_/g, " ")).join(", ")}. Your typed fields and notes were left alone.`
                        : "Every intake field already had your own text, so nothing was overwritten."}
                      {" "}Check the fields, then continue to parse review to adjust weights.
                    </div>
                  </div>
                  <button className="ag-btn ag-btn-coral" onClick={() => setStep("parse")}>Continue</button>
                </div>
              )}
              <div className="ag-grid-2">
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Job description</span>
                    <label className="ag-btn ag-btn-secondary" style={{ cursor: "pointer" }}>
                      Upload the JD
                      <input type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) extract({ file: f }) }} />
                    </label>
                  </div>
                  <div className="ag-card-body">
                    <textarea className="ag-textarea jd" placeholder="Paste the client's job description here" value={role.jd_raw} onChange={(e) => patchRole({ jd_raw: e.target.value })} onBlur={saveIntake} />
                    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                      <input className="ag-input" placeholder="Or a link to the posting" value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} />
                      <button className="ag-btn ag-btn-secondary" onClick={() => jdUrl.trim() && extract({ url: jdUrl.trim() })} disabled={busy !== null || !jdUrl.trim()}>
                        Fetch and extract
                      </button>
                    </div>
                    <p style={{ fontSize: 11.5, color: "var(--ag-ink-4)", marginTop: 8 }}>
                      Extraction fills any empty fields on the right from the JD. It never overwrites what you typed, and never touches your notes.
                    </p>
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
                  <h1 className="ag-title">Here&apos;s what we extracted.<br />Tune it before we score.</h1>
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
                          <div className="ag-callscore">
                            {activeScore.original_overall != null && Math.round(activeScore.original_overall) !== Math.round(activeScore.overall) ? (
                              <>
                                <div className="ag-callscore-pair">
                                  <span className="ag-callscore-col">
                                    <span className="ag-field-label" style={{ color: "var(--ag-ink-3)" }}>CV score</span>
                                    <span className="ag-callscore-was mono">{Math.round(activeScore.original_overall)}</span>
                                  </span>
                                  <span className="ag-callscore-arrow">→</span>
                                  <span className="ag-callscore-col">
                                    <span className="ag-field-label">Post-call</span>
                                    <span className={`ag-score ${tier(activeScore.overall)}`}>{Math.round(activeScore.overall)}</span>
                                  </span>
                                </div>
                                <span className="ag-delta-pill">
                                  {Math.round(activeScore.original_overall)} → {Math.round(activeScore.overall)}{" "}
                                  {Math.round(activeScore.overall - activeScore.original_overall) > 0 ? "+" : ""}
                                  {Math.round(activeScore.overall - activeScore.original_overall)}
                                </span>
                              </>
                            ) : (
                              <span className={`ag-score ${tier(activeScore.overall)}`}>{Math.round(activeScore.overall)}</span>
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button
                            className={`ag-btn ${activeReview?.status === "reviewed" ? "ag-btn-coral" : "ag-btn-primary"}`}
                            onClick={() => {
                              const next = activeReview?.status === "reviewed" ? "unreviewed" : "reviewed"
                              patchReview(active.id, { status: next }, { status: next })
                            }}
                          >
                            {activeReview?.status === "reviewed" ? "Reviewed" : "Mark reviewed"}
                          </button>
                          <button className="ag-btn" onClick={() => resetCall(active.id)}>Reset call</button>
                        </div>
                      </div>
                      {activeScore && (
                        <div className="ag-conf-strip">
                          <span className="ag-field-label">Must-have coverage</span>
                          <b className="ag-conf-val">{activeScore.must_have_hit}/{activeScore.must_have_total}</b>
                          <span className="ag-field-label" style={{ marginLeft: 18 }}>Confidence</span>
                          <span className="ag-conf-bars" aria-label={`Confidence level ${activeScore.confidence_level} of 4`}>
                            {[1, 2, 3, 4].map((n) => (
                              <span key={n} className="ag-conf-bar" data-on={n <= activeScore.confidence_level} style={{ height: 4 + n * 3 }} />
                            ))}
                          </span>
                          {activeReview?.status === "reviewed" && (
                            <span className="ag-conf-note">↑ raised by call</span>
                          )}
                        </div>
                      )}
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
                        <div className="ag-script">
                          <div className="ag-script-head">
                            <span className="ag-script-title">Call script · probe questions</span>
                            <span className="ag-script-count">{answeredProbes}/{chosenProbes.length} answered</span>
                          </div>
                          <div className="ag-script-body">
                            {chosenProbes.length === 0 && (
                              <p className="ag-script-empty">
                                No questions picked yet. Tailr suggests the ones your requirements leave open; add any of them or a standard probe below.
                              </p>
                            )}
                            {chosenProbes.map((q) => (
                              <div className="ag-script-q" key={q.id}>
                                <div className="ag-script-qhead">
                                  <span className="ag-script-qid">{q.id}</span>
                                  <span className="ag-script-qtext">{q.text}</span>
                                  <button
                                    className="ag-script-drop"
                                    title="Remove this question"
                                    aria-label={`Remove question ${q.id}`}
                                    onClick={() => setProbe(active.id, q.id, null)}
                                  >
                                    ×
                                  </button>
                                </div>
                                <textarea
                                  key={`${active.id}:${q.id}`}
                                  className="ag-script-answer"
                                  placeholder="What they said"
                                  defaultValue={activeAnswers[q.id] ?? ""}
                                  onBlur={(e) => {
                                    if (e.target.value === (activeAnswers[q.id] ?? "")) return
                                    setProbe(active.id, q.id, e.target.value)
                                  }}
                                />
                              </div>
                            ))}
                            <button className="ag-script-add" onClick={() => setProbePicker((v) => !v)}>
                              {probePicker ? "Close" : "+ Add a question"}
                            </button>
                            {probePicker && (
                              <div className="ag-script-picker">
                                {suggestedProbes.length === 0 && (
                                  <p className="ag-script-empty">Every question is already on the script.</p>
                                )}
                                {suggestedProbes.some((q) => q.source === "gap") && (
                                  <p className="ag-script-group">From this candidate&apos;s open requirements</p>
                                )}
                                {suggestedProbes.filter((q) => q.source === "gap").map((q) => (
                                  <button className="ag-script-opt" key={q.id} onClick={() => setProbe(active.id, q.id, "")}>
                                    <span className="ag-script-qid">{q.id}</span>
                                    <span className="ag-grow">{q.text}</span>
                                    <span className="ag-script-why">{q.why}</span>
                                  </button>
                                ))}
                                {suggestedProbes.some((q) => q.source === "library") && (
                                  <p className="ag-script-group">Standard probes</p>
                                )}
                                {suggestedProbes.filter((q) => q.source === "library").map((q) => (
                                  <button className="ag-script-opt" key={q.id} onClick={() => setProbe(active.id, q.id, "")}>
                                    <span className="ag-script-qid">{q.id}</span>
                                    <span className="ag-grow">{q.text}</span>
                                    <span className="ag-script-why">{q.why}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="ag-card">
                          <div className="ag-card-head"><span className="ag-card-title">Soft signals</span><span className="ag-meta">Affects context fit</span></div>
                          <div className="ag-card-body ag-stack" style={{ gap: 14 }}>
                            {(["communication", "motivation"] as const).map((signal) => (
                              <div key={signal} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 12.5, width: 110, textTransform: "capitalize" }}>{signal}</span>
                                {[1, 2, 3, 4, 5].map((n) => {
                                  const next = activeReview?.[signal] === n ? null : n
                                  return (
                                    <button
                                      key={n}
                                      type="button"
                                      aria-label={`${signal} ${n} of 5`}
                                      aria-pressed={(activeReview?.[signal] ?? 0) >= n}
                                      className={`ag-star${(activeReview?.[signal] ?? 0) >= n ? " on" : ""}`}
                                      onClick={() => patchReview(active.id, { [signal]: next }, { [signal]: next })}
                                    />
                                  )
                                })}
                              </div>
                            ))}
                            <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--ag-border)", paddingTop: 12 }}>
                              {([
                                ["availability", "Availability", "Available in 8 weeks"],
                                ["salary_confirm", "Salary confirmation", "Flex to £125k confirmed"],
                                ["notice_period", "Notice period", "Can negotiate to 8 wks (from 12)"],
                              ] as const).map(([field, label, hint]) => (
                                /* Keyed by candidate: an uncontrolled input keeps the
                                   previous candidate's text when you switch, and the
                                   next blur would write it onto the wrong review. */
                                <div key={`${active.id}:${field}`}>
                                  <span className="ag-field-label">{label}</span>
                                  <input
                                    className="ag-input"
                                    placeholder={hint}
                                    defaultValue={activeReview?.[field] ?? ""}
                                    onBlur={(e) => {
                                      if (e.target.value === (activeReview?.[field] ?? "")) return
                                      patchReview(active.id, { [field]: e.target.value }, { [field]: e.target.value })
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="ag-card">
                          <div className="ag-card-head"><span className="ag-card-title">Call notes</span><span className="ag-pill">Private</span></div>
                          <div className="ag-card-body">
                            <textarea
                              key={`${active.id}:notes`}
                              className="ag-textarea"
                              style={{ minHeight: 120 }}
                              placeholder="What they said, in your words. This feeds the client narrative."
                              defaultValue={activeReview?.notes ?? ""}
                              onBlur={(e) => {
                                if (e.target.value === (activeReview?.notes ?? "")) return
                                patchReview(active.id, { notes: e.target.value }, { notes: e.target.value })
                              }}
                            />
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
              <div className="ag-legend">
                <span className="ag-field-label" style={{ marginRight: 4 }}>Legend</span>
                <span><span className="ag-dot strong" /> Strong evidence — 1.0</span>
                <span><span className="ag-dot transferable" /> Transferable — 0.7</span>
                <span><span className="ag-dot partial" /> Partial — 0.4</span>
                <span><span className="ag-dot missing" /> Missing — 0.0</span>
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
                        {s && s.original_overall != null && Math.round(s.original_overall) !== Math.round(s.overall) && (
                          <span className="ag-delta-pill">
                            {Math.round(s.original_overall)} → {Math.round(s.overall)}{" "}
                            {Math.round(s.overall - s.original_overall) > 0 ? "+" : ""}{Math.round(s.overall - s.original_overall)}
                          </span>
                        )}
                        {s && (
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                            <span className="ag-field-label" style={{ color: "var(--ag-ink-3)" }}>Overall fit</span>
                            <span className={`ag-score ${tier(s.overall)}`}>{Math.round(s.overall)}</span>
                          </div>
                        )}
                        {s && (
                          <div className="ag-fit-rows">
                            {FIT_ROWS.map((row) => {
                              const v = Math.round(Number(s[row.key] ?? 0))
                              return (
                                <div key={row.key} className="ag-fit-row">
                                  <span className="ag-fit-label">{row.label}</span>
                                  <span className="ag-fit-num">{row.weight}% · <b>{v}</b></span>
                                  <div className="ag-bar"><div className="ag-bar-fill" style={{ width: `${v}%` }} /></div>
                                </div>
                              )
                            })}
                            <div className="ag-fit-row" style={{ borderTop: "1px solid var(--ag-border)", paddingTop: 8 }}>
                              <span className="ag-fit-label">Must-have coverage</span>
                              <span className="ag-fit-num"><b>{s.must_have_hit}/{s.must_have_total}</b></span>
                            </div>
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
              <div className="ag-card">
                <div className="ag-card-head">
                  <span className="ag-card-title">Requirement &times; candidate matrix</span>
                  <span className="ag-meta">Click any cell for evidence</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="ag-matrix">
                    <thead>
                      <tr>
                        <th className="req">Requirement</th>
                        {candidates.map((c) => (
                          <th key={c.id} title={c.full_name}>{initials(c.full_name)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {requirements.map((req) => (
                        <tr key={req.id}>
                          <td className="req">
                            <span className="ag-matrix-ref">{req.ref}</span>
                            <span>
                              <span className="ag-matrix-text">{req.text}</span>
                              <span className="ag-matrix-weight">{req.weight}</span>
                            </span>
                          </td>
                          {candidates.map((c) => {
                            const strength = effectiveStrength(c.id, req.id)
                            return (
                              <td
                                key={c.id}
                                className={strength === "strong" ? "wash" : strength === "missing" ? "faded" : ""}
                                title={`${c.full_name} · ${req.ref} reads ${strength}. Open the evidence.`}
                                onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}
                              >
                                <span className={`ag-dot ${strength}`} />
                                <span className="ag-matrix-cell-label">{strength.slice(0, 4)}</span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="ag-decisions-bar">
                <span className="ag-field-label">Decisions</span>
                <span className="ag-decisions-tally">
                  {decisionTotals || "none yet"} · <b>{candidates.filter((c) => !decisions[c.id]).length} undecided</b>
                </span>
                <span className="ag-grow" />
                <button className="ag-btn ag-btn-primary" onClick={() => setStep("submission")} disabled={shortlisted === 0}>
                  Continue to submission
                </button>
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
                  {submissionResult?.snapshot && (
                    <div className="ag-card">
                      <div className="ag-card-head">
                        <div className="ag-seg">
                          {(["document", "email", "portal"] as const).map((f) => (
                            <button key={f} className={previewFormat === f ? "on" : ""} onClick={() => setPreviewFormat(f)} style={{ textTransform: "capitalize" }}>
                              {f === "portal" ? "Portal link" : f}
                            </button>
                          ))}
                        </div>
                        <span className="ag-meta">
                          Generated as {submissionResult.format} · same snapshot, different container
                        </span>
                      </div>
                      <div className="ag-card-body" style={{ background: "var(--ag-bg-2)" }}>
                        {previewFormat === "document" && (
                          <div className="ag-doc">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
                              <div>
                                <div className="ag-field-label">Candidate shortlist</div>
                                <h2 style={{ fontFamily: "var(--ag-display)", fontSize: 22, fontWeight: 600, margin: "4px 0" }}>{submissionResult.snapshot.role.title}</h2>
                                <div className="ag-meta">
                                  {submissionResult.snapshot.role.company}
                                  {submissionResult.snapshot.role.location ? ` · ${submissionResult.snapshot.role.location}` : ""}
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div className="ag-field-label">Prepared by</div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>Your agency</div>
                                <div className="ag-meta">
                                  {submissionResult.snapshot.role.ref} · {new Date(submissionResult.snapshot.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </div>
                              </div>
                            </div>
                            <hr style={{ border: "none", borderTop: "2px solid var(--ag-ink)", margin: "18px 0" }} />
                            <div className="ag-field-label">Summary</div>
                            <p style={{ fontSize: 13.5, color: "var(--ag-ink-2)", maxWidth: "64ch" }}>
                              We reviewed {submissionResult.snapshot.shortlisted.length + submissionResult.snapshot.not_submitted_count} candidates against your requirements and are putting <b>{submissionResult.snapshot.shortlisted.length}</b> forward. Every line below traces to CV evidence or to what the candidate said on a call. Known gaps are stated, not hidden.
                            </p>
                            {submissionResult.snapshot.shortlisted.map((entry, i) => (
                              <div key={entry.ref} style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--ag-border)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                                  <div>
                                    <div className="ag-field-label">Candidate {String(i + 1).padStart(2, "0")} of {String(submissionResult.snapshot!.shortlisted.length).padStart(2, "0")}</div>
                                    <div style={{ fontFamily: "var(--ag-display)", fontSize: 18, fontWeight: 600 }}>{entry.full_name}</div>
                                    <div className="ag-meta">
                                      {[entry.current_title, entry.years ? `${entry.years} years` : "", entry.location].filter(Boolean).join(" · ")}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <span className={`ag-score ${tier(entry.overall)}`}>{Math.round(entry.overall)}</span>
                                    <div className="ag-meta" style={{ marginTop: 4 }}>
                                      {entry.must_have_hit}/{entry.must_have_total} musts{entry.reviewed ? " · call done" : ""}
                                    </div>
                                  </div>
                                </div>
                                {entry.narrative && (
                                  <>
                                    <div className="ag-field-label" style={{ marginTop: 12 }}>Why this candidate</div>
                                    <p style={{ fontSize: 13, color: "var(--ag-ink-2)", maxWidth: "64ch", margin: 0 }}>{entry.narrative}</p>
                                  </>
                                )}
                                <div className="ag-grid-2" style={{ gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 12 }}>
                                  <div>
                                    <div className="ag-field-label">Strengths</div>
                                    {entry.strengths.length === 0 && <span className="ag-meta">None recorded</span>}
                                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "var(--ag-ink-2)" }}>
                                      {entry.strengths.map((s, j) => (
                                        <li key={j} style={{ marginBottom: 4 }}>
                                          {s.requirement}
                                          {s.quote && <div className="ag-quote" style={{ marginTop: 4 }}>&ldquo;{s.quote}&rdquo;</div>}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <div className="ag-field-label" style={{ color: "var(--ag-warn)" }}>Known gaps</div>
                                    {entry.gaps.length === 0 && <span className="ag-meta">No unmet requirements</span>}
                                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "var(--ag-ink-2)" }}>
                                      {entry.gaps.map((g, j) => (
                                        <li key={j} style={{ marginBottom: 4 }}>{g.requirement} <span className="ag-meta">({g.weight})</span></li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            ))}
                            <p className="ag-meta" style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--ag-border)" }}>
                              Powered by Tailr · evidence first matching · {submissionResult.snapshot.not_submitted_count} candidate{submissionResult.snapshot.not_submitted_count === 1 ? "" : "s"} reviewed and not put forward
                            </p>
                          </div>
                        )}

                        {previewFormat === "email" && (
                          <div className="ag-doc" style={{ maxWidth: 720 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "6px 12px", fontSize: 12.5, paddingBottom: 14, borderBottom: "1px solid var(--ag-border)" }}>
                              <span className="ag-meta">To</span>
                              <span>{chosenContacts.length > 0 ? contacts.filter((c) => chosenContacts.includes(c.id)).map((c) => c.email).join(", ") : "the hiring contact"}</span>
                              <span className="ag-meta">Subject</span>
                              <b>Shortlist: {submissionResult.snapshot.role.title} · {submissionResult.snapshot.shortlisted.length} candidate{submissionResult.snapshot.shortlisted.length === 1 ? "" : "s"}</b>
                            </div>
                            <div style={{ fontSize: 13, color: "var(--ag-ink-2)", marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                              <p style={{ margin: 0 }}>Hi,</p>
                              <p style={{ margin: 0 }}>
                                Following your brief on the {submissionResult.snapshot.role.title} role, here is our shortlist of <b>{submissionResult.snapshot.shortlisted.length}</b> candidate{submissionResult.snapshot.shortlisted.length === 1 ? "" : "s"}. Every claim is backed by CV evidence or by what they told us on a screening call.
                              </p>
                              {submissionResult.snapshot.shortlisted.map((entry, i) => (
                                <div key={entry.ref} style={{ paddingLeft: 12, borderLeft: "2px solid var(--ag-tint-2)" }}>
                                  <p style={{ margin: 0 }}>
                                    <b>{i + 1}. {entry.full_name}</b>
                                    {entry.current_title ? ` · ${entry.current_title}` : ""}
                                    <span className="ag-meta" style={{ marginLeft: 8 }}>fit {Math.round(entry.overall)} · {entry.must_have_hit}/{entry.must_have_total} musts</span>
                                  </p>
                                  {entry.narrative && <p style={{ margin: "4px 0 0" }}>{entry.narrative}</p>}
                                  {entry.strengths.length > 0 && (
                                    <p style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                                      <span className="ag-meta">Strengths</span> {entry.strengths.map((s) => s.requirement).join("; ")}
                                    </p>
                                  )}
                                  {entry.gaps.length > 0 && (
                                    <p style={{ margin: "2px 0 0", fontSize: 12.5 }}>
                                      <span className="ag-meta" style={{ color: "var(--ag-warn)" }}>Gaps</span> {entry.gaps.map((g) => g.requirement).join("; ")}
                                    </p>
                                  )}
                                </div>
                              ))}
                              <p style={{ margin: 0 }}>Happy to walk through the ranking or set up first conversations.</p>
                              <p style={{ margin: 0 }}>Best,<br />Your agency</p>
                            </div>
                            <button
                              className="ag-btn ag-btn-secondary"
                              style={{ marginTop: 16 }}
                              onClick={() => {
                                const s = submissionResult.snapshot!
                                const text = [
                                  `Shortlist: ${s.role.title} · ${s.shortlisted.length} candidates`,
                                  "",
                                  "Hi,",
                                  "",
                                  `Following your brief on the ${s.role.title} role, here is our shortlist of ${s.shortlisted.length} candidate${s.shortlisted.length === 1 ? "" : "s"}. Every claim is backed by CV evidence or by what they told us on a screening call.`,
                                  "",
                                  ...s.shortlisted.flatMap((e, i) => [
                                    `${i + 1}. ${e.full_name}${e.current_title ? ` · ${e.current_title}` : ""} (fit ${Math.round(e.overall)}, ${e.must_have_hit}/${e.must_have_total} musts)`,
                                    e.narrative ? `   ${e.narrative}` : "",
                                    e.strengths.length ? `   Strengths: ${e.strengths.map((x) => x.requirement).join("; ")}` : "",
                                    e.gaps.length ? `   Gaps: ${e.gaps.map((x) => x.requirement).join("; ")}` : "",
                                    "",
                                  ]),
                                  "Happy to walk through the ranking or set up first conversations.",
                                  "",
                                  "Best,",
                                  "Your agency",
                                ].filter((l) => l !== "").join("\n")
                                navigator.clipboard?.writeText(text)
                                setError(null)
                              }}
                            >
                              Copy email text
                            </button>
                          </div>
                        )}

                        {previewFormat === "portal" && (
                          <div className="ag-doc" style={{ maxWidth: 720 }}>
                            <div className="ag-field-label">Client portal</div>
                            <p style={{ fontSize: 13, color: "var(--ag-ink-2)", maxWidth: "60ch" }}>
                              Each recipient gets their own link. Opens are recorded, every link is revocable on its own, and the client sees this same snapshot with Accept for interview and Ask a question on each candidate. Client actions are signals; they never change a candidate&apos;s state here.
                            </p>
                            {submissionResult.links.length > 0 ? (
                              <div style={{ marginTop: 14 }}>
                                <div className="ag-field-label">Links · shown once · copy them now</div>
                                {submissionResult.links.map((l) => (
                                  <div key={l.url} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                    <code className="ag-meta" style={{ color: "var(--ag-coral-deep)", wordBreak: "break-all", flex: 1 }}>
                                      {typeof window !== "undefined" ? window.location.origin : ""}{l.url}
                                    </code>
                                    <button
                                      className="ag-btn ag-btn-secondary"
                                      onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${l.url}`)}
                                    >
                                      Copy
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="ag-meta" style={{ marginTop: 12 }}>
                                No links on this submission. Pick recipients above and generate as portal to mint them.
                              </p>
                            )}
                            <div style={{ marginTop: 16 }}>
                              <div className="ag-field-label">What they will see</div>
                              {submissionResult.snapshot.shortlisted.map((entry) => (
                                <div key={entry.ref} className="ag-row" style={{ padding: "10px 0" }}>
                                  <div className="ag-avatar">{initials(entry.full_name)}</div>
                                  <div className="ag-grow">
                                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{entry.full_name}</div>
                                    <div className="ag-meta">{entry.current_title || entry.ref}</div>
                                  </div>
                                  <span className={`ag-score ${tier(entry.overall)}`}>{Math.round(entry.overall)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="ag-card-body" style={{ borderTop: "1px solid var(--ag-border)", paddingTop: 12 }}>
                        <p className="ag-meta" style={{ margin: 0 }}>
                          This snapshot is stored and immutable. Later overrides never rewrite what the client received, and your private notes on the role are not in it.
                        </p>
                      </div>
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
