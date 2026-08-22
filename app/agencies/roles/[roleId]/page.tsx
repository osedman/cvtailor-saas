"use client"

/**
 * The shortlist workflow, all seven steps live against the real APIs:
 * intake → parse review → candidates → screening calls → compare → candidate
 * detail → submission. Step 06 is its own route; lib/agency/steps.ts is the
 * single source of truth for the rail, and it has seven entries.
 * Every score on this page came from the server; the browser never computes
 * one. Overrides, decisions and submissions are audit coupled server side.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SignOut } from "@/components/agency/sign-out"
import { useRouter } from "next/navigation"
import { PROBE_LIBRARY, gapProbeText, resolveProbes, type ProbeQuestion } from "@/lib/agency/probes"
import { WORKFLOW_STEPS, stepNumber } from "@/lib/agency/steps"
import {
  ArrowUpRight, Banknote, Briefcase, ChevronUp, FileText,
  Flame, Highlighter, MapPin, Tag, Target, Users,
} from "lucide-react"
import { errorMessage } from "@/lib/error-message"

type Step = "intake" | "parse" | "candidates" | "screening" | "compare" | "submission"

interface Requirement { id: string; ref: string; text: string; weight: "must" | "important" | "nice" }
interface Constraint { id: string; ref: string; text: string; kind: string }
interface Role { id: string; ref: string; title: string; company: string; company_context: string; salary_band: string; location: string; seniority: string; jd_raw: string; recruiter_notes: string; status: string; owner_id: string | null }
interface Candidate { id: string; ref: string; full_name: string; current_title: string; years: number | null; location: string; salary_text?: string; source?: string; source_detail?: string; cv_storage_path?: string | null; parse_status: string; duplicate_of: string | null }
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
/** The immutable submission snapshot, exactly as the portal reads it. */
interface SnapshotEntry {
  availability?: string; salary_confirm?: string
  ref: string; full_name: string; current_title: string | null; years: number | null
  location: string | null; redacted?: boolean
  overall: number; original_overall: number | null
  must_have_hit: number; must_have_total: number; confidence_level: number; reviewed: boolean
  narrative: string
  strengths: Array<{ requirement: string; quote: string | null }>
  gaps: Array<{ requirement: string; weight: string }>
  probe_areas?: string[]
}
interface Disclosure { scores: boolean; evidence: boolean; probes: boolean; notes: boolean; logistics: boolean }
interface Snapshot {
  generated_at: string
  disclosure?: Disclosure
  intro?: string
  role: { ref: string; title: string; company: string; location: string; salary_band: string }
  shortlisted: SnapshotEntry[]
  not_submitted_count: number
}


// Must first, then important, then nice: the compare matrix reads down in
// the order the client actually cares about.
const WEIGHT_RANK = ["must", "important", "nice"]

// Weighted category rows for the compare cards, handoff order.
const FIT_ROWS: Array<{ key: keyof Score; label: string; weight: number }> = [
  { key: "requirement_coverage", label: "Requirement coverage", weight: 45 },
  { key: "evidence_strength", label: "Evidence strength", weight: 25 },
  { key: "seniority_calibration", label: "Seniority calibration", weight: 10 },
  { key: "context_fit", label: "Context fit", weight: 10 },
  { key: "confidence_completeness", label: "Confidence / completeness", weight: 10 },
]
interface Review { candidate_id: string; status: string; communication: number | null; motivation: number | null; availability: string; salary_confirm: string; notice_period: string; notes: string; call_answers?: Record<string, string> }
interface Evidence { candidate_id: string; requirement_id: string; strength: string; quote: string | null; source_cite?: string }

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
  // Who can own this role: active, non-viewer members. Loaded once, lazily —
  // the whole team list is small and the control renders from it.
  const [team, setTeam] = useState<Array<{ user_id: string; role: string; status: string; name: string }>>([])
  const [callerRole, setCallerRole] = useState<string>("viewer")
  const [ownerBusy, setOwnerBusy] = useState(false)
  const [closureNote, setClosureNote] = useState<string | null>(null)
  const [representAsk, setRepresentAsk] = useState<{ refs: string[]; format: string } | null>(null)
  const [paste, setPaste] = useState("")
  const [jdUrl, setJdUrl] = useState("")
  const [extractResult, setExtractResult] = useState<{ requirements: number; constraints: number; filled: string[] } | null>(null)
  const [submissionResult, setSubmissionResult] = useState<{ format: string; entries: number; links: Array<{ url: string }>; snapshot: Snapshot | null } | null>(null)
  const [contacts, setContacts] = useState<Array<{ id: string; company: string; email: string; full_name: string }>>([])
  const [chosenContacts, setChosenContacts] = useState<string[]>([])
  const [newContact, setNewContact] = useState({ company: "", email: "", full_name: "" })
  const [agencyName, setAgencyName] = useState("Your agency")
  // Quiet matching. Note there is no count in this shape and never should be:
  // "until someone applies, you see nobody" (Figma 10:2). The server type
  // cannot carry one either — see lib/agency/matching.ts.
  const [matching, setMatching] = useState<{
    enabled: boolean
    minScore: number
    lastScanAt: string | null
    nextScanAllowedAt: string | null
    scanQueued: boolean
  } | null>(null)
  const [minScoreDraft, setMinScoreDraft] = useState(70)
  const [probePicker, setProbePicker] = useState(false)
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null)
  const [disclosure, setDisclosure] = useState<Disclosure>({ scores: true, evidence: true, probes: true, notes: false, logistics: true })
  const [intro, setIntro] = useState("")
  const [previewFormat, setPreviewFormat] = useState<"document" | "email" | "portal">("document")
  // The compare board advertises S / H / R in the handoff; they act on the
  // card under the pointer or keyboard focus, falling back to the top ranked
  // candidate with no decision yet.
  const [focusedCandidate, setFocusedCandidate] = useState<string | null>(null)
  const [compareSort, setCompareSort] = useState<"score" | "must" | "name">("score")
  const [mustOnly, setMustOnly] = useState(false)
  // Hiding is a view control on the compare board only. It never touches the
  // candidate, the score or any decision — the product does not remove people.
  const [hiddenCandidates, setHiddenCandidates] = useState<string[]>([])

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

  async function reassignOwner(userId: string) {
    if (!role || userId === (role.owner_id ?? "")) return
    setOwnerBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: userId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not change the owner.")
        return
      }
      setRole((r) => (r ? { ...r, owner_id: userId } : r))
    } catch {
      setError("Could not change the owner.")
    } finally {
      setOwnerBusy(false)
    }
  }

  useEffect(() => {
    ;(async () => {
      const res = await fetch(`/api/agency/roles/${roleId}`)
      if (res.status === 401) return router.push("/agencies")
      if (!res.ok) return setError("Role not found in your agency")
      const body = await res.json()
      setRole(body.role)
      setBriefJd(body.brief_jd ?? null)
      if (body.agency?.name) setAgencyName(body.agency.name)
      setIntro((prev) => prev || `Hi — here are the candidates I'd put in front of you for ${body.role?.title ?? "this role"}. Each one has had a screening call with me, and I've noted where the CV overstated or understated the fit.`)
      setRequirements(body.requirements ?? [])
      setConstraints(body.constraints ?? [])
      // Separate request, and a failure here must not take the role page with
      // it — matching is an adjunct, not part of the workflow's spine.
      setCallerRole(body.caller_role ?? "viewer")
      // Non-fatal like matching: the owner control simply does not render if
      // this fails, and the role page must not die for it.
      fetch(`/api/agency/team`)
        .then((r) => (r.ok ? r.json() : null))
        .then((t) => {
          if (!t?.members) return
          setTeam(
            (t.members as Array<{ user_id: string; role: string; status: string; profile: { full_name?: string; email?: string } | null }>).map((m) => ({
              user_id: m.user_id,
              role: m.role,
              status: m.status,
              name: m.profile?.full_name || m.profile?.email || "Unnamed",
            }))
          )
        })
        .catch(() => {})
      fetch(`/api/agency/roles/${roleId}/matching`)
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => {
          if (!m?.matching) return
          setMatching(m.matching)
          setMinScoreDraft(m.matching.minScore ?? 70)
        })
        .catch(() => {})
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
  /** The client's own JD, when this role was minted from a brief that carried
   * one. Drives the intake provenance line and the pull-it-back button. */
  const [briefJd, setBriefJd] = useState<string | null>(null)
  useEffect(() => {
    if (step !== "screening" || candidates.length === 0) return
    if (!activeCandidate) setActiveCandidate(candidates[0].id)
    for (const c of candidates) {
      if (loadedDetail.current.has(c.id)) continue
      loadedDetail.current.add(c.id)
      loadReviewDetail(c.id)
    }
  }, [step, candidates, activeCandidate, loadReviewDetail])

  // S / H / R on the compare board, exactly as the action bar advertises.
  // Ignored while typing so notes and requirement text are never eaten.
  useEffect(() => {
    if (step !== "compare") return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const map: Record<string, string> = { s: "shortlist", h: "hold", r: "reject" }
      const next = map[e.key.toLowerCase()]
      if (!next) return
      const target = focusedCandidate ?? rankedCandidates.find((c) => !decisions[c.id])?.id
      if (!target) return
      e.preventDefault()
      decide(target, next)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, focusedCandidate, decisions, candidates, scores])

  function patchRole(fields: Partial<Role>) {
    setRole((r) => (r ? { ...r, ...fields } : r))
  }

  /**
   * Publish, re-publish with a new minimum, or pause. The scan never runs in
   * this request — the server queues it and returns immediately.
   */
  async function setMatchingEnabled(enabled: boolean) {
    setBusy("matching")
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/matching`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enabled ? { enabled: true, minScore: minScoreDraft } : { enabled: false }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || "That did not save.")
      setMatching(body.matching)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function saveIntake(override?: Partial<Role>) {
    if (!role) return
    // Intake fields only. Status changes go through closeRole so they are
    // audit logged deliberately, never as a side effect of typing.
    // `override` exists for saves fired in the same tick as a patchRole —
    // React state has not settled yet, and saving the stale closure would
    // show one JD and store another.
    const { title, company, company_context, salary_band, location, seniority, jd_raw, recruiter_notes } = { ...role, ...override }
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
      // Closing tells the unsuccessful candidates the loop ended. Say what
      // happened — a count the recruiter can repeat to the client, and the
      // absence of one when nobody was eligible.
      if (body.closure) {
        const c = body.closure as { sent: number; suppressed: number; noContact: number; failed: number }
        setClosureNote(
          c.sent > 0
            ? `${c.sent} candidate${c.sent === 1 ? " was" : "s were"} told the role has closed.${c.failed > 0 ? ` ${c.failed} email${c.failed === 1 ? "" : "s"} failed — check the audit log.` : ""}`
            : "Nobody needed telling — everyone in the process had already been told, or was never contacted about this role."
        )
      }
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
      setError(errorMessage(err))
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
      setError(errorMessage(err))
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

  async function generateSubmission(format: string, representOverride = false) {
    if (format === "portal" && chosenContacts.length === 0) {
      return setError("Choose at least one recipient. Portal links are personal, one per named person.")
    }
    setBusy("submission")
    setError(null)
    if (representOverride) setRepresentAsk(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/submission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          disclosure,
          intro,
          ...(representOverride ? { representOverride: true } : {}),
          ...(format === "portal" ? { recipients: chosenContacts.map((id) => ({ contact_id: id })) } : {}),
        }),
      })
      const body = await res.json()
      // 409: candidates who have not answered the ask to be put forward. Not
      // an error to bury in the banner — the override must be a conscious,
      // named act, and it is audited server-side.
      if (res.status === 409 && Array.isArray(body.needsRepresentOverride)) {
        setRepresentAsk({ refs: body.needsRepresentOverride as string[], format })
        return
      }
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
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const initials = (name: string) =>
    name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
  const tier = (n: number) => (n >= 80 ? "hi" : n >= 60 ? "med" : "lo")
  /**
   * Evidence was looked up with evidence.find() inside every matrix cell,
   * so the compare board cost candidates × requirements × evidence-rows
   * scans on each render: eight candidates against fifteen requirements over
   * a couple of hundred evidence rows is tens of thousands of comparisons per
   * keystroke. Indexed once per data change instead.
   */
  const evidenceIndex = useMemo(() => {
    const map = new Map<string, Evidence>()
    for (const e of evidence) map.set(`${e.candidate_id}:${e.requirement_id}`, e)
    return map
  }, [evidence])
  const evidenceAt = useCallback(
    (candidateId: string, requirementId: string) => evidenceIndex.get(`${candidateId}:${requirementId}`),
    [evidenceIndex]
  )
  const parsedStrength = useCallback(
    (candidateId: string, requirementId: string): Strength =>
      ((evidenceAt(candidateId, requirementId)?.strength ?? "missing") as Strength),
    [evidenceAt]
  )
  const effectiveStrength = useCallback(
    (candidateId: string, requirementId: string): Strength =>
      (overrides[candidateId]?.[requirementId] ??
        scores[candidateId]?.effective?.[requirementId] ??
        parsedStrength(candidateId, requirementId)) as Strength,
    [overrides, scores, parsedStrength]
  )
  // One pass over decisions rather than four.
  const decisionCounts = useMemo(() => {
    const counts = { shortlist: 0, hold: 0, reject: 0, undecided: 0 }
    for (const c of candidates) {
      const d = decisions[c.id]
      if (d === "shortlist" || d === "hold" || d === "reject") counts[d] += 1
      else counts.undecided += 1
    }
    return counts
  }, [candidates, decisions])
  const reviewedCount = useMemo(
    () => Object.values(reviews).filter((r) => r.status === "reviewed").length,
    [reviews]
  )
  const shortlisted = decisionCounts.shortlist
  const decisionTotals = `${decisionCounts.shortlist} shortlist · ${decisionCounts.hold} hold · ${decisionCounts.reject} reject`

  // Six of the seven render here; Candidate detail is per-candidate and has
  // its own route, so the rail links out to it rather than switching a pane.
  const steps = WORKFLOW_STEPS.filter((s) => s.key !== "detail") as Array<{ key: Step; label: string }>
  const detailTarget = activeCandidate ?? candidates[0]?.id ?? null
  const active = activeCandidate ? candidates.find((c) => c.id === activeCandidate) : null
  const activeScore = activeCandidate ? scores[activeCandidate] : null
  const activeReview = activeCandidate ? reviews[activeCandidate] : null

  // Every probe this candidate could be asked: their own unmet requirements
  // first (weighted ones only, the nice-to-haves are not worth call time),
  // then the standard library.
  const activeAnswers: Record<string, string> = activeReview?.call_answers ?? {}
  const probeCatalogue: ProbeQuestion[] = useMemo(() => {
    if (!active) return []
    const gaps: ProbeQuestion[] = []
    for (const req of requirements) {
      if (req.weight === "nice") continue
      const st = effectiveStrength(active.id, req.id)
      if (st !== "missing" && st !== "partial" && st !== "transferable") continue
      gaps.push({ id: req.ref, text: gapProbeText(req.text), why: `${req.ref} reads ${st} from the CV`, source: "gap" })
    }
    return [...gaps, ...PROBE_LIBRARY.map((q) => ({ ...q, source: "library" as const }))]
  }, [active, requirements, effectiveStrength])
  const chosenProbes = useMemo(() => probeCatalogue.filter((q) => q.id in activeAnswers), [probeCatalogue, activeAnswers])
  const answeredProbes = useMemo(
    () => chosenProbes.filter((q) => (activeAnswers[q.id] ?? "").trim().length > 0).length,
    [chosenProbes, activeAnswers]
  )
  const suggestedProbes = useMemo(() => probeCatalogue.filter((q) => !(q.id in activeAnswers)), [probeCatalogue, activeAnswers])

  // Held, rejected and undecided candidates: the internal record on the
  // submission screen. Present so the recruiter can see the whole field,
  // never sent to the client.
  const notShortlisted = useMemo(() => candidates.filter((c) => decisions[c.id] !== "shortlist"), [candidates, decisions])
  const rankedCandidates = useMemo(
    () => [...candidates].sort((a, b) => (scores[b.id]?.overall ?? 0) - (scores[a.id]?.overall ?? 0)),
    [candidates, scores]
  )

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
          <div className="ag-rail-label">Shortlist workflow</div>
          {WORKFLOW_STEPS.map((s) => {
            if (s.key === "detail") {
              return (
                <button
                  key={s.key}
                  className={`ag-step${detailTarget ? "" : " locked"}`}
                  disabled={!detailTarget}
                  title={detailTarget ? "Open the evidence map for the active candidate" : "Add a candidate first"}
                  onClick={() => detailTarget && router.push(`/agencies/roles/${roleId}/candidates/${detailTarget}`)}
                >
                  <span className={`ag-step-num${candidates.length > 0 ? " done" : ""}`}>
                    {candidates.length > 0 ? "✓" : stepNumber(s.key)}
                  </span>{" "}
                  {s.label}
                </button>
              )
            }
            const key = s.key as Step
            return (
              <button key={s.key} className={`ag-step${step === key ? " on" : ""}`} onClick={() => setStep(key)}>
                <span className={`ag-step-num${stepDone[key] && step !== key ? " done" : ""}`}>
                  {stepDone[key] && step !== key ? "✓" : stepNumber(s.key)}
                </span>{" "}
                {s.label}
              </button>
            )
          })}
        </div>
        {role && (
          <div className="ag-active-role">
            <div className="ag-rail-label" style={{ padding: 0 }}>Active role</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{role.title}</div>
            <div className="ag-meta">{role.company || "No company"} · {role.ref}</div>
            {team.length > 0 && (
              <div className="ag-owner-row">
                <label className="ag-rail-label" style={{ padding: 0, marginBottom: 0 }} htmlFor="role-owner">
                  Owner
                </label>
                {callerRole === "viewer" ? (
                  <span className="ag-meta">
                    {team.find((m) => m.user_id === role.owner_id)?.name ?? "Unassigned"}
                  </span>
                ) : (
                  <select
                    id="role-owner"
                    className="ag-owner-select"
                    value={role.owner_id ?? ""}
                    disabled={ownerBusy}
                    onChange={(e) => void reassignOwner(e.target.value)}
                  >
                    {!role.owner_id && <option value="">Unassigned</option>}
                    {team
                      .filter((m) => m.status === "active" && m.role !== "viewer")
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            )}
          </div>
        )}
        <SignOut />
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
                <button className="ag-crumb-link" onClick={() => router.push("/agencies")}>Dashboard</button>
                {" / "}
                <b>{role.company ? `${role.company} — ${role.title}` : role.title}</b>
                {" / "}
                {`${stepNumber(steps[stepIndex]?.key ?? "intake")}. ${steps[stepIndex]?.label ?? ""}`}
              </span>
              <span className="ag-grow" />
              {/* Interviews is an adjunct, not an eighth step: lib/agency/steps.ts
                  stays the single source of truth for the seven. */}
              <button
                className="ag-btn ag-btn-secondary"
                onClick={() => router.push(`/agencies/roles/${roleId}/interviews`)}
              >
                Interviews
              </button>
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
            <p className="ag-step-eyebrow">Step {stepNumber(steps[stepIndex]?.key ?? "intake")} · {steps[stepIndex]?.label}</p>
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
                    <span className="ag-meta">{(role.jd_raw ?? "").length} chars · autosaved</span>
                    <label className="ag-btn ag-btn-secondary" style={{ cursor: "pointer" }}>
                      Upload the JD
                      <input type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) extract({ file: f }) }} />
                    </label>
                  </div>
                  <div className="ag-card-body">
                    <textarea className="ag-textarea jd" placeholder="Paste the client's job description here" value={role.jd_raw} onChange={(e) => patchRole({ jd_raw: e.target.value })} onBlur={() => void saveIntake()} />
                    {/* The client's JD arrived with the brief. Accept copied
                        it in; this line is the provenance, and the button is
                        the way back to their exact text after edits. */}
                    {briefJd && briefJd === role.jd_raw.trim() && (
                      <p className="ag-note" style={{ marginTop: 8, color: "var(--ag-ink-3)" }}>
                        This JD came with the client&rsquo;s brief — parse it, or edit first.
                      </p>
                    )}
                    {briefJd && briefJd !== role.jd_raw.trim() && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                        <button
                          className="ag-btn ag-btn-secondary"
                          disabled={busy !== null}
                          onClick={() => { patchRole({ jd_raw: briefJd }); void saveIntake({ jd_raw: briefJd }) }}
                        >
                          Use the JD from the client&rsquo;s brief
                        </button>
                        <span className="ag-note" style={{ color: "var(--ag-ink-3)" }}>
                          Replaces the box with their exact text.
                        </span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                      <input className="ag-input" placeholder="Or a link to the posting" value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} />
                      <button className="ag-btn ag-btn-secondary" onClick={() => jdUrl.trim() && extract({ url: jdUrl.trim() })} disabled={busy !== null || !jdUrl.trim()}>
                        Fetch and extract
                      </button>
                    </div>
                    <p className="ag-note" style={{ marginTop: 8 }}>
                      Extraction fills any empty fields on the right from the JD. It never overwrites what you typed, and never touches your notes.
                    </p>
                  </div>
                </div>
                <div className="ag-stack">
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Role &amp; client</span></div>
                    <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                      <div><label className="ag-label">Role title</label><input className="ag-input" value={role.title} onChange={(e) => patchRole({ title: e.target.value })} onBlur={() => void saveIntake()} /></div>
                      <div><label className="ag-label">Company</label><input className="ag-input" value={role.company} onChange={(e) => patchRole({ company: e.target.value })} onBlur={() => void saveIntake()} /></div>
                      <div><label className="ag-label">Context</label><textarea className="ag-textarea" style={{ minHeight: 80 }} value={role.company_context} onChange={(e) => patchRole({ company_context: e.target.value })} onBlur={() => void saveIntake()} /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><label className="ag-label">Comp band</label><input className="ag-input" value={role.salary_band} onChange={(e) => patchRole({ salary_band: e.target.value })} onBlur={() => void saveIntake()} /></div>
                        <div><label className="ag-label">Location</label><input className="ag-input" value={role.location} onChange={(e) => patchRole({ location: e.target.value })} onBlur={() => void saveIntake()} /></div>
                      </div>
                    </div>
                  </div>
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Recruiter notes</span><span className="ag-pill">Private</span></div>
                    <div className="ag-card-body">
                      <textarea className="ag-textarea" placeholder="What the client said that never made the JD" value={role.recruiter_notes} onChange={(e) => patchRole({ recruiter_notes: e.target.value })} onBlur={() => void saveIntake()} />
                      <p className="ag-note" style={{ marginTop: 8 }}>Notes feed the scoring and never reach the client.</p>
                    </div>
                  </div>

                </div>
              </div>
              <div className="ag-principle">
                <span className="ag-principle-bar" />
                <div>
                  <div className="ag-field-label">Evidence first principle</div>
                  <p className="ag-principle-text">
                    Every score you see later points back to something in this brief or your notes. Where we have no proof we say{" "}
                    <span className="ag-missing-chip">MISSING</span> rather than invent it, nobody is rejected automatically, and you stay in control of every decision.
                  </p>
                </div>
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
                      {constraints.length === 0 && <span className="ag-note">None extracted.</span>}
                      {constraints.map((c, i) => (
                        <div key={c.id ?? i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="ag-meta">{c.ref}</span>
                          <span className="ag-grow" style={{ fontSize: 13 }}>{c.text}</span>
                          <span className="ag-pill">{c.kind.replace("_", "-")}</span>
                        </div>
                      ))}
                      {constraints.length > 0 && (
                        <p style={{ borderTop: "1px solid var(--ag-border)", paddingTop: 10, margin: 0, fontSize: 12, color: "var(--ag-ink-3)" }}>
                          Constraints act as filters, not scoring inputs. A candidate outside a constraint gets a flag, not a lower score.
                        </p>
                      )}
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
                        <div className="ag-name">No candidates yet for {role.ref}.</div>
                        <p style={{ fontSize: 12.5, color: "var(--ag-ink-3)", margin: "6px 0 0" }}>{requirements.length} requirements ready. Nothing scored yet.</p>
                      </div>
                    </div>
                  )}
                  {candidates.map((c) => {
                    const s = scores[c.id]
                    const isOpen = expandedCandidate === c.id
                    const snippets = evidence.filter((e) => e.candidate_id === c.id && e.strength !== "missing").length
                    const tally = (["strong", "transferable", "partial", "missing"] as const).map((st) => ({
                      st,
                      n: requirements.filter((r) => effectiveStrength(c.id, r.id) === st).length,
                    }))
                    const delta = s?.original_overall != null ? Math.round(s.overall - s.original_overall) : 0
                    return (
                      <div className="ag-prof" key={c.id} data-open={isOpen}>
                        <button
                          className="ag-prof-head"
                          aria-expanded={isOpen}
                          onClick={() => setExpandedCandidate(isOpen ? null : c.id)}
                        >
                          <span style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                            <span className="ag-avatar" style={{ width: 40, height: 40 }}>{initials(c.full_name)}</span>
                            <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                              <span className="ag-prof-name">
                                {c.full_name}
                                {c.duplicate_of && <span className="ag-pill ag-pill-warn" style={{ marginLeft: 8 }}>Also in your pipeline</span>}
                                {/* Arrival channel, per the applicant-pool frame: matched
                                    applicants chose to be here and arrive pre-evidenced.
                                    Badged, ranked with everyone else, never separated. */}
                                {c.source === "matched" && <span className="ag-pill" style={{ marginLeft: 8 }}>Matched · applied themselves</span>}
                              </span>
                              <span className="ag-meta">{c.ref} · {c.current_title || "Unknown role"}</span>
                            </span>
                          </span>
                          <span style={{ display: "flex", gap: 12, alignItems: "center", flex: "none" }}>
                            {reviews[c.id]?.status === "reviewed" && <span className="ag-reviewed inline">Call done</span>}
                            {c.parse_status === "failed" ? (
                              <span className="ag-pill ag-pill-failed">Failed</span>
                            ) : s ? (
                              <>
                                <svg width="64" height="20" aria-hidden="true" style={{ display: "block" }}>
                                  <path
                                    d={delta >= 0 ? "M2 17C14 14 24 6 40 8C54 10 58 3 62 3" : "M2 3C14 5 24 7 40 11C54 15 58 16 62 17"}
                                    fill="none"
                                    stroke={delta === 0 ? "var(--ag-ink-4)" : delta > 0 ? "var(--ag-coral)" : "var(--ag-warn)"}
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <span className="ag-prof-score">{Math.round(s.overall)}</span>
                              </>
                            ) : (
                              <span className="ag-meta">{snippets} snippets</span>
                            )}
                            <span className="ag-prof-chevron" data-open={isOpen} aria-hidden="true"><ChevronUp size={18} /></span>
                          </span>
                        </button>
                        {isOpen && (
                          <div className="ag-prof-body">
                            <div className="ag-prof-row">
                              <span className="ag-prof-key"><FileText size={16} />CV source</span>
                              <span className="ag-mix-chip" style={{ textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
                                <Highlighter size={12} style={{ flex: "none" }} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {c.source === "paste" ? "Pasted text" : c.source_detail || c.cv_storage_path?.split("/").pop() || "Uploaded CV"}
                                </span>
                              </span>
                            </div>
                            <div className="ag-prof-row"><span className="ag-prof-key"><Highlighter size={16} />Evidence snippets</span><span className="ag-prof-val mono">{snippets} sourced</span></div>
                            <div className="ag-prof-row">
                              <span className="ag-prof-key"><Flame size={16} />Overall fit</span>
                              {s ? <span className="ag-prof-fit">{Math.round(s.overall)} <ArrowUpRight size={13} strokeWidth={2} /></span> : <span className="ag-meta">Not scored yet</span>}
                            </div>
                            <div className="ag-prof-row">
                              <span className="ag-prof-key"><Target size={16} />Must-have coverage</span>
                              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span className="ag-prof-val mono">{s ? `${s.must_have_hit}/${s.must_have_total}` : "Pending"}</span>
                                {delta !== 0 && <span className="ag-delta-pill">{Math.round(s!.original_overall!)} → {Math.round(s!.overall)}</span>}
                              </span>
                            </div>
                            <div className="ag-prof-row"><span className="ag-prof-key"><MapPin size={16} />Location</span><span className="ag-prof-val">{c.location || "Not parsed"}</span></div>
                            <div className="ag-prof-row"><span className="ag-prof-key"><Briefcase size={16} />Experience</span><span className="ag-prof-val">{c.years ? `${c.years} years` : "Not parsed"}</span></div>
                            {c.salary_text && (
                              <div className="ag-prof-row">
                                <span className="ag-prof-key"><Banknote size={16} />Comp expectation</span>
                                <span className="ag-mix-chip" style={{ textTransform: "none", letterSpacing: 0, fontSize: 11.5, background: "var(--ag-bg-2)" }}>{c.salary_text}</span>
                              </div>
                            )}
                            <div className="ag-prof-row">
                              <span className="ag-prof-key"><Tag size={16} />Evidence mix</span>
                              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {tally.map(({ st, n }) => (
                                  <span key={st} className="ag-mix-chip" data-missing={st === "missing"}>
                                    <span className={`ag-dot ${st}`} />{n} {st.slice(0, 4)}
                                  </span>
                                ))}
                              </span>
                            </div>
                            {(() => {
                              const strongs = requirements.filter((r) => effectiveStrength(c.id, r.id) === "strong").map((r) => r.text)
                              if (strongs.length === 0) return null
                              return (
                                <div className="ag-prof-row" style={{ alignItems: "flex-start" }}>
                                  <span className="ag-prof-key"><Users size={16} />Top strengths</span>
                                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    {strongs.slice(0, 2).map((t) => (
                                      <span key={t} className="ag-strength-chip">{t}</span>
                                    ))}
                                    {strongs.length > 2 && <span className="ag-strength-chip mono" style={{ fontWeight: 700 }}>+{strongs.length - 2}</span>}
                                  </span>
                                </div>
                              )
                            })()}
                            <div className="ag-prof-foot">
                              <button className="ag-btn ag-btn-secondary" onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}>
                                Open the evidence map →
                              </button>
                            </div>
                          </div>
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
                  <h1 className="ag-title">Your call is the evidence<br />the CV could not give us.</h1>
                  <p className="ag-sub">
                    Log what you learned. Overriding a strength rescores the candidate immediately, and every change is attributed to you in the audit trail.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="ag-meta">{reviewedCount}/{candidates.length} calls logged</span>
                  <button className="ag-btn" onClick={() => setStep("candidates")}>Back</button>
                  <button className="ag-btn ag-btn-primary" onClick={() => setStep("compare")} disabled={reviewedCount === 0}>
                    Compare shortlist
                  </button>
                </div>
              </div>

              <div className="ag-scr-grid">
                <div className="ag-card" style={{ alignSelf: "start" }}>
                  <div className="ag-card-head"><span className="ag-card-title">Call queue</span></div>
                  <div className="ag-card-body" style={{ padding: 8 }}>
                    <div className="ag-stack" style={{ gap: 4 }}>
                      {candidates.map((c) => {
                        const s = scores[c.id]
                        const r = reviews[c.id]
                        const d = s?.original_overall != null ? Math.round(s.overall - s.original_overall) : 0
                        return (
                          <button
                            key={c.id}
                            className="ag-queue-item"
                            aria-current={activeCandidate === c.id ? "true" : undefined}
                            onClick={() => setActiveCandidate(c.id)}
                          >
                            <span className="ag-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(c.full_name)}</span>
                            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                              <span className="ag-queue-name">{c.full_name}</span>
                              <span className="ag-meta">{r?.status === "reviewed" ? "Call logged" : "Not called"}</span>
                            </span>
                            <span style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                              <span className="ag-queue-score">{s ? Math.round(s.overall) : "—"}</span>
                              {d !== 0 && <span className="ag-queue-delta" data-up={d > 0}>{d > 0 ? `+${d}` : d}</span>}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {active ? (
                  <div className="ag-stack" style={{ minWidth: 0 }}>
                    <div className="ag-card">
                      <div className="ag-card-head">
                        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                          <div className="ag-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(active.full_name)}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{active.full_name}</div>
                            <div className="ag-meta">{active.ref} · {active.current_title || "No title parsed"}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {activeReview?.status === "reviewed" && <span className="ag-reviewed inline">Call logged</span>}
                          <button className="ag-btn" onClick={() => resetCall(active.id)}>Reset</button>
                          <button
                            className="ag-btn"
                            disabled
                            title="No transcript is captured for calls yet. When call recording ships (with candidate consent), this fills the form from it."
                          >
                            Fill from transcript
                          </button>
                          <button
                            className="ag-btn ag-btn-secondary"
                            onClick={() => {
                              const next = activeReview?.status === "reviewed" ? "unreviewed" : "reviewed"
                              patchReview(active.id, { status: next }, { status: next })
                            }}
                          >
                            {activeReview?.status === "reviewed" ? "Mark not called" : "Mark call logged"}
                          </button>
                        </div>
                      </div>

                      <div className="ag-card-body ag-stack" style={{ gap: 18 }}>
                        <div>
                          <div className="ag-field-label">Suggested probes · generated from this candidate&apos;s gaps</div>
                          {chosenProbes.length === 0 && (
                            <p className="ag-quiet" style={{ padding: "14px 0", textAlign: "left" }}>
                              No questions picked yet. Tailr suggests the ones your requirements leave open.
                            </p>
                          )}
                          <div className="ag-stack" style={{ gap: 12 }}>
                            {chosenProbes.map((q, i) => (
                              <div key={q.id} className="ag-stack" style={{ gap: 6 }}>
                                <label className="ag-probe-label" htmlFor={`q-${active.id}-${q.id}`}>
                                  <span className="ag-qnum">Q{i + 1}</span>
                                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{q.text}</span>
                                  <button className="ag-icon-btn" title="Remove this question" aria-label={`Remove ${q.id}`} onClick={() => setProbe(active.id, q.id, null)}>×</button>
                                </label>
                                <textarea
                                  id={`q-${active.id}-${q.id}`}
                                  key={`${active.id}:${q.id}`}
                                  className="ag-textarea"
                                  style={{ minHeight: 56 }}
                                  placeholder="What did they say?"
                                  defaultValue={activeAnswers[q.id] ?? ""}
                                  onBlur={(e) => {
                                    if (e.target.value === (activeAnswers[q.id] ?? "")) return
                                    setProbe(active.id, q.id, e.target.value)
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          <button className="ag-btn ag-btn-secondary" style={{ marginTop: 10 }} onClick={() => setProbePicker((v) => !v)}>
                            {probePicker ? "Close" : "+ Add a question"}
                          </button>
                          {probePicker && (
                            <div className="ag-picker">
                              {suggestedProbes.length === 0 && <p className="ag-quiet" style={{ padding: 12 }}>Every question is already on the script.</p>}
                              {suggestedProbes.some((q) => q.source === "gap") && <p className="ag-picker-group">From this candidate&apos;s open requirements</p>}
                              {suggestedProbes.filter((q) => q.source === "gap").map((q) => (
                                <button className="ag-picker-opt" key={q.id} onClick={() => setProbe(active.id, q.id, "")}>
                                  <span className="ag-qnum">{q.id}</span>
                                  <span className="ag-grow">{q.text}</span>
                                  <span className="ag-picker-why">{q.why}</span>
                                </button>
                              ))}
                              {suggestedProbes.some((q) => q.source === "library") && <p className="ag-picker-group">Standard probes</p>}
                              {suggestedProbes.filter((q) => q.source === "library").map((q) => (
                                <button className="ag-picker-opt" key={q.id} onClick={() => setProbe(active.id, q.id, "")}>
                                  <span className="ag-qnum">{q.id}</span>
                                  <span className="ag-grow">{q.text}</span>
                                  <span className="ag-picker-why">{q.why}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="ag-field-label">Soft signals</div>
                          <div className="ag-soft-grid">
                            {(["communication", "motivation"] as const).map((signal) => (
                              <div key={signal} className="ag-stack" style={{ gap: 6 }}>
                                <span className="ag-field-label" style={{ marginBottom: 0 }}>{signal === "communication" ? "Communication" : "Motivation for this role"}</span>
                                <div className="ag-seg" role="group" aria-label={signal}>
                                  {[1, 2, 3, 4, 5].map((n) => {
                                    const next = activeReview?.[signal] === n ? null : n
                                    return (
                                      <button
                                        key={n}
                                        style={{ flex: 1, justifyContent: "center" }}
                                        aria-pressed={activeReview?.[signal] === n}
                                        className={activeReview?.[signal] === n ? "on" : ""}
                                        onClick={() => patchReview(active.id, { [signal]: next }, { [signal]: next })}
                                      >
                                        {n}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                            {([
                              ["availability", "Availability", "e.g. 8 weeks"],
                              ["salary_confirm", "Comp position", "e.g. flex to £125k"],
                              ["notice_period", "Notice period", "e.g. negotiable to 8 wks"],
                            ] as const).map(([field, label, hint]) => (
                              <div key={`${active.id}:${field}`} className="ag-stack" style={{ gap: 6 }}>
                                <span className="ag-field-label" style={{ marginBottom: 0 }}>{label}</span>
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

                        <div className="ag-stack" style={{ gap: 6 }}>
                          <label className="ag-field-label" htmlFor="call-notes">Recruiter notes</label>
                          <textarea
                            id="call-notes"
                            key={`${active.id}:notes`}
                            className="ag-textarea"
                            style={{ minHeight: 90 }}
                            placeholder="Your read on the call. This feeds the client submission narrative."
                            defaultValue={activeReview?.notes ?? ""}
                            onBlur={(e) => {
                              if (e.target.value === (activeReview?.notes ?? "")) return
                              patchReview(active.id, { notes: e.target.value }, { notes: e.target.value })
                            }}
                          />
                          <span className="ag-meta">Attached to {active.ref} · feeds submission narrative</span>
                        </div>
                      </div>
                    </div>

                    <div className="ag-card">
                      <div className="ag-card-head">
                        <span className="ag-card-title">Evidence after the call</span>
                        <span className="ag-meta">
                          {Object.keys(overrides[active.id] ?? {}).length} override{Object.keys(overrides[active.id] ?? {}).length === 1 ? "" : "s"} · attributed to you
                        </span>
                      </div>
                      <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                        <div className="ag-legend" style={{ marginBottom: 4 }}>
                          <span className="ag-field-label" style={{ marginBottom: 0, marginRight: 4 }}>Legend</span>
                          <span><span className="ag-dot strong" /> Strong evidence — 1.0</span>
                          <span><span className="ag-dot transferable" /> Transferable — 0.7</span>
                          <span><span className="ag-dot partial" /> Partial — 0.4</span>
                          <span><span className="ag-dot missing" /> Missing — 0.0</span>
                        </div>
                        {requirements.map((req) => {
                          const parsed = parsedStrength(active.id, req.id)
                          const current = effectiveStrength(active.id, req.id)
                          const isOverride = Boolean(overrides[active.id]?.[req.id])
                          const ev = evidenceAt(active.id, req.id)
                          return (
                            <div key={req.id} className="ag-ev-card" data-override={isOverride}>
                              <div className="ag-ev-main">
                                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                                  <span style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
                                    <span className="ag-meta">{req.ref}</span>
                                    <span className="ag-mx-weight" data-must={req.weight === "must"}>{req.weight}</span>
                                  </span>
                                  <span style={{ fontSize: 13, fontWeight: 500 }}>{req.text}</span>
                                  {ev?.quote && (
                                    <span className="ag-ev-quote">
                                      {ev.quote}
                                      {ev.source_cite && <span className="ag-meta" style={{ fontStyle: "normal" }}> — {ev.source_cite}</span>}
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flex: "none" }}>
                                  <div className="ag-seg" role="group" aria-label={`Strength for ${req.ref}`}>
                                    {STRENGTHS.map((s) => (
                                      <button
                                        key={s}
                                        title={s}
                                        aria-label={s}
                                        aria-pressed={current === s}
                                        className={current === s ? "on" : ""}
                                        onClick={() => setOverride(active.id, req.id, current === s ? null : s)}
                                      >
                                        <span className={`ag-dot ${s}`} />
                                      </button>
                                    ))}
                                  </div>
                                  {isOverride && (
                                    <span className="ag-ev-was">was {parsed} · now {current}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="ag-card"><div className="ag-quiet">No candidates on this role yet.</div></div>
                )}

                <div className="ag-scr-side">
                  {activeScore && (
                    <div className="ag-card">
                      <div className="ag-card-head"><span className="ag-card-title">Live score</span></div>
                      <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="ag-conf-bars" title={`Confidence ${activeScore.confidence_level} of 4`}>
                            {[1, 2, 3, 4].map((n) => (
                              <span key={n} className="ag-conf-bar" data-on={n <= activeScore.confidence_level} style={{ height: 4 + n * 3 }} />
                            ))}
                          </span>
                          <span className="ag-meta">{["", "LOW", "MEDIUM", "HIGH", "HIGH"][activeScore.confidence_level] ?? "MEDIUM"} CONFIDENCE</span>
                        </div>
                        {activeScore.original_overall != null && Math.round(activeScore.original_overall) !== Math.round(activeScore.overall) && (
                          <span className="ag-delta-pill">
                            {Math.round(activeScore.original_overall)} → {Math.round(activeScore.overall)}{" "}
                            {Math.round(activeScore.overall - activeScore.original_overall) > 0 ? "+" : ""}
                            {Math.round(activeScore.overall - activeScore.original_overall)}
                          </span>
                        )}
                        <div className="ag-nutrition-top">
                          <span className="ag-field-label" style={{ marginBottom: 0, color: "var(--ag-ink-3)" }}>Overall fit</span>
                          <span className="ag-nutrition-score">{Math.round(activeScore.overall)}</span>
                        </div>
                        <div className="ag-nutrition-rule" />
                        {FIT_ROWS.map((row) => {
                          const v = Math.round(Number(activeScore[row.key] ?? 0))
                          return (
                            <div key={row.key} className="ag-fit-row">
                              <span className="ag-fit-label">{row.label}</span>
                              <span className="ag-fit-num">{row.weight}% · <b>{v}</b></span>
                              <div className="ag-bar"><div className="ag-bar-fill" style={{ width: `${v}%` }} /></div>
                            </div>
                          )
                        })}
                        <div className="ag-nutrition-foot">
                          <span className="ag-fit-label">Must-have coverage</span>
                          <span className="ag-fit-num"><b>{activeScore.must_have_hit}/{activeScore.must_have_total}</b></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {active && (
                    <div className="ag-card">
                      <div className="ag-card-head"><span className="ag-card-title">Still unevidenced</span></div>
                      <div className="ag-card-body">
                        {requirements.filter((r) => r.weight !== "nice" && ["missing", "partial"].includes(effectiveStrength(active.id, r.id))).length === 0 ? (
                          <span style={{ fontSize: 12.5, color: "var(--ag-ink-3)" }}>Every weighted requirement has evidence.</span>
                        ) : (
                          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                            {requirements
                              .filter((r) => r.weight !== "nice" && ["missing", "partial"].includes(effectiveStrength(active.id, r.id)))
                              .map((r) => (
                                <li key={r.id} className="ag-unevidenced">
                                  <span className={`ag-dot ${effectiveStrength(active.id, r.id)}`} />
                                  <span style={{ color: "var(--ag-ink-2)" }}>{r.text}</span>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  {active && (
                    <button
                      className="ag-btn ag-btn-primary"
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => {
                        patchReview(active.id, { status: "reviewed" }, { status: "reviewed" })
                        const next = candidates.find((c) => c.id !== active.id && reviews[c.id]?.status !== "reviewed")
                        if (next) setActiveCandidate(next.id)
                        else setStep("compare")
                      }}
                    >
                      Save and next candidate
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {role && step === "compare" && (() => {
            const shownCandidates = rankedCandidates
              .filter((c) => !hiddenCandidates.includes(c.id))
              .sort((a, b) =>
                compareSort === "name" ? a.full_name.localeCompare(b.full_name)
                  : compareSort === "must" ? (scores[b.id]?.must_have_hit ?? 0) - (scores[a.id]?.must_have_hit ?? 0)
                    : (scores[b.id]?.overall ?? 0) - (scores[a.id]?.overall ?? 0)
              )
            const shownReqs = (mustOnly ? requirements.filter((r) => r.weight === "must") : requirements)
              .slice()
              .sort((a, b) => WEIGHT_RANK.indexOf(a.weight) - WEIGHT_RANK.indexOf(b.weight))
            const cols = `minmax(240px, 1.4fr) repeat(${Math.max(shownCandidates.length, 1)}, minmax(160px, 1fr))`
            return (
              <>
                <div className="ag-screen-head">
                  <div>
                    <h1 className="ag-title">Every candidate, every<br />requirement, side by side.</h1>
                    <p className="ag-sub">
                      The matrix shows post call evidence. Coral cells are your overrides. Decide here; nothing is decided for you.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="ag-meta">{shortlisted} shortlisted</span>
                    <button className="ag-btn" onClick={() => setStep("screening")}>Back</button>
                    <button className="ag-btn ag-btn-primary" onClick={() => setStep("submission")} disabled={shortlisted === 0}>
                      Build submission
                    </button>
                  </div>
                </div>

                <div className="ag-legend">
                  <span className="ag-field-label" style={{ marginBottom: 0, marginRight: 4 }}>Legend</span>
                  <span><span className="ag-dot strong" /> Strong evidence — 1.0</span>
                  <span><span className="ag-dot transferable" /> Transferable — 0.7</span>
                  <span><span className="ag-dot partial" /> Partial — 0.4</span>
                  <span><span className="ag-dot missing" /> Missing — 0.0</span>
                  <span className="ag-legend-trailing">
                    <span className="ag-field-label" style={{ marginBottom: 0 }}>Sort</span>
                    <div className="ag-seg">
                      {([["score", "Score"], ["must", "Must-haves"], ["name", "Name"]] as const).map(([k, l]) => (
                        <button key={k} aria-pressed={compareSort === k} className={compareSort === k ? "on" : ""} onClick={() => setCompareSort(k)}>{l}</button>
                      ))}
                    </div>
                    <button className="ag-filter" aria-pressed={mustOnly} onClick={() => setMustOnly((v) => !v)}>Must-haves only</button>
                    {hiddenCandidates.length > 0 && (
                      <button className="ag-btn" onClick={() => setHiddenCandidates([])}>Restore {hiddenCandidates.length} hidden</button>
                    )}
                  </span>
                </div>

                <div className="ag-cmp-grid">
                  {shownCandidates.map((c, rank) => {
                    const s = scores[c.id]
                    const topRisk = requirements.find((r) => r.weight !== "nice" && effectiveStrength(c.id, r.id) === "missing")
                    return (
                      <div
                        className="ag-card ag-cmp-card"
                        key={c.id}
                        data-focused={focusedCandidate === c.id}
                        data-shortlisted={decisions[c.id] === "shortlist"}
                        tabIndex={0}
                        onMouseEnter={() => setFocusedCandidate(c.id)}
                        onFocus={() => setFocusedCandidate(c.id)}
                      >
                        <div className="ag-card-head" style={{ alignItems: "flex-start" }}>
                          <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                            <div className="ag-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(c.full_name)}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                                <span className="ag-meta">#{rank + 1}</span>
                                <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.full_name}</span>
                              </div>
                              <div className="ag-meta">{c.current_title || c.ref}</div>
                            </div>
                          </div>
                          <button
                            className="ag-icon-btn"
                            title={`Hide ${c.full_name} from the comparison`}
                            aria-label={`Hide ${c.full_name} from the comparison`}
                            onClick={() => setHiddenCandidates((h) => [...h, c.id])}
                          >
                            ×
                          </button>
                        </div>
                        <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            {reviews[c.id]?.status === "reviewed" && <span className="ag-reviewed inline">Call done</span>}
                            {s?.original_overall != null && Math.round(s.original_overall) !== Math.round(s.overall) && (
                              <span className="ag-delta-pill">{Math.round(s.original_overall)} → {Math.round(s.overall)}</span>
                            )}
                          </div>
                          {s && (
                            <>
                              <div className="ag-nutrition-top">
                                <span className="ag-field-label" style={{ marginBottom: 0, color: "var(--ag-ink-3)" }}>Overall fit</span>
                                <span className="ag-nutrition-score">{Math.round(s.overall)}</span>
                              </div>
                              <div className="ag-nutrition-rule" />
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
                              <div className="ag-nutrition-foot">
                                <span className="ag-fit-label">Must-have coverage</span>
                                <span className="ag-fit-num"><b>{s.must_have_hit}/{s.must_have_total}</b></span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span className="ag-conf-bars" title={`Confidence ${s.confidence_level} of 4`}>
                                  {[1, 2, 3, 4].map((n) => (
                                    <span key={n} className="ag-conf-bar" data-on={n <= s.confidence_level} style={{ height: 4 + n * 3 }} />
                                  ))}
                                </span>
                                <span className="ag-meta">{["", "LOW", "MEDIUM", "HIGH", "HIGH"][s.confidence_level] ?? "MEDIUM"} CONFIDENCE</span>
                              </div>
                            </>
                          )}
                          <div>
                            <span className="ag-field-label">Top risk</span>
                            <span className="ag-toprisk">
                              {topRisk ? `${topRisk.ref} unevidenced: ${topRisk.text}` : "No unmet must or important requirement."}
                            </span>
                          </div>
                          <div className="ag-seg" style={{ width: "100%" }}>
                            {["shortlist", "hold", "reject"].map((d) => (
                              <button key={d} style={{ flex: 1 }} className={decisions[c.id] === d ? "on" : ""} onClick={() => decide(c.id, d)}>{d}</button>
                            ))}
                          </div>
                          <button className="ag-btn ag-btn-secondary" style={{ width: "100%", justifyContent: "center" }} onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}>
                            Open full profile
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="ag-card" style={{ overflow: "hidden" }}>
                  <div className="ag-card-head">
                    <span className="ag-card-title">Requirement matrix</span>
                    <span className="ag-meta">{shownReqs.length} requirements × {shownCandidates.length} candidates</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: 240 + shownCandidates.length * 160 }}>
                      <div className="ag-mx-head" style={{ gridTemplateColumns: cols }}>
                        <div style={{ padding: "10px 16px" }}><span className="ag-field-label" style={{ marginBottom: 0 }}>Requirement</span></div>
                        {shownCandidates.map((c) => {
                          const s = scores[c.id]
                          return (
                            <button key={c.id} className="ag-mx-cand" onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}>
                              <span style={{ display: "flex", gap: 7, alignItems: "center", minWidth: 0 }}>
                                <span className="ag-avatar" style={{ width: 22, height: 22, fontSize: 9 }}>{initials(c.full_name)}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.full_name.split(" ")[0]}</span>
                              </span>
                              <span style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
                                <span className="ag-mx-score">{s ? Math.round(s.overall) : "—"}</span>
                                {s && <span className="ag-meta">{s.must_have_hit}/{s.must_have_total} must</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      {shownReqs.map((req, ri) => (
                        <div key={req.id} className="ag-mx-row" data-zebra={ri % 2 === 1} style={{ gridTemplateColumns: cols }}>
                          <div className="ag-mx-req">
                            <span style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
                              <span className="ag-meta">{req.ref}</span>
                              <span className="ag-mx-weight" data-must={req.weight === "must"}>{req.weight}</span>
                            </span>
                            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{req.text}</span>
                          </div>
                          {shownCandidates.map((c) => {
                            const strength = effectiveStrength(c.id, req.id)
                            const isOverride = Boolean(overrides[c.id]?.[req.id])
                            const ev = evidenceAt(c.id, req.id)
                            return (
                              <div
                                key={c.id + req.id}
                                className="ag-mx-cell"
                                data-override={isOverride}
                                title={ev?.quote ? `${ev.quote}${ev.source_cite ? ` — ${ev.source_cite}` : ""}` : strength}
                                onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}
                              >
                                <span style={{ display: "flex", gap: 7, alignItems: "center" }}>
                                  <span className={`ag-dot ${strength}`} />
                                  <span className="ag-mx-strength" data-missing={strength === "missing"}>{strength}</span>
                                </span>
                                {ev?.quote && <span className="ag-mx-quote">{ev.quote}</span>}
                                {isOverride && <span className="ag-mx-override">Recruiter override</span>}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="ag-decisions-bar">
                  <span className="ag-field-label">Decisions</span>
                  <span className="ag-decisions-tally">
                    {decisionTotals || "none yet"} · <b>{decisionCounts.undecided} undecided</b>
                  </span>
                  <span className="ag-grow" />
                  <span className="ag-kbd-hints">
                    <span className="ag-meta">Keyboard</span>
                    <span><kbd className="ag-kbd">S</kbd> shortlist</span>
                    <span><kbd className="ag-kbd">H</kbd> hold</span>
                    <span><kbd className="ag-kbd">R</kbd> reject</span>
                  </span>
                  <button className="ag-btn ag-btn-primary" onClick={() => setStep("submission")} disabled={shortlisted === 0}>
                    Continue to submission
                  </button>
                </div>
              </>
            )
          })()}

          {role && step === "submission" && (() => {
            const shortlistedList = rankedCandidates.filter((c) => decisions[c.id] === "shortlist")
            const heldList = rankedCandidates.filter((c) => decisions[c.id] === "hold")
            const snap = submissionResult?.snapshot ?? null
            const recipients = contacts.filter((c) => chosenContacts.includes(c.id))
            const musts = requirements.filter((r) => r.weight === "must")

            /**
             * One normalised shape, three containers. Before you send, it is
             * built from live state; after you send, it is read back out of
             * the frozen snapshot, so the preview stops being a guess and
             * becomes the thing the client actually received.
             */
            type Row = {
              key: string; ref: string; name: string; title: string; years: number | null; location: string
              overall: number; confidence: number; reviewed: boolean; narrative: string
              musts: Array<{ text: string; strength: string; quote: string | null }>
              gaps: string[]; probes: string[]; comp: string; availability: string
            }
            const rows: Row[] = snap
              ? snap.shortlisted.map((e) => ({
                  key: e.ref, ref: e.ref, name: e.full_name, title: e.current_title ?? "", years: e.years,
                  location: e.location ?? "", overall: e.overall, confidence: e.confidence_level,
                  reviewed: e.reviewed, narrative: e.narrative,
                  musts: e.strengths.map((s) => ({ text: s.requirement, strength: "strong", quote: s.quote })),
                  gaps: e.gaps.map((g) => g.requirement),
                  probes: e.probe_areas ?? [],
                  comp: e.salary_confirm ?? "", availability: e.availability ?? "",
                }))
              : shortlistedList.map((c) => {
                  const s = scores[c.id]
                  const rv = reviews[c.id]
                  return {
                    key: c.id, ref: c.ref, name: c.full_name, title: c.current_title ?? "", years: c.years,
                    location: c.location ?? "", overall: s?.overall ?? 0, confidence: s?.confidence_level ?? 2,
                    reviewed: rv?.status === "reviewed", narrative: rv?.notes ?? "",
                    musts: musts.map((r) => ({
                      text: r.text,
                      strength: effectiveStrength(c.id, r.id),
                      quote: evidenceAt(c.id, r.id)?.quote ?? null,
                    })),
                    gaps: requirements.filter((r) => effectiveStrength(c.id, r.id) === "missing").map((r) => r.text),
                    probes: Object.keys(reviews[c.id]?.call_answers ?? {}).length > 0
                      ? resolveProbes(Object.keys(reviews[c.id]!.call_answers!), requirements).map((p) => p.text)
                      : requirements
                          .filter((r) => r.weight !== "nice" && ["missing", "partial"].includes(effectiveStrength(c.id, r.id)))
                          .map((r) => r.text),
                    comp: c.salary_text ?? "", availability: rv?.availability ?? "",
                  }
                })

            return (
              <>
                <div className="ag-screen-head">
                  <div>
                    <h1 className="ag-title">
                      {shortlisted} candidate{shortlisted === 1 ? "" : "s"},<br />with the reasoning attached.
                    </h1>
                    <p className="ag-sub">
                      Choose what the client sees. Your reasoning travels with the shortlist, so the hiring manager can audit every judgement instead of trusting a number.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button className="ag-btn" onClick={() => setStep("compare")}>Back to compare</button>
                    <button
                      className="ag-btn ag-btn-primary"
                      onClick={() => generateSubmission(previewFormat)}
                      disabled={shortlisted === 0 || busy !== null}
                    >
                      {busy === "submission" ? <><span className="ag-spin" /> Sending</> : snap ? "✓ Submission sent" : "Send to client"}
                    </button>
                  </div>
                </div>

                {representAsk && (
                  <div className="ag-card" style={{ marginBottom: 16, borderColor: "var(--ag-warn)" }} role="alertdialog" aria-labelledby="rep-ask-title">
                    <div className="ag-card-body" style={{ padding: 18 }}>
                      <div id="rep-ask-title" style={{ fontWeight: 600, marginBottom: 6 }}>
                        {representAsk.refs.join(", ")} {representAsk.refs.length === 1 ? "has" : "have"} not agreed to be put forward.
                      </div>
                      <p className="ag-note" style={{ margin: "0 0 6px" }}>
                        The ask is on their rights page and they have not answered it. Unanswered is
                        not yes. You can go ahead anyway — that is your call to make, it is recorded
                        against your name in the audit log, and the candidate can still withdraw
                        later, which stops future submissions.
                      </p>
                      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                        <button
                          className="ag-btn ag-btn-primary"
                          disabled={busy !== null}
                          onClick={() => generateSubmission(representAsk.format, true)}
                        >
                          Send anyway — recorded against my name
                        </button>
                        <button className="ag-btn ag-btn-secondary" disabled={busy !== null} onClick={() => setRepresentAsk(null)}>
                          Wait for their answer
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {shortlisted === 0 ? (
                  <div className="ag-card">
                    <div className="ag-quiet">
                      Nothing shortlisted yet. Go back to compare and shortlist the candidates you want to submit.
                    </div>
                  </div>
                ) : (
                  <div className="ag-sub-grid">
                    <div className="ag-stack" style={{ minWidth: 0 }}>
                      <div className="ag-card">
                        <div className="ag-card-head">
                          <span className="ag-card-title">Client-facing preview</span>
                          <div className="ag-seg">
                            {(["document", "email", "portal"] as const).map((f) => (
                              <button key={f} aria-pressed={previewFormat === f} className={previewFormat === f ? "on" : ""} onClick={() => setPreviewFormat(f)}>
                                {f === "portal" ? "Portal link" : f === "email" ? "Email" : "Document"}
                              </button>
                            ))}
                          </div>
                          <span className="ag-meta">{(role.company || "client").toUpperCase()} · {role.ref}</span>
                        </div>
                        <div className="ag-card-body ag-stack" style={{ gap: 16 }}>
                          {snap && (
                            <div className="ag-frozen-note">
                              Frozen copy · generated as {submissionResult!.format} on{" "}
                              {new Date(snap.generated_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Later changes do not rewrite it.
                            </div>
                          )}

                          {previewFormat === "document" ? (
                            <div className="ag-cfp-head">
                              <div className="ag-portal-eyebrow">Shortlist · {role.title}</div>
                              <div className="ag-cfp-company">{role.company || "Your client"}</div>
                              {snap ? (
                                <p className="ag-cfp-intro-frozen">{snap.intro || "No introduction was written."}</p>
                              ) : (
                                <textarea
                                  className="ag-cfp-intro"
                                  rows={3}
                                  aria-label="Submission introduction"
                                  value={intro}
                                  onChange={(e) => setIntro(e.target.value)}
                                />
                              )}
                              <div className="ag-cfp-stats">
                                <span><span className="ag-cfp-stat-k">Reviewed</span><span className="ag-cfp-stat-v">{candidates.length}</span></span>
                                <span><span className="ag-cfp-stat-k">Shortlisted</span><span className="ag-cfp-stat-v">{rows.length}</span></span>
                                <span><span className="ag-cfp-stat-k">Must-haves</span><span className="ag-cfp-stat-v">{musts.length}</span></span>
                                <span><span className="ag-cfp-stat-k">Held</span><span className="ag-cfp-stat-v">{decisionCounts.hold}</span></span>
                              </div>
                            </div>
                          ) : (
                            /* Email and portal carry the greeting in their own
                             * chrome, so the dark cover would be a second header
                             * stacked on the one they already have. */
                            <div className="ag-intro-strip">
                              <span className="ag-field-label">Your introduction</span>
                              {snap ? (
                                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{snap.intro || "No introduction was written."}</p>
                              ) : (
                                <textarea
                                  className="ag-textarea"
                                  style={{ minHeight: 68 }}
                                  aria-label="Submission introduction"
                                  value={intro}
                                  onChange={(e) => setIntro(e.target.value)}
                                />
                              )}
                            </div>
                          )}

                          {previewFormat === "document" && rows.map((r, i) => (
                            <article className="ag-cfp-cand" key={r.key}>
                              <div className="ag-cfp-cand-head">
                                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                                  <div className="ag-avatar" style={{ width: 38, height: 38 }}>{initials(r.name)}</div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                      <span className="ag-meta">{String(i + 1).padStart(2, "0")}</span>
                                      <span style={{ fontSize: 14.5, fontWeight: 600 }}>{r.name}</span>
                                      {r.reviewed && <span className="ag-reviewed inline">Call done</span>}
                                    </div>
                                    <span className="ag-meta">{[r.title, r.years ? `${r.years} yrs` : ""].filter(Boolean).join(" · ")}</span>
                                  </div>
                                </div>
                                {disclosure.scores && (
                                  <div style={{ display: "flex", gap: 10, alignItems: "center", flex: "none" }}>
                                    <span className="ag-conf-bars" title={`Confidence ${r.confidence} of 4`}>
                                      {[1, 2, 3, 4].map((n) => (
                                        <span key={n} className="ag-conf-bar" data-on={n <= r.confidence} style={{ height: 4 + n * 3 }} />
                                      ))}
                                    </span>
                                    <span className={`ag-score ${tier(r.overall)}`} style={{ fontSize: 15 }}>{Math.round(r.overall)}</span>
                                  </div>
                                )}
                              </div>
                              <div className="ag-cfp-body">
                                {r.narrative ? (
                                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65 }}>{r.narrative}</p>
                                ) : (
                                  <p className="ag-note ag-note-quiet">
                                    No narrative yet. Your call notes from screening become this candidate&apos;s write up.
                                  </p>
                                )}
                                {disclosure.evidence && r.musts.length > 0 && (
                                  <div>
                                    <div className="ag-field-label">Must-have evidence</div>
                                    <div className="ag-stack" style={{ gap: 6 }}>
                                      {r.musts.map((m, j) => (
                                        <div key={j} className="ag-cfp-ev">
                                          <span className={`ag-dot ${m.strength}`} style={{ marginTop: 4 }} />
                                          <span style={{ fontWeight: 500, flex: "none", maxWidth: "40%" }}>{m.text}</span>
                                          {m.quote && <span className="ag-cfp-quote">— &ldquo;{m.quote}&rdquo;</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {disclosure.evidence && r.gaps.length > 0 && (
                                  <div>
                                    <div className="ag-field-label" style={{ color: "var(--ag-warn)" }}>Known gaps, stated plainly</div>
                                    <ul className="ag-cfp-probes">
                                      {r.gaps.slice(0, 4).map((g, j) => <li key={j}>{g}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {disclosure.probes && r.probes.length > 0 && (
                                  <div>
                                    <div className="ag-field-label">What to probe at interview</div>
                                    <ul className="ag-cfp-probes">
                                      {r.probes.slice(0, 3).map((p, j) => <li key={j}>{p}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {disclosure.logistics && (r.comp || r.location || r.availability) && (
                                  <div className="ag-cfp-logistics">
                                    {r.comp && <span><span className="ag-field-label" style={{ marginBottom: 2 }}>Comp</span>{r.comp}</span>}
                                    {r.location && <span><span className="ag-field-label" style={{ marginBottom: 2 }}>Location</span>{r.location}</span>}
                                    <span><span className="ag-field-label" style={{ marginBottom: 2 }}>Availability</span>{r.availability || "To confirm"}</span>
                                  </div>
                                )}
                              </div>
                            </article>
                          ))}

                          {previewFormat === "document" && (
                            <p className="ag-doc-legal">
                              This shortlist was prepared with AI-assisted evidence matching, and every score traces back to source CV content or to a recruiter override recorded against a named person. No candidate was rejected automatically. Final hiring decisions remain with {role.company || "the client"}. This document is confidential.
                            </p>
                          )}

                          {previewFormat === "email" && (
                            <div className="ag-cfp-cand">
                              <div className="ag-cfp-body">
                                <div className="ag-mail-head">
                                  <span className="ag-meta">To</span>
                                  <span>{recipients.length > 0 ? recipients.map((c) => c.email).join(", ") : "the hiring contact"}</span>
                                  <span className="ag-meta">Subject</span>
                                  <b>Shortlist: {role.title} — {rows.length} candidate{rows.length === 1 ? "" : "s"}</b>
                                </div>
                                <div className="ag-mail-body">
                                  <p style={{ marginTop: 0 }}>{snap?.intro || intro}</p>
                                  {rows.map((r, i) => (
                                    <div key={r.key} className="ag-mail-cand">
                                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                        {i + 1}. {r.name}{r.title ? <> — <span style={{ color: "var(--ag-ink-2)", fontWeight: 500 }}>{r.title}</span></> : null}
                                        {disclosure.scores && <span className="ag-meta"> · fit {Math.round(r.overall)}</span>}
                                      </div>
                                      {r.narrative && <p style={{ margin: "4px 0 8px" }}>{r.narrative}</p>}
                                      <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
                                        {disclosure.evidence && r.musts.filter((m) => m.strength === "strong").length > 0 && (
                                          <><b>Strengths:</b> {r.musts.filter((m) => m.strength === "strong").slice(0, 2).map((m) => m.text).join("; ")}.<br /></>
                                        )}
                                        {disclosure.probes && r.probes[0] && <><b>To probe:</b> {r.probes[0]}</>}
                                      </div>
                                    </div>
                                  ))}
                                  <p>Happy to walk through the ranking, or arrange first conversations directly.</p>
                                  <p style={{ marginBottom: 0 }}>Best,<br />{agencyName}</p>
                                </div>
                                <button
                                  className="ag-btn ag-btn-secondary"
                                  style={{ marginTop: 14 }}
                                  onClick={() => {
                                    const text = [
                                      `Shortlist: ${role.title} — ${rows.length} candidate${rows.length === 1 ? "" : "s"}`, "",
                                      snap?.intro || intro, "",
                                      ...rows.flatMap((r, i) => [
                                        `${i + 1}. ${r.name}${r.title ? ` — ${r.title}` : ""}${disclosure.scores ? ` (fit ${Math.round(r.overall)})` : ""}`,
                                        r.narrative,
                                        disclosure.probes && r.probes[0] ? `To probe: ${r.probes[0]}` : "",
                                        "",
                                      ]),
                                      "Happy to walk through the ranking, or arrange first conversations directly.", "",
                                      "Best,", agencyName,
                                    ].filter(Boolean).join("\n")
                                    navigator.clipboard?.writeText(text)
                                  }}
                                >
                                  Copy email text
                                </button>
                              </div>
                            </div>
                          )}

                          {previewFormat === "portal" && (
                            <div className="ag-stack" style={{ gap: 12 }}>
                              {submissionResult && submissionResult.links.length > 0 ? (
                                submissionResult.links.map((l) => (
                                  <div className="ag-link-row" key={l.url}>
                                    <span className="ag-meta">LINK</span>
                                    {/* Absolute, from the server. It used to be
                                        relative and prefixed with
                                        window.location.origin here, which after
                                        the product split would have handed the
                                        client a portal link on the recruiter's
                                        own domain. */}
                                    <code className="ag-link-url">{l.url}</code>
                                    <button className="ag-btn ag-btn-secondary" onClick={() => navigator.clipboard?.writeText(l.url)}>Copy</button>
                                  </div>
                                ))
                              ) : (
                                <p className="ag-meta" style={{ margin: 0 }}>
                                  {recipients.length === 0
                                    ? "Choose recipients on the right. Portal links are personal, one per named person."
                                    : `${recipients.length} link${recipients.length === 1 ? "" : "s"} will be minted when you send, one per recipient, each revocable on its own.`}
                                </p>
                              )}
                              <div className="ag-portal-mock">
                                <div className="ag-portal-top">
                                  <div>
                                    <div className="ag-portal-eyebrow">Shortlist · {role.company || "client"}</div>
                                    <div className="ag-portal-role">{role.title}</div>
                                  </div>
                                  <div className="ag-portal-mark">T</div>
                                </div>
                                <div className="ag-portal-glance">
                                  <div className="ag-field-label">At a glance</div>
                                  <div className="ag-portal-glance-grid">
                                    {rows.map((r, i) => (
                                      <div className="ag-portal-glance-card" key={r.key}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                          <div className="ag-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(r.name)}</div>
                                          <div>
                                            <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name.split(" ")[0]}</div>
                                            <div className="ag-meta">#{i + 1}</div>
                                          </div>
                                        </div>
                                        {disclosure.scores && <span className={`ag-score ${tier(r.overall)}`} style={{ fontSize: 15, textAlign: "center" }}>{Math.round(r.overall)}</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                {rows.map((r) => (
                                  <div className="ag-portal-cand" key={r.key}>
                                    <div className="ag-portal-cand-head">
                                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                        <div className="ag-avatar" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(r.name)}</div>
                                        <div>
                                          <div style={{ fontWeight: 600, fontSize: 16 }}>{r.name}</div>
                                          <div style={{ color: "var(--ag-ink-2)", fontSize: 13 }}>{[r.title, r.years ? `${r.years} years` : ""].filter(Boolean).join(" · ")}</div>
                                        </div>
                                      </div>
                                      {disclosure.scores && <span className={`ag-score ${tier(r.overall)}`}>{Math.round(r.overall)}</span>}
                                    </div>
                                    {r.narrative && <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6 }}>{r.narrative}</p>}
                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                      <span className="ag-btn ag-btn-coral" style={{ fontSize: 12 }}>Accept for interview</span>
                                      <span className="ag-btn ag-btn-secondary" style={{ fontSize: 12 }}>Ask a question</span>
                                      <span className="ag-btn" style={{ fontSize: 12 }}>See evidence map</span>
                                    </div>
                                  </div>
                                ))}
                                <div className="ag-portal-foot">
                                  <span>Powered by Tailr · evidence first matching</span>
                                  <span className="ag-meta">{recipients[0]?.full_name ? `V. ${recipients[0].full_name.toUpperCase()}` : "PER RECIPIENT"}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {notShortlisted.filter((c) => decisions[c.id] !== "hold").length > 0 && (
                        <div className="ag-card">
                          <div className="ag-card-head">
                            <span className="ag-card-title">Not shortlisted (internal record)</span>
                            <span className="ag-meta">never sent to the client</span>
                          </div>
                          <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                            {notShortlisted.filter((c) => decisions[c.id] !== "hold").map((c) => (
                              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div className="ag-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(c.full_name)}</div>
                                <div className="ag-grow">
                                  <div style={{ fontSize: 13, fontWeight: 500 }}>{c.full_name}</div>
                                  <div className="ag-meta">{c.current_title || c.ref}</div>
                                </div>
                                {scores[c.id] && <span className={`ag-score ${tier(scores[c.id].overall)}`} style={{ fontSize: 14 }}>{Math.round(scores[c.id].overall)}</span>}
                                <span className="ag-pill">{decisions[c.id] ?? "undecided"}</span>
                              </div>
                            ))}
                            <p className="ag-meta" style={{ margin: 0 }}>
                              These candidates, and the reason each was not submitted, stay in the audit log. Nothing about them reaches the client.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="ag-sub-side">
                      <div className="ag-card">
                        <div className="ag-card-head"><span className="ag-card-title">What the client sees</span></div>
                        <div className="ag-card-body ag-stack" style={{ gap: 0 }}>
                          {([
                            ["scores", "Fit scores"],
                            ["evidence", "Must-have evidence"],
                            ["probes", "Probe areas"],
                            ["notes", "Your call notes"],
                            ["logistics", "Comp and logistics"],
                          ] as const).map(([key, label]) => (
                            <button
                              key={key}
                              role="switch"
                              aria-checked={disclosure[key]}
                              className="ag-toggle-row"
                              disabled={Boolean(snap)}
                              onClick={() => setDisclosure((d) => ({ ...d, [key]: !d[key] }))}
                            >
                              <span style={{ fontSize: 12.5 }}>{label}</span>
                              <span className="ag-switch" data-on={disclosure[key]}><span className="ag-switch-knob" /></span>
                            </button>
                          ))}
                          <p className="ag-meta" style={{ margin: "10px 0 0" }}>
                            {snap
                              ? "Locked. These choices were written into the submission when you sent it."
                              : "Written into the submission when you send, so what the client received can never change afterwards."}
                          </p>
                        </div>
                      </div>

                      {heldList.length > 0 && (
                        <div className="ag-card">
                          <div className="ag-card-head"><span className="ag-card-title">Held back</span></div>
                          <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                            {heldList.map((c) => (
                              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  <span className="ag-avatar" style={{ width: 22, height: 22, fontSize: 9 }}>{initials(c.full_name)}</span>
                                  <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.full_name}</span>
                                </span>
                                {scores[c.id] && <span className="ag-audit-val">{Math.round(scores[c.id].overall)}</span>}
                              </div>
                            ))}
                            <p className="ag-note">
                              Held candidates stay in the role, visible to you only.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="ag-card">
                        <div className="ag-card-head">
                          <span className="ag-card-title">Who is receiving this</span>
                          <span className="ag-meta">portal only</span>
                        </div>
                        <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                          {contacts.length === 0 && (
                            <span style={{ fontSize: 12.5, color: "var(--ag-ink-3)" }}>No client contacts yet. Add the hiring manager below.</span>
                          )}
                          {contacts.map((contact) => (
                            <label key={contact.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={chosenContacts.includes(contact.id)}
                                onChange={(e) => setChosenContacts((prev) => (e.target.checked ? [...prev, contact.id] : prev.filter((id) => id !== contact.id)))}
                              />
                              <span className="ag-grow" style={{ fontSize: 12.5, minWidth: 0 }}>
                                {contact.full_name || contact.email}
                                <span className="ag-meta" style={{ display: "block" }}>{contact.company}</span>
                              </span>
                            </label>
                          ))}
                          <div className="ag-stack" style={{ gap: 8, borderTop: "1px solid var(--ag-border)", paddingTop: 10 }}>
                            <input className="ag-input" placeholder="Company" value={newContact.company} onChange={(e) => setNewContact({ ...newContact, company: e.target.value })} />
                            <input className="ag-input" placeholder="Name" value={newContact.full_name} onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })} />
                            <input className="ag-input" placeholder="Email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                            <button className="ag-btn ag-btn-secondary" onClick={createContact}>Add contact</button>
                          </div>
                        </div>
                      </div>

                      {/* Links already out in the world. Separate from the
                          recipient picker above, which is about the NEXT send:
                          this is the only place a shortlist that reached the
                          wrong inbox can be pulled back. */}
                      <SentLinks roleId={roleId} />

                      <div className="ag-card">
                        <div className="ag-card-head"><span className="ag-card-title">Audit trail</span></div>
                        <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                          <div><div className="ag-field-label">Role</div><div className="ag-audit-val">{role.ref}</div></div>
                          <div><div className="ag-field-label">Recruiter</div><div className="ag-audit-val">You</div></div>
                          <div><div className="ag-field-label">Requirements</div><div className="ag-audit-val">{requirements.length}</div></div>
                          <div><div className="ag-field-label">Overrides</div><div className="ag-audit-val">{candidates.reduce((n, c) => n + Object.keys(overrides[c.id] ?? {}).length, 0)}</div></div>
                          <p className="ag-note">
                            Every score, override and decision on this role is logged against your name.
                          </p>
                        </div>
                      </div>

                      <div className="ag-card">
                        <div className="ag-card-head">
                          <span className="ag-card-title">Close this role</span>
                          <span className="ag-pill">{role.status}</span>
                        </div>
                        <div className="ag-card-body">
                          <p style={{ fontSize: 12.5, color: "var(--ag-ink-2)", margin: 0 }}>
                            Closing starts the retention clock on every candidate attached to it. Their CV data is erased once the window passes, and the closure is audit logged. Reopening clears the clock.
                          </p>
                          <div style={{ marginTop: 12 }}>
                            {closureNote && (
                              <p className="ag-note" role="status">{closureNote}</p>
                            )}
                            {role.status === "closed" ? (
                              <button className="ag-btn ag-btn-secondary" onClick={() => setRoleStatus("open")}>Reopen role</button>
                            ) : (
                              <button className="ag-btn ag-btn-primary" onClick={() => setRoleStatus("closed")}>Close role and start retention</button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/*
            PUBLISH FOR MATCHING — role-level, not step-level.

            Built to Figma 10:2 (the live card) and 118:2 (the states it did
            not cover), but deliberately NOT in 10:2's intake rail. A role
            opens on its furthest step — candidates if any exist, else parse
            if requirements do — and publishing needs requirements, so an
            intake-only card rendered solely in the one state where it says
            "not yet" and was invisible in every state where it could be used.
            There was no button, exactly as reported. Publishing is one
            sourcing decision about the role, so it sits below the step
            content on every step.

            The NOT YET state still exists, because requirements can genuinely
            be absent and the scan refuses to run without them — an enabled
            button then could only ever produce an error.

            No count anywhere in this card. Scan liveness is shown instead:
            without it "found nobody", "found people who haven't applied" and
            "the scan is broken" are indistinguishable.
          */}
          {role && (
          <div className="ag-card" style={{ marginTop: 20 }}>
            <div className="ag-card-head">
              <span className="ag-card-title">Publish for Tailr matching</span>
              <span className="ag-pill">
                {requirements.length === 0
                  ? "Not yet"
                  : matching?.enabled
                    ? "Matching live"
                    : matching
                      ? "Paused"
                      : "Matching off"}
              </span>
              <span className="ag-pill">Audit logged</span>
            </div>
            <div className="ag-card-body">
              {requirements.length === 0 ? (
                <>
                  <p className="ag-note" style={{ marginTop: 0 }}>
                    Matching scores people against this role&apos;s requirements, so it needs
                    them parsed first. Extract them above and this turns on.
                  </p>
                  <button className="ag-btn ag-btn-secondary" style={{ marginTop: 12 }} disabled>
                    Parse requirements first
                  </button>
                  <p className="ag-note" style={{ marginTop: 8 }}>
                    Nothing has been published and nobody has been scanned.
                  </p>
                </>
              ) : (
                <>
                  <p className="ag-note" style={{ marginTop: 0 }}>
                    There is no job board. Tailr scans each consumer user&apos;s own evidence
                    — on their side — and quietly nudges the people who fit. Applying is
                    their consent; until someone applies, you see nobody.
                  </p>

                  <label className="ag-label" htmlFor="ag-min-score" style={{ marginTop: 14 }}>
                    Minimum score
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      id="ag-min-score"
                      className="ag-input"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      style={{ width: 90 }}
                      value={minScoreDraft}
                      onChange={(e) => setMinScoreDraft(Number(e.target.value))}
                      disabled={busy === "matching"}
                    />
                    <span className="ag-meta">
                      as scored on arrival — before review or overrides
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button
                      className={matching?.enabled ? "ag-btn ag-btn-secondary" : "ag-btn ag-btn-coral"}
                      onClick={() => setMatchingEnabled(!matching?.enabled)}
                      disabled={busy === "matching"}
                    >
                      {busy === "matching" && <span className="ag-spin" />}
                      {matching?.enabled
                        ? "Pause matching"
                        : matching
                          ? "Resume matching"
                          : "Publish for matching"}
                    </button>
                    {matching?.enabled && (
                      <button
                        className="ag-btn ag-btn-secondary"
                        onClick={() => setMatchingEnabled(true)}
                        disabled={busy === "matching" || minScoreDraft === matching.minScore}
                      >
                        Update score
                      </button>
                    )}
                  </div>

                  <p className="ag-note" style={{ marginTop: 10 }}>
                    {matching?.enabled ? (
                      <>
                        Tailr is scanning on the candidate&apos;s side.{" "}
                        {matching.scanQueued
                          ? "A scan is queued now."
                          : matching.lastScanAt
                            ? `Last scan ${new Date(matching.lastScanAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
                            : "The first scan runs shortly."}
                        {matching.nextScanAllowedAt && new Date(matching.nextScanAllowedAt) > new Date() && (
                          <>
                            {" "}Next scan available{" "}
                            {new Date(matching.nextScanAllowedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            . Changing the score applies to that scan — it does not buy an
                            extra one.
                          </>
                        )}
                      </>
                    ) : matching ? (
                      "Paused — the role has stopped being shown to anyone new. People it already reached keep what they were shown, and can still apply."
                    ) : (
                      "Or keep it direct-sourced — add candidates yourself in step 03."
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
          )}
        </div>
      </main>
    </>
  )
}

/**
 * Links already sent, and the control to withdraw one.
 *
 * `submission_recipients.revoked_at` and the portal's refusal of it have both
 * existed since migration 4; nothing could ever set it, so a shortlist link
 * forwarded to the wrong inbox could not be withdrawn from inside Tailr while
 * the screen above promised each link was "revocable on its own".
 *
 * "Live" here is computed server-side from the same two conditions the portal
 * enforces (not revoked, not expired), so this list cannot tell a recruiter a
 * link is dead while it still opens.
 *
 * Revoking asks first: it cannot be undone, and the recipient is a real person
 * who will simply find the link stops working.
 */
/** Same shape as the clients screen's shortDate, so sent links and client
 *  access read the same way. Invalid dates fall back rather than render
 *  "Invalid Date" at a recruiter about to revoke something. */
function linkDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

function SentLinks({ roleId }: { roleId: string }) {
  const [rows, setRows] = useState<Array<{
    id: string
    company: string
    fullName: string
    sentAt: string
    expiresAt: string
    revokedAt: string | null
    firstOpenedAt: string | null
    live: boolean
  }> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/recipients`)
      if (!res.ok) {
        setRows([])
        return
      }
      const body = await res.json()
      setRows(Array.isArray(body?.recipients) ? body.recipients : [])
    } catch {
      setRows([])
    }
  }, [roleId])

  useEffect(() => {
    load()
  }, [load])

  async function revoke(id: string) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body?.error === "string" ? body.error : "Could not revoke that link.")
        return
      }
      setConfirming(null)
      await load()
    } catch {
      setError("Could not revoke that link.")
    } finally {
      setBusy(null)
    }
  }

  // Nothing sent yet: the picker above already explains what will happen, so a
  // second empty card here would only be noise.
  if (rows !== null && rows.length === 0) return null

  return (
    <div className="ag-card">
      <div className="ag-card-head">
        <span className="ag-card-title">Links you have sent</span>
        <span className="ag-grow" />
        <span className="ag-pill">Audit logged</span>
      </div>
      <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
        {rows === null ? (
          <span className="ag-meta">Loading…</span>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="ag-sentlink">
              <div className="ag-grow" style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5 }}>
                  {r.fullName || r.company}
                  {!r.live && (
                    <span className="ag-meta" style={{ marginLeft: 6 }}>
                      {r.revokedAt ? "· revoked" : "· expired"}
                    </span>
                  )}
                </div>
                <span className="ag-meta" style={{ display: "block" }}>
                  {r.company}
                  {r.firstOpenedAt ? " · opened" : " · not opened yet"}
                </span>
                {/* Two links to the same person are otherwise identical rows.
                    Revoking is irreversible, so the row has to say which link
                    it is: when it went out, and until when it works. */}
                <span className="ag-meta" style={{ display: "block" }}>
                  Sent {linkDate(r.sentAt)}
                  {r.live
                    ? ` · expires ${linkDate(r.expiresAt)}`
                    : r.revokedAt
                      ? ` · revoked ${linkDate(r.revokedAt)}`
                      : ` · expired ${linkDate(r.expiresAt)}`}
                </span>
              </div>
              {r.live &&
                (confirming === r.id ? (
                  <span className="ag-stack" style={{ gap: 6 }}>
                    <span className="ag-meta">Revoke? The link stops working immediately.</span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button
                        className="ag-btn ag-btn-primary"
                        disabled={busy === r.id}
                        onClick={() => revoke(r.id)}
                      >
                        {busy === r.id ? "Revoking…" : "Yes, revoke"}
                      </button>
                      <button className="ag-btn ag-btn-secondary" onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </span>
                  </span>
                ) : (
                  <button className="ag-btn ag-btn-secondary" onClick={() => setConfirming(r.id)}>
                    Revoke
                  </button>
                ))}
            </div>
          ))
        )}
        {error && <span className="ag-meta" style={{ color: "var(--ag-coral-text)" }}>{error}</span>}
        <span className="ag-meta">
          Revoking kills one person&apos;s link. It never deletes the record of what they were
          sent, and never touches the other recipients.
        </span>
      </div>
    </div>
  )
}
