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
import { AgencySwitcher } from "@/components/agency/agency-switcher"
import { AgencyNav } from "@/components/agency/agency-nav"
import { useRouter } from "next/navigation"
import { PROBE_LIBRARY, gapProbeText, resolveProbes, type ProbeQuestion } from "@/lib/agency/probes"
import { trailLine, type TrailEvent, type WrittenQuestion } from "@/lib/agency/call-trail"
import { PANE_STEPS, WORKFLOW_STEPS, stepLabel, stepNumber, type PaneStepKey, isSourcingStep } from "@/lib/agency/steps"
import { STRENGTHS, strengthWeightLabel } from "@/lib/agency/strengths"
import { RoleHeader, announceRoleChanged } from "@/components/agency/role-header"
import { BriefChip, useBriefStatus, type BriefStatusPayload } from "@/components/agency/brief-chip"
import { BriefEditor } from "@/components/agency/brief-editor"
import { MatchingWindow, type PoolPerson } from "@/components/agency/matching-window"
import { RecommendationPanel } from "@/components/agency/recommendation-panel"
import { useRecommendation } from "@/components/agency/use-recommendation"
import { DecisionSlot } from "@/components/agency/decision-slot"
import { ShortlistRail, ShortlistBar, type ShortlistEntry } from "@/components/agency/shortlist-rail"
import { countWord, countWordCap } from "@/components/agency/count-word"
import { Hint, RECRUITER_HINTS } from "@/components/agency/hint"
import { ShortlistStages } from "@/components/agency/shortlist-stages"
import { AdjustedPill, ConfidenceBars, FitHint, ScoreBreakdown } from "@/components/agency/score-parts"
import {
  PrintPortal,
  SubmissionDocument,
  SubmissionPreview,
  SubmissionProgress,
  printShortlistDocument,
  type DeliveryRow,
  type SubmissionRow,
} from "@/components/agency/submission-parts"
import { roleLandingPath, type PhaseKey } from "@/lib/agency/phases"
import {
  ArrowUpRight, Banknote, Briefcase, ChevronUp, FileText,
  Flame, Highlighter, MapPin, Tag, Target, Users,
} from "lucide-react"
import { errorMessage } from "@/lib/error-message"

type Step = PaneStepKey

interface Requirement { id: string; ref: string; text: string; weight: "must" | "important" | "nice" }
interface Constraint { id: string; ref: string; text: string; kind: string }
interface Role { id: string; ref: string; title: string; company: string; company_context: string; salary_band: string; location: string; seniority: string; jd_raw: string; recruiter_notes: string; status: string; owner_id: string | null; planned_rounds?: number | null; start_target?: string; contact_id?: string | null }
interface ClientOption { contactId: string; company: string; fullName: string }
interface MatchedPerson { recommendationId: string; name: string; headline: string; band: string; evidence: Array<{ requirement_ref: string; strength: string; quote: string | null }>; state: string; invitedAt: string | null; appliedAt: string | null }
interface Candidate { id: string; ref: string; full_name: string; current_title: string; years: number | null; location: string; salary_text?: string; source?: string; source_detail?: string; cv_storage_path?: string | null; parse_status: string; duplicate_of: string | null }
/**
 * One normalised shape, three containers. Before you send it is built from
 * live state; after you send it is read back out of the frozen snapshot, so
 * the preview stops being a guess and becomes the thing the client received.
 *
 * It lives at module scope because the value built from it is memoised: it
 * used to be declared and rebuilt inside the submission pane's IIFE, which
 * meant every keystroke in the introduction rebuilt every row.
 */

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
interface Disclosure { scores: boolean; evidence: boolean; probes: boolean; notes: boolean; logistics: boolean; cv: boolean }
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

interface Review { candidate_id: string; status: string; communication: number | null; motivation: number | null; availability: string; salary_confirm: string; notice_period: string; notes: string; call_answers?: Record<string, string>; call_trail?: TrailEvent[] }
interface Evidence { candidate_id: string; requirement_id: string; strength: string; quote: string | null; source_cite?: string }

type Strength = "strong" | "transferable" | "partial" | "missing"
const GROUPS: Array<{ weight: "must" | "important" | "nice"; label: string; hint: string }> = [
  // Frame 41 (approved 9 Oct 2026): what each level actually does to the
  // score — WEIGHT_MULTIPLIER in lib/agency/strengths.ts. The old lines said
  // "zero here is a hard fail" (nothing is ever rejected) and "never
  // subtracts" (a missing nice-to-have does lower coverage, a little).
  { weight: "must", label: "Must have", hint: "Counts 3× toward requirement coverage. A must-have with no evidence is flagged as a gap to ask about, never an automatic rejection." },
  { weight: "important", label: "Important", hint: "Counts 2×. Missing evidence lowers the score; it is not flagged on its own." },
  { weight: "nice", label: "Nice to have", hint: "Counts 1×, the least. A gap here moves the score only a little." },
]

/** The levels a gap answer can set (board 40). "Still missing" is an override too. */
const GAP_LEVELS: Array<[Strength, string]> = [
  ["strong", "Strong"],
  ["transferable", "Transferable"],
  ["partial", "Partial"],
  ["missing", "Still missing"],
]

/** Step 01, frame 43 (approved 13 Oct 2026): what used to narrate the
 *  intake as notes, a principle card and the brief editor's lines. */
const INTAKE_EXPLAINED = (
  <>
    <span className="ag-hint-block">Extraction fills empty intake fields from the JD. It never overwrites what you typed or touches your notes, and nothing is parsed until you press Extract.</span>
    <span className="ag-hint-block">Every later score points back to this JD or your notes; where there is no proof it shows MISSING.</span>
    <span className="ag-hint-block">The role runs on the terms now; the client&rsquo;s approval is not a gate. Sending the terms is v1, signed by you, and they read it in their workspace.</span>
    <span className="ag-hint-block">Any change — from either side, or a new JD file — is a new version the other side approves again, and you see what changed.</span>
  </>
)

/** Step 04, frame 43: what the subtitle used to carry. */
const SCREENING_EXPLAINED = (
  <>
    <span className="ag-hint-block">Overriding a strength rescores the candidate immediately.</span>
    <span className="ag-hint-block">Every change is attributed to you in the audit trail.</span>
    <span className="ag-hint-block">Written questions and their answers never change the CV score; only a level you choose under a gap question does.</span>
  </>
)

/** Step 02, frame 43: the weighting model card and the constraints footnote. */
const WEIGHTING_EXPLAINED = (
  <>
    <span className="ag-hint-block">The fit score is requirement coverage 45%, evidence strength 25%, seniority calibration 10%, context fit 10% and confidence 10%.</span>
    <span className="ag-hint-block">Constraints are filters: a candidate outside one gets a flag, not a lower score.</span>
  </>
)

/** What happens when a CV is added — board 39 moved it from a card into a hint. */
const ADD_EXPLAINED = (
  <>
    <span className="ag-hint-block">1. The CV is read and mapped against every requirement.</span>
    <span className="ag-hint-block">2. Each claim carries a verbatim quote, or shows MISSING.</span>
    <span className="ag-hint-block">3. The score is computed on the server, never in your browser.</span>
    <span className="ag-hint-block">4. The candidate is told your agency is considering them, within your notice window.</span>
  </>
)

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
  // The latest decisions, readable after an await. applyDecisions and
  // addMany run after "+ The ones it recommends" has waited several seconds
  // on the recommendation; the render-time closure they were created in is
  // stale by then, and a snapshot taken from it would undo a hold the
  // recruiter placed while it read. The ref is written on every render.
  const decisionsRef = useRef<Record<string, string | null>>({})
  decisionsRef.current = decisions
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [overrides, setOverrides] = useState<Record<string, Record<string, Strength>>>({})
  const [step, setStep] = useState<Step>("intake")
  const [activeCandidate, setActiveCandidate] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Who can own this role: active, non-viewer members. Loaded once, lazily —
  // the whole team list is small and the control renders from it.
  const [callerRole, setCallerRole] = useState<string>("viewer")
  // The client contacts this role can be for: the brief is the recruiter's
  // job description now, and naming the hiring manager at intake is what
  // puts the role in their workspace and their name on the header.
  const [clients, setClients] = useState<ClientOption[]>([])
  useEffect(() => {
    fetch("/api/agency/clients")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => Array.isArray(b?.clients) && setClients(b.clients as ClientOption[]))
      .catch(() => {})
  }, [])
  /** Which of the three phases this role is in. null until loaded — the rail
   *  renders nothing rather than guessing "Shortlist" mid-fetch. */
  const [phase, setPhase] = useState<PhaseKey | null>(null)
  /** Step 07's optional extras (board 34). The workspace delivery is not
   *  one of them — it always happens. The summary email is on by default. */
  const [extras, setExtras] = useState({ email: true, pdf: false, link: false })
  const [addingContact, setAddingContact] = useState(false)
  // Removing a candidate added in error. Confirmed, because it is a real
  // erasure and not a hide (22 Aug walk-through).
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [representAsk, setRepresentAsk] = useState<{ refs: string[]; format: string } | null>(null)
  /** The deliberate second send. Never a default; see the send bar below. */
  const [resendAsk, setResendAsk] = useState(false)
  const [jdUrl, setJdUrl] = useState("")
  const [extractResult, setExtractResult] = useState<{ requirements: number; constraints: number; filled: string[] } | null>(null)
  const [submissionResult, setSubmissionResult] = useState<{ format: string; entries: number; links: Array<{ url: string; contact_id?: string }>; delivery: DeliveryRow[] | null; snapshot: Snapshot | null } | null>(null)
  const [contacts, setContacts] = useState<Array<{ id: string; company: string; email: string; full_name: string; has_workspace?: boolean }>>([])
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
  // The matched list (5 Sep 2026): people who match this role AND chose to
  // be seen, from one service-role RPC. Nothing here is a count of anyone
  // who did not choose that; they stay in the bucket.
  const [matched, setMatched] = useState<{ people: MatchedPerson[]; bucket: string } | null>(null)
  const [inviting, setInviting] = useState<string | null>(null)
  /* The matching window (frame 16). Publishing opens it; it can be reopened
   * from the card, so the scan is a place rather than a pill. */
  const [matchWindow, setMatchWindow] = useState(false)
  /* The pool: everyone who may be shown, not only those a scan accepted.
     Fetched when the window opens — it is a read nobody needs until then. */
  const [pool, setPool] = useState<{ people: PoolPerson[] } | null>(null)
  useEffect(() => {
    if (!matchWindow) return
    let live = true
    ;(async () => {
      try {
        const res = await fetch(`/api/agency/roles/${roleId}/matching/pool`)
        if (!live || !res.ok) return
        const body = (await res.json()) as { people?: PoolPerson[] }
        setPool({ people: Array.isArray(body.people) ? body.people : [] })
      } catch {
        /* the panel says "reading the pool" and stops; the rest of the
           window is unaffected, the same rule the ladder follows */
      }
    })()
    return () => { live = false }
  }, [matchWindow, roleId])
  const loadMatched = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/matching/people`)
      if (!res.ok) return
      setMatched((await res.json()) as { people: MatchedPerson[]; bucket: string })
    } catch {
      /* the panel shows nothing rather than a guess */
    }
  }, [roleId])
  useEffect(() => {
    if (step === "candidates" && matching?.enabled) void loadMatched()
  }, [step, matching?.enabled, loadMatched])
  // Publishing from inside the step should fill the list without a reload.
  useEffect(() => {
    if (matching?.enabled && matched === null) void loadMatched()
  }, [matching?.enabled, matched, loadMatched])
  async function invite(recommendationId: string) {
    setInviting(recommendationId)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/matching/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not send the invitation.")
        return
      }
      await loadMatched()
    } catch {
      setError("Could not send the invitation.")
    } finally {
      setInviting(null)
    }
  }
  /**
   * Take an invitation back (22 Sep 2026). The person stays on the matched
   * list — they still match and still chose to be seen — but the "a recruiter
   * asked about you" card leaves their /found page. Refused once they have
   * applied, by the route.
   */
  async function withdrawInvite(recommendationId: string) {
    setInviting(recommendationId)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/matching/invite`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not take that invitation back.")
        return
      }
      await loadMatched()
    } catch {
      setError("Could not take that invitation back.")
    } finally {
      setInviting(null)
    }
  }
  const [discarding, setDiscarding] = useState(false)
  /**
   * The role's own brief (frame 36, approved 2 Oct 2026): step 01 is "Role &
   * brief", and the terms with the client sit beside the job. One fetch feeds
   * the chip under the header and the terms card. Re-read after any brief
   * write, because the role follows its brief — planned rounds and the
   * interview rules change with it.
   */
  const briefStatusInitial = useBriefStatus(roleId, "recruiter")
  const [briefStatus, setBriefStatus] = useState<BriefStatusPayload | null | "error">(null)
  const [startingBrief, setStartingBrief] = useState(false)
  useEffect(() => {
    if (briefStatusInitial) setBriefStatus(briefStatusInitial)
  }, [briefStatusInitial])
  const roleBriefId = briefStatus && briefStatus !== "error" ? (briefStatus.status?.briefId ?? null) : null
  async function reloadBrief() {
    try {
      const again = await fetch(`/api/agency/roles/${roleId}/brief`)
      if (again.ok) setBriefStatus((await again.json()) as BriefStatusPayload)
      // The role follows its brief: planned rounds and the rules move with it.
      const fresh = await fetch(`/api/agency/roles/${roleId}`)
      if (fresh.ok) {
        const b = await fresh.json()
        if (b.role) setRole(b.role)
      }
      announceRoleChanged()
    } catch {
      /* the next load re-reads it */
    }
  }
  async function startBrief() {
    setStartingBrief(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/brief`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return setError(typeof body?.error === "string" ? body.error : "Could not start the terms.")
      await reloadBrief()
    } catch {
      setError("Could not start the terms.")
    } finally {
      setStartingBrief(false)
    }
  }
  /**
   * Discard the role. The reason is required by both the route and the DB
   * constraint, so it is asked for here rather than sent empty and refused.
   */
  async function discardRole() {
    const reason = window.prompt(
      "Discard this role? It leaves your lists; the record stays for the audit.\n\nWhy are you discarding it?"
    )
    if (reason === null) return
    if (!reason.trim()) {
      setError("Say why this role is being discarded.")
      return
    }
    setDiscarding(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "Could not discard this role.")
        return
      }
      router.push("/agencies")
    } catch {
      setError("Could not discard this role. Nothing has changed.")
    } finally {
      setDiscarding(false)
    }
  }
  const [probePicker, setProbePicker] = useState(false)
  // Questions the recruiter WROTE (frame 37, approved 2 Oct 2026): for every
  // candidate on the role — on every call's list automatically — or for one
  // call. Removed ones are kept: they still label answers already given.
  const [written, setWritten] = useState<WrittenQuestion[]>([])
  const [newQuestion, setNewQuestion] = useState("")
  const [newScope, setNewScope] = useState<"call" | "role">("call")
  const [addingQuestion, setAddingQuestion] = useState(false)
  const loadWritten = useCallback(async () => {
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/screening-questions`)
      if (res.ok) setWritten(((await res.json()) as { questions?: WrittenQuestion[] }).questions ?? [])
    } catch {
      /* the list stays as it was; the next add re-reads it */
    }
  }, [roleId])
  useEffect(() => {
    void loadWritten()
  }, [loadWritten])
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null)
  const [disclosure, setDisclosure] = useState<Disclosure>({ scores: true, evidence: true, probes: true, notes: false, logistics: true, cv: true })
  /*
   * TYPING MUST NOT RE-RENDER THE SCREEN (19 Sep 2026).
   *
   * `intro` and `paste` were component state, so every keystroke in the
   * client introduction or the CV paste box re-rendered this whole component
   * — 3,045 lines and seven panes — to update one textarea. The derived lists
   * were already memoised against exactly this (see step 07's note below), so
   * the remaining cost was rebuilding the JSX itself, on every character.
   *
   * Refs instead. This is the pattern the probe answers already use on the
   * screening step (`defaultValue` + a handler that does not set state), so
   * the screen now behaves the same way wherever somebody types. The value is
   * read at submit time, which is the only moment it is needed.
   *
   * `pasteLen` is state ON PURPOSE and the one exception: the Add candidate
   * button is disabled until there are 100 characters, so that one number has
   * to reach React. It changes at most twice per paste — crossing the
   * threshold and back — rather than once per keystroke.
   */
  const introRef = useRef("")
  /*
   * `intro` still exists as state because the email and document previews
   * render it live as you type, and losing that would be a silent feature
   * loss dressed as a performance win. What changed is the FREQUENCY: the ref
   * holds every keystroke, and state catches up 200ms after you stop. Typing
   * is smooth, the preview still follows, and the component re-renders a few
   * times per sentence instead of once per character.
   */
  const [intro, setIntro] = useState("")
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onIntroChange = useCallback((value: string) => {
    introRef.current = value
    if (introTimer.current) clearTimeout(introTimer.current)
    introTimer.current = setTimeout(() => setIntro(value), 200)
  }, [])
  useEffect(() => () => { if (introTimer.current) clearTimeout(introTimer.current) }, [])
  /** The default introduction, set once on load and never over a draft. */
  const seedIntro = useCallback((text: string) => {
    if (introRef.current) return
    introRef.current = text
    setIntro(text)
  }, [])
  const pasteRef = useRef("")
  const [pasteLen, setPasteLen] = useState(0)
  // The compare board advertises S / H / R in the handoff; they act on the
  // card under the pointer or keyboard focus, falling back to the top ranked
  // candidate with no decision yet.
  const [focusedCandidate, setFocusedCandidate] = useState<string | null>(null)
  const [compareSort, setCompareSort] = useState<"score" | "must" | "name">("score")
  // Step 05 has two tabs. The matrix is the default and stays the default:
  // the recommendation is a second reading of the same material, never a
  // replacement for the board the decisions are made on.
  // Frame 45: cards and the matrix print the same numbers, so they are two
  // views, not one long page. The choice is remembered per browser; with no
  // choice yet, six or more candidates open on the matrix.
  const [compareTabChoice, setCompareTabChoice] = useState<"cards" | "matrix" | "reco" | null>(null)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("ag-cmp-view")
      if (v === "cards" || v === "matrix") setCompareTabChoice(v)
    } catch {}
  }, [])
  const compareTab = compareTabChoice ?? (candidates.length >= 6 ? "matrix" : "cards")
  const setCompareTab = (t: "cards" | "matrix" | "reco") => {
    setCompareTabChoice(t)
    if (t !== "reco") {
      try { window.localStorage.setItem("ag-cmp-view", t) } catch {}
    }
  }
  // The compare filter bar (frame 37, 2 Oct 2026): three labelled dropdowns.
  // All VIEW controls — nothing is hidden from the record, nothing decided.
  const [reqFilter, setReqFilter] = useState<"all" | "must" | "must_important">("all")
  const [candFilter, setCandFilter] = useState<"all" | "undecided" | "shortlist" | "hold" | "reject" | "called">("all")
  // Remembered per role, on this browser only. Storage can be blocked or
  // empty; the board must work without it.
  const filterKey = `tailr.compare.${roleId}`
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(filterKey) ?? "null") as { sort?: string; req?: string; cand?: string } | null
      if (!saved) return
      if (saved.sort === "score" || saved.sort === "must" || saved.sort === "name") setCompareSort(saved.sort)
      if (saved.req === "all" || saved.req === "must" || saved.req === "must_important") setReqFilter(saved.req)
      if (saved.cand && ["all", "undecided", "shortlist", "hold", "reject", "called"].includes(saved.cand)) setCandFilter(saved.cand as typeof candFilter)
    } catch {
      /* no storage: defaults */
    }
  }, [filterKey])
  useEffect(() => {
    try {
      window.localStorage.setItem(filterKey, JSON.stringify({ sort: compareSort, req: reqFilter, cand: candFilter }))
    } catch {
      /* no storage: nothing to remember */
    }
  }, [filterKey, compareSort, reqFilter, candFilter])
  // Hiding is a view control on the compare board only. It never touches the
  // candidate, the score or any decision — the product does not remove people.
  const [hiddenCandidates, setHiddenCandidates] = useState<string[]>([])
  // The recommendation's result lives here, not in its tab, because the
  // Matrix tab's "+ The N it recommends" chip counts from the same result.
  const reco = useRecommendation(roleId)
  // "Add in one go" leaves an undo behind it for a few seconds: exactly the
  // previous decision of each person it touched, so Undo is a true reversal
  // and not a blanket clear.
  const [undo, setUndo] = useState<{ n: number; previous: Array<{ candidateId: string; decision: string | null }> } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current) }, [])

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
      // The role and its candidates load together (30 Sep 2026): the list
      // does not depend on the role payload, and waiting for one before
      // asking for the other added a whole round trip to every open.
      const candidatesLoad = loadCandidates()
      const res = await fetch(`/api/agency/roles/${roleId}`)
      if (res.status === 401) return router.push("/agencies")
      if (!res.ok) return setError("Role not found in your agency")
      const body = await res.json()
      setRole(body.role)
      setBriefJd(body.brief_jd ?? null)
      if (body.agency?.name) setAgencyName(body.agency.name)
      seedIntro(`Hi — here are the candidates I'd put in front of you for ${body.role?.title ?? "this role"}. Each one has had a screening call with me, and I've noted where the CV overstated or understated the fit.`)
      setRequirements(body.requirements ?? [])
      setConstraints(body.constraints ?? [])
      // Separate request, and a failure here must not take the role page with
      // it — matching is an adjunct, not part of the workflow's spine.
      setCallerRole(body.caller_role ?? "viewer")
      setPhase((body.phase as PhaseKey | null) ?? null)
      // The shortlist flow is over once the submission has gone, so the bare
      // role URL forwards to wherever the work now lives — interviews, then
      // close-out. ?flow=shortlist is the deliberate way back in (the sidebar
      // link on those screens carries it), and replace() keeps Back working.
      // A ?step= deep link is a request for the workflow too — the dashboard's
      // "Open the submission" card said step=submission and still bounced.
      const params = new URLSearchParams(window.location.search)
      const wantsWorkflow = params.get("flow") === "shortlist" || params.has("step")
      const landing = roleLandingPath((body.phase as PhaseKey | null) ?? null, roleId)
      if (!wantsWorkflow && landing !== `/agencies/roles/${roleId}`) {
        router.replace(landing)
        return
      }
      fetch(`/api/agency/roles/${roleId}/matching`)
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => {
          if (!m?.matching) return
          setMatching(m.matching)
          setMinScoreDraft(m.matching.minScore ?? 70)
        })
        .catch(() => {})
      const count = (await candidatesLoad) ?? 0
      // The dashboard deep links into a specific step (?step=screening).
      // Read it off the URL rather than useSearchParams so this page needs
      // no Suspense boundary. An unknown value falls back to the auto pick.
      const asked = new URLSearchParams(window.location.search).get("step")
      const valid = PANE_STEPS.map((s) => s.key as string)
      if (asked && valid.includes(asked)) setStep(asked as Step)
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
      // The phone shortlist sheet is modal: while it is up, a key must not
      // decide on whichever card was last hovered behind the scrim.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      // On the recommendation tab no card is rendered; without a focused card
      // a key would decide on "the first undecided" out of sight.
      if (!focusedCandidate && !document.querySelector('.ag-cmp-card')) return
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
      // Publishing opens the window (frame 16). Pausing does not — there is
      // nothing to watch, and a window over a stopped scan would be a screen
      // that reports on nothing.
      if (enabled) setMatchWindow(true)
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
    const { title, company, company_context, salary_band, location, seniority, jd_raw, recruiter_notes, planned_rounds, start_target, contact_id } = { ...role, ...override }
    await fetch(`/api/agency/roles/${roleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, company, company_context, salary_band, location, seniority, jd_raw, recruiter_notes,
        planned_rounds: planned_rounds ?? null,
        start_target: start_target ?? "",
        contact_id: contact_id ?? null,
      }),
    })
    announceRoleChanged()
  }

  async function removeCandidate(candidateId: string) {
    setRemoveBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/candidates`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 409 is the notice-already-sent refusal, and its message explains
        // what to do instead — surface it as written rather than flattening it.
        setError(typeof body?.error === "string" ? body.error : "Could not remove that candidate.")
        return
      }
      setRemoving(null)
      setExpandedCandidate(null)
      await loadCandidates()
    } catch {
      setError("Could not remove that candidate.")
    } finally {
      setRemoveBusy(false)
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

  // Frame 41: the level is chosen, not cycled. The route rescores every
  // candidate on the role, so the scores are re-read afterwards.
  async function setWeight(req: Requirement, weight: "must" | "important" | "nice") {
    if (req.weight === weight) return
    const before = req.weight
    setRequirements((rs) => rs.map((r) => (r.id === req.id ? { ...r, weight } : r)))
    try {
      const res = await fetch(`/api/agency/requirements/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight }),
      })
      if (!res.ok) throw new Error(res.status === 403 ? "You have view-only access to this agency." : "That level did not save.")
      setError(null)
      if (candidates.length > 0) await loadCandidates()
    } catch (e) {
      setRequirements((rs) => rs.map((r) => (r.id === req.id ? { ...r, weight: before } : r)))
      setError(e instanceof Error ? e.message : "That level did not save.")
    }
  }

  async function removeRequirement(req: Requirement) {
    setRequirements((rs) => rs.filter((r) => r.id !== req.id))
    await fetch(`/api/agency/requirements/${req.id}`, { method: "DELETE" })
    if (candidates.length > 0) await loadCandidates()
  }

  async function ingest(bodyInit: RequestInit) {
    setBusy("ingest")
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/candidates`, { method: "POST", ...bodyInit })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Ingestion failed")
      pasteRef.current = ""
      setPasteLen(0)
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
      if (Array.isArray(body.call_trail)) {
        setReviews((prev) => (prev[candidateId] ? { ...prev, [candidateId]: { ...prev[candidateId], call_trail: body.call_trail } } : prev))
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

  async function setOverride(candidateId: string, requirementId: string, strength: Strength | null, reason?: string) {
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
        body: JSON.stringify({ overrides: { [requirementId]: strength }, ...(reason ? { override_reason: reason } : {}) }),
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
    const current = decisionsRef.current[candidateId] ?? null
    const rollback = current
    const next = current === decision ? null : decision
    setDecisions((prev) => ({ ...prev, [candidateId]: next }))
    // A deliberate decision inside the undo window is the recruiter's last
    // word on that person: the pending Undo must not put them back.
    setUndo((u) => {
      if (!u || !u.previous.some((p) => p.candidateId === candidateId)) return u
      const previous = u.previous.filter((p) => p.candidateId !== candidateId)
      return previous.length === 0 ? null : { n: previous.length, previous }
    })
    announceRoleChanged()
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

  /**
   * Several decisions in one click — "Add in one go", a group's add on the
   * recommendation tab, and Undo. Same semantics per person as decide():
   * the bulk route writes the same table, the same column and one audit row
   * per candidate, and it is human-only like the single route. Never
   * toggles: it sets exactly what it is given.
   *
   * The undo it leaves behind is built from what the SERVER says each
   * person's previous value was (`updated[].previous`), not from the
   * client's map at click time — the two differ after an await, and the
   * server's is the one the audit row carries.
   *
   * On a non-2xx: the bulk route writes sequentially, so a 500 means some of
   * the batch may already be saved. Replaying everyone through the single
   * route would double-write and double-audit those people, so instead the
   * board is put back and RELOADED from the server. The per-person fallback
   * exists only for a 404/405, i.e. the bulk route is not deployed here yet.
   */
  async function applyDecisions(
    changes: Array<{ candidateId: string; decision: string | null }>,
    opts: { undoable: boolean } = { undoable: true }
  ) {
    if (changes.length === 0) return
    const current = decisionsRef.current
    const previous = changes.map((ch) => ({ candidateId: ch.candidateId, decision: current[ch.candidateId] ?? null }))
    setDecisions((prev) => {
      const next = { ...prev }
      for (const ch of changes) next[ch.candidateId] = ch.decision
      return next
    })
    announceRoleChanged()
    const rollback = (ids: string[]) => {
      if (ids.length === 0) return
      setDecisions((prev) => {
        const next = { ...prev }
        for (const p of previous) if (ids.includes(p.candidateId)) next[p.candidateId] = p.decision
        return next
      })
    }
    const finish = (written: Array<{ candidateId: string; decision: string | null }>) => {
      if (opts.undoable && written.length > 0) {
        setUndo({ n: written.length, previous: written })
        if (undoTimer.current) clearTimeout(undoTimer.current)
        undoTimer.current = setTimeout(() => setUndo(null), 8000)
      } else if (!opts.undoable) {
        setUndo(null)
      }
    }
    const everyone = changes.map((ch) => ch.candidateId)
    let res: Response
    try {
      res = await fetch(`/api/agency/roles/${roleId}/decisions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      })
    } catch {
      // The request never got an answer: it may or may not have landed.
      rollback(everyone)
      await loadCandidates()
      setError("Those decisions may not have saved; the board has been reloaded.")
      return
    }
    if (res.ok) {
      const body = await res.json().catch(() => ({}))
      const skipped: Array<{ candidateId: string }> = Array.isArray(body?.skipped) ? body.skipped : []
      const updated: Array<{ candidateId: string; previous: string | null }> = Array.isArray(body?.updated) ? body.updated : []
      const failed = skipped.map((s) => s.candidateId)
      rollback(failed)
      if (failed.length > 0) setError(failed.length === changes.length ? "Those decisions did not save." : `${failed.length} of ${changes.length} did not save and were put back.`)
      // Exact undo: the server's previous value per person.
      const serverPrevious = new Map(updated.map((u) => [u.candidateId, u.previous ?? null]))
      finish(
        previous
          .filter((p) => !failed.includes(p.candidateId))
          .map((p) => ({ candidateId: p.candidateId, decision: serverPrevious.has(p.candidateId) ? serverPrevious.get(p.candidateId) ?? null : p.decision }))
      )
      return
    }
    if (res.status === 403) {
      rollback(everyone)
      setError("You have view-only access to this agency.")
      return
    }
    if (res.status === 404 || res.status === 405) {
      // The bulk route is not deployed here: one person at a time, same writer.
      let viewOnly = false
      const results = await Promise.allSettled(
        changes.map((ch) =>
          fetch(`/api/agency/candidates/${ch.candidateId}/decision`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision: ch.decision }),
          }).then((r) => {
            if (r.status === 403) viewOnly = true
            if (!r.ok) throw new Error(String(r.status))
          })
        )
      )
      if (viewOnly) {
        rollback(everyone)
        setError("You have view-only access to this agency.")
        return
      }
      const failed = changes.filter((_, i) => results[i].status === "rejected").map((ch) => ch.candidateId)
      rollback(failed)
      if (failed.length > 0) setError(failed.length === changes.length ? "Those decisions did not save." : `${failed.length} of ${changes.length} did not save and were put back.`)
      finish(previous.filter((p) => !failed.includes(p.candidateId)))
      return
    }
    // 400, 401, 5xx: nothing to retry. Some of the batch may be saved (the
    // route writes in order), so the server's view replaces the optimistic one.
    rollback(everyone)
    await loadCandidates()
    setError(
      res.status === 401
        ? "Your session has expired. Sign in again."
        : "Some of those may have saved; the board has been reloaded."
    )
  }

  /** The recruiter's one click that adds several people; each is their own decision. */
  function addMany(candidateIds: string[]) {
    const current = decisionsRef.current
    const changes = candidateIds
      .filter((id) => current[id] !== "shortlist")
      .map((id) => ({ candidateId: id, decision: "shortlist" as string | null }))
    void applyDecisions(changes, { undoable: true })
  }

  function undoLast() {
    if (!undo) return
    if (undoTimer.current) clearTimeout(undoTimer.current)
    void applyDecisions(undo.previous, { undoable: false })
  }

  /**
   * One send (board 34): to the chosen people, in their workspace. The
   * format column still records how it was ALSO delivered — email when the
   * summary goes, portal otherwise — but it no longer decides whether the
   * client can act on it; see the route.
   */
  async function generateSubmission(representOverride = false) {
    if (chosenContacts.length === 0) {
      return setError("Choose who gets it. The shortlist goes to named people, in their workspace.")
    }
    const format = extras.email ? "email" : "portal"
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
          intro: introRef.current,
          recipients: chosenContacts.map((id) => ({ contact_id: id })),
          extras: { email: extras.email },
          ...(representOverride ? { representOverride: true } : {}),
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
      announceRoleChanged()
      setSubmissionResult({
        format,
        entries: body.submission?.snapshot?.shortlisted?.length ?? 0,
        links: body.links ?? [],
        delivery: Array.isArray(body.delivery) ? (body.delivery as DeliveryRow[]) : null,
        // The whole immutable snapshot, so the preview renders exactly what
        // the client will get rather than a re-derivation of it.
        snapshot: body.submission?.snapshot ?? null,
      })
      // Phase one is over at this exact moment. The server derives the same
      // thing from the submission row on next load; this keeps the rail honest
      // without a refetch. Never moves backwards for a role already further on.
      setPhase((p) => (p === null || p === "shortlist" ? "interviews" : p))
      // The PDF extra: the document is already mounted for print; give React
      // a beat to swap in the frozen snapshot first.
      if (extras.pdf) setTimeout(printShortlistDocument, 300)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  /** The plain-text version, for a recruiter who wants to write their own email. */
  function copyEmailText() {
    if (!role) return
    const snapIntro = submissionResult?.snapshot?.intro
    const d = submissionResult?.snapshot?.disclosure ?? disclosure
    const text = [
      `Shortlist: ${role.title} — ${submissionRows.length} candidate${submissionRows.length === 1 ? "" : "s"}`, "",
      snapIntro ?? introRef.current, "",
      ...submissionRows.flatMap((r, i) => [
        `${i + 1}. ${r.redacted ? r.ref : r.name}${r.title ? ` — ${r.title}` : ""}${d.scores ? ` (fit ${Math.round(r.overall)})` : ""}`,
        d.notes ? r.narrative : "",
        d.probes && r.probes[0] ? `To probe: ${r.probes[0]}` : "",
        "",
      ]),
      "The full shortlist, with the evidence and CVs, is in your Tailr workspace.", "",
      "Best,", agencyName,
    ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n")
    void navigator.clipboard?.writeText(text)
  }

  // After a reload the frozen snapshot is not in memory, so a role that has
  // already gone out showed a live preview and an editable note — a guess at
  // what the client holds. Read back what was actually sent (board 34).
  const snapshotLoaded = useRef(false)
  useEffect(() => {
    if (step !== "submission" || phase === null || phase === "shortlist" || submissionResult || snapshotLoaded.current) return
    snapshotLoaded.current = true
    fetch(`/api/agency/roles/${roleId}/submission`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { submissions?: Array<{ format: string; snapshot: Snapshot | null }> } | null) => {
        const latest = b?.submissions?.[0]
        if (!latest?.snapshot) return
        setSubmissionResult((prev) =>
          prev ?? { format: latest.format, entries: latest.snapshot?.shortlisted?.length ?? 0, links: [], delivery: null, snapshot: latest.snapshot }
        )
      })
      .catch(() => {})
  }, [step, phase, submissionResult, roleId])

  // The role's own client contact is who the shortlist is for unless the
  // recruiter says otherwise: ticked on arrival, once.
  const recipientSeeded = useRef(false)
  useEffect(() => {
    if (recipientSeeded.current || !role?.contact_id || contacts.length === 0) return
    recipientSeeded.current = true
    if (contacts.some((c) => c.id === role.contact_id)) {
      setChosenContacts((prev) => (prev.length > 0 ? prev : [role.contact_id as string]))
    }
  }, [role?.contact_id, contacts])

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
  // The words on screen: "passed" is the stored value "reject".
  const decisionTotals = `${decisionCounts.shortlist} shortlisted · ${decisionCounts.hold} on hold · ${decisionCounts.reject} passed`

  // Six of the seven render here; Candidate detail is per-candidate and has
  // its own route, so the rail links out to it rather than switching a pane.
  // PANE_STEPS is that list, derived in lib/agency/steps.ts — not a second
  // copy kept here.
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
      // An answered gap stays on the call's list even after the answer closed
      // it (board 40: the answer can now upgrade the requirement).
      if (!(req.ref in activeAnswers) && st !== "missing" && st !== "partial" && st !== "transferable") continue
      gaps.push({ id: req.ref, text: gapProbeText(req.text), why: `${req.ref} reads ${st} from the CV`, source: "gap" })
    }
    // Written questions: the role's (live, or answered on this call) and this
    // call's own. A removed one stays only where it already has an answer.
    const keep = (w: WrittenQuestion) => !w.removedAt || w.key in activeAnswers
    const roleQs: ProbeQuestion[] = written
      .filter((w) => w.candidateId === null && keep(w))
      .map((w) => ({ id: w.key, text: w.text, why: "Written for every candidate", source: "role" }))
    const callQs: ProbeQuestion[] = written
      .filter((w) => w.candidateId === active.id && keep(w))
      .map((w) => ({ id: w.key, text: w.text, why: "Added on this call", source: "call" }))
    return [...roleQs, ...callQs, ...gaps, ...PROBE_LIBRARY.map((q) => ({ ...q, source: "library" as const }))]
  }, [active, requirements, effectiveStrength, written, activeAnswers])
  // On the call: everything already on its script, plus every question
  // written for the role — those are on every call's list automatically.
  const chosenProbes = useMemo(() => probeCatalogue.filter((q) => q.id in activeAnswers || q.source === "role"), [probeCatalogue, activeAnswers])
  const answeredProbes = useMemo(
    () => chosenProbes.filter((q) => (activeAnswers[q.id] ?? "").trim().length > 0).length,
    [chosenProbes, activeAnswers]
  )
  const suggestedProbes = useMemo(() => probeCatalogue.filter((q) => !(q.id in activeAnswers) && q.source !== "role" && q.source !== "call"), [probeCatalogue, activeAnswers])

  // Held, rejected and undecided candidates: the internal record on the
  // submission screen. Present so the recruiter can see the whole field,
  // never sent to the client.
  const notShortlisted = useMemo(() => candidates.filter((c) => decisions[c.id] !== "shortlist"), [candidates, decisions])
  const rankedCandidates = useMemo(
    () => [...candidates].sort((a, b) => (scores[b.id]?.overall ?? 0) - (scores[a.id]?.overall ?? 0)),
    [candidates, scores]
  )

  /**
   * Step 07's derived lists, memoised (13 Sep 2026).
   *
   * They were computed inside the pane's render IIFE, so they rebuilt on
   * EVERY render — and `intro` is component state, so writing the client
   * introduction rebuilt every row on every keystroke: a Map lookup per
   * candidate per must-have, a requirements filter per candidate for gaps,
   * and resolveProbes per candidate. Typing was the slowest thing on the
   * screen that exists to be typed on.
   *
   * `intro` is deliberately not a dependency of any of these.
   */
  const submissionSnap = submissionResult?.snapshot ?? null
  const submissionShortlisted = useMemo(
    () => rankedCandidates.filter((c) => decisions[c.id] === "shortlist"),
    [rankedCandidates, decisions]
  )
  const submissionHeld = useMemo(
    () => rankedCandidates.filter((c) => decisions[c.id] === "hold"),
    [rankedCandidates, decisions]
  )
  const submissionMusts = useMemo(() => requirements.filter((r) => r.weight === "must"), [requirements])
  const submissionRows = useMemo<SubmissionRow[]>(
    () =>
      submissionSnap
        ? submissionSnap.shortlisted.map((e) => ({
            key: e.ref, ref: e.ref, name: e.full_name, title: e.current_title ?? "", years: e.years,
            location: e.location ?? "", overall: e.overall, confidence: e.confidence_level,
            reviewed: e.reviewed, narrative: e.narrative,
            musts: e.strengths.map((s) => ({ text: s.requirement, strength: "strong", quote: s.quote })),
            gaps: e.gaps.map((g) => g.requirement),
            probes: e.probe_areas ?? [],
            comp: e.salary_confirm ?? "", availability: e.availability ?? "",
            mustHit: e.must_have_hit ?? null, mustTotal: e.must_have_total ?? null,
            redacted: e.redacted === true,
          }))
        : submissionShortlisted.map((c) => {
            const sc = scores[c.id]
            const rv = reviews[c.id]
            return {
              key: c.id, ref: c.ref, name: c.full_name, title: c.current_title ?? "", years: c.years,
              location: c.location ?? "", overall: sc?.overall ?? 0, confidence: sc?.confidence_level ?? 2,
              reviewed: rv?.status === "reviewed", narrative: rv?.notes ?? "",
              musts: submissionMusts.map((r) => ({
                text: r.text,
                strength: effectiveStrength(c.id, r.id),
                quote: evidenceAt(c.id, r.id)?.quote ?? null,
              })),
              gaps: requirements.filter((r) => effectiveStrength(c.id, r.id) === "missing").map((r) => r.text),
              probes: Object.keys(rv?.call_answers ?? {}).length > 0
                ? resolveProbes(Object.keys(rv!.call_answers!), requirements, written).map((p) => p.text)
                : requirements
                    .filter((r) => r.weight !== "nice" && ["missing", "partial"].includes(effectiveStrength(c.id, r.id)))
                    .map((r) => r.text),
              comp: c.salary_text ?? "", availability: rv?.availability ?? "",
              mustHit: sc?.must_have_hit ?? null, mustTotal: sc?.must_have_total ?? null,
              redacted: false,
            }
          }),
    [submissionSnap, submissionShortlisted, submissionMusts, requirements, scores, reviews, effectiveStrength, evidenceAt, written]
  )


  /** Write a question: on this call only, or for every candidate on the role. */
  async function addQuestion(candidateId: string) {
    const text = newQuestion.trim()
    if (!text || addingQuestion) return
    setAddingQuestion(true)
    setError(null)
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/screening-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, candidateId: newScope === "call" ? candidateId : null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.question) return setError(typeof body?.error === "string" ? body.error : "That question did not save.")
      setWritten((w) => [...w, body.question as WrittenQuestion])
      // A call question goes on this call's script now, so the record says
      // when it was asked. A role question is on every list already.
      if (newScope === "call") setProbe(candidateId, (body.question as WrittenQuestion).key, "")
      setNewQuestion("")
    } catch {
      setError("That question did not save.")
    } finally {
      setAddingQuestion(false)
    }
  }

  /** Take a role question off every call not yet made. Answers given keep it. */
  async function removeRoleQuestion(id: string) {
    if (!window.confirm("Take this question off the role? Calls already made keep their answers to it.")) return
    try {
      const res = await fetch(`/api/agency/roles/${roleId}/screening-questions`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      if (!res.ok) return setError("That question was not removed.")
      setWritten((w) => w.map((q) => (q.id === id ? { ...q, removedAt: new Date().toISOString() } : q)))
    } catch {
      setError("That question was not removed.")
    }
  }

  function setProbe(candidateId: string, id: string, value: string | null) {
    const current = reviews[candidateId]?.call_answers ?? {}
    const next = { ...current }
    if (value === null) delete next[id]
    else next[id] = value
    patchReview(candidateId, { call_answers: next }, { call_answers: next })
  }

  // Handoff chrome: which steps are behind you (checkmark in the rail),
  // where you are (breadcrumb + eyebrow), and Back / Next at the top.
  const stepIndex = PANE_STEPS.findIndex((s) => s.key === step)
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
        <AgencySwitcher />
        <AgencyNav inRole />
        {/* A named group, not more global nav: see .ag-rail-group. */}
        <div className="ag-rail-group">
          <div className="ag-rail-label">Shortlist workflow</div>
          {WORKFLOW_STEPS.map((s) => {
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
        <SignOut />
        <div className="ag-sidebar-foot">
          <div style={{ fontSize: 12, color: "var(--ag-ink-3)" }}>
            Decision support only. No candidate is ever rejected automatically.
          </div>
        </div>
      </aside>

      <main className="ag-main">
        <div className="ag-screen">
          {role && <RoleHeader roleId={roleId} hat="recruiter" />}
          {role && <BriefChip roleId={roleId} hat="recruiter" data={briefStatus} />}
          {/* ONE LINE, NOT TWO (13 Sep 2026). The eyebrow named the step and
              the buttons moved between steps — the same subject, stacked as
              two full-width bands, so the role header was followed by four
              pieces of chrome before the box you are meant to paste a job
              description into. They share a line now; nothing was removed.

              Back / Next STAYS. Below 900px .ag-sidebar is display:none, so
              on a phone these two buttons are the only way through the seven
              steps — folding them away would strand the flow at that width. */}
          {role && (
            <div className="ag-crumbbar ag-stepbar" style={{ marginTop: -8 }}>
              <p className="ag-step-eyebrow">Step {stepNumber(step)} · {stepLabel(step)}</p>
              <span className="ag-grow" />
              <button
                className="ag-btn ag-btn-secondary"
                disabled={stepIndex <= 0}
                onClick={() => setStep(PANE_STEPS[stepIndex - 1].key)}
              >
                ← Back
              </button>
              <button
                className="ag-btn ag-btn-secondary"
                disabled={stepIndex >= PANE_STEPS.length - 1}
                onClick={() => setStep(PANE_STEPS[stepIndex + 1].key)}
              >
                Next →
              </button>
            </div>
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
                  <h1 className="ag-title">Set up the role, and agree how it runs.</h1>
                  <p className="ag-sub">The job and your notes are what every candidate is scored against.</p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Hint info content={INTAKE_EXPLAINED}>How this works</Hint>
                  {requirements.length > 0 ? (
                    <>
                      <button className="ag-btn ag-btn-secondary" onClick={() => extract()} disabled={busy !== null || !role.jd_raw.trim()}>
                        {busy === "extract" ? <><span className="ag-spin" /> Extracting</> : "Extract again"}
                      </button>
                      <button className="ag-btn ag-btn-primary" onClick={() => setStep("parse")} disabled={busy !== null}>
                        Continue to check requirements
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
                        ? `Filled from the JD: ${extractResult.filled.map((f) => f.replace(/_/g, " ")).join(", ")}.`
                        : "Nothing overwritten — every field had your text."}
                    </div>
                  </div>
                  <button className="ag-btn ag-btn-coral" onClick={() => setStep("parse")}>Continue</button>
                </div>
              )}
              <div className="ag-grid-2">
                <div className="ag-stack">
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
                      {/* Board 28, band C: the file the brief carries, named,
                          above the box its text landed in. Only when the
                          version this role runs on has one. */}
                      {briefStatus && briefStatus !== "error" && briefStatus.status?.jd && (
                        <div className="ag-brief-jd-from-row">
                          <span className="ag-field-label ag-brief-jd-from">From the brief · {briefStatus.status.jd.name}</span>
                          <a className="ag-brief-jd-link" href={`/api/agency/briefs/${briefStatus.status.briefId}/jd/${briefStatus.status.jd.fileId}`} download aria-label={`Download ${briefStatus.status.jd.name}`}>
                            Download
                          </a>
                        </div>
                      )}
                      <textarea className="ag-textarea jd" placeholder="Paste the client's job description here" value={role.jd_raw} onChange={(e) => patchRole({ jd_raw: e.target.value })} onBlur={() => void saveIntake()} />
                      {/* The client's JD arrived with the brief. Accept copied
                          it in; this line is the provenance, and the button is
                          the way back to their exact text after edits. */}
                      {/* Only when the file row above is not already naming the brief. */}
                      {briefJd && briefJd === role.jd_raw.trim() && !(briefStatus && briefStatus !== "error" && briefStatus.status?.jd) && (
                        <p className="ag-note" style={{ marginTop: 8 }}>
                          <Hint bare text="This JD came with the client’s brief. Extract from it as is, or edit first." className="ag-field-label">From the brief</Hint>
                        </p>
                      )}
                      {briefJd && briefJd !== role.jd_raw.trim() && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                          <button
                            className="ag-btn ag-btn-secondary"
                            disabled={busy !== null}
                            title="Replaces your edits with the client’s exact text."
                            onClick={() => { patchRole({ jd_raw: briefJd }); void saveIntake({ jd_raw: briefJd }) }}
                          >
                            Use the JD from the client&rsquo;s brief
                          </button>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <input className="ag-input" placeholder="Or a link to the posting" value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} />
                        <button className="ag-btn ag-btn-secondary" onClick={() => jdUrl.trim() && extract({ url: jdUrl.trim() })} disabled={busy !== null || !jdUrl.trim()}>
                          Fetch and extract
                        </button>
                      </div>
                    </div>
                  </div>
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
                      <div>
                        <label className="ag-label" htmlFor="role-contact">Hiring manager</label>
                        <select
                          id="role-contact"
                          className="ag-input"
                          value={role.contact_id ?? ""}
                          onChange={(e) => { const v = e.target.value || null; patchRole({ contact_id: v }); void saveIntake({ contact_id: v }) }}
                        >
                          <option value="">Not named yet</option>
                          {clients.map((c) => (
                            <option key={c.contactId} value={c.contactId}>
                              {c.fullName || c.company}{c.fullName && c.company ? ` · ${c.company}` : ""}
                            </option>
                          ))}
                        </select>
                        <p className="ag-note" style={{ marginTop: 6 }}>Naming them shows this role in their workspace.</p>
                      </div>
                      <div><label className="ag-label">Start target</label><input className="ag-input" placeholder="e.g. early November" value={role.start_target ?? ""} onChange={(e) => patchRole({ start_target: e.target.value })} onBlur={() => void saveIntake()} /></div>
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
                <div className="ag-stack">
                  {/*
                    The terms with the client (frame 36, approved 2 Oct 2026):
                    the role's own brief, beside the job. It is addressed to
                    the hiring manager, so naming one comes first. The role
                    runs on the draft at once — approval is not a gate.
                  */}
                  <div className="ag-card">
                    <div className="ag-card-head">
                      <span className="ag-card-title">Terms with the client</span>
                      <span className="ag-pill">Audit logged</span>
                    </div>
                    <div className="ag-card-body">
                      {briefStatus === "error" ? (
                        <p className="ag-note">Could not load the terms. Reload the page.</p>
                      ) : briefStatus === null ? (
                        <p className="ag-note">Loading…</p>
                      ) : roleBriefId ? (
                        <BriefEditor briefId={roleBriefId} embedded roleTitle={role.title} onChanged={() => void reloadBrief()} />
                      ) : !role.contact_id ? (
                        <p className="ag-note">
                          Name the hiring manager first — the terms are addressed to them.
                        </p>
                      ) : (
                        <>
                          <p className="ag-note" style={{ marginBottom: 10 }}>
                            Starts from the last terms agreed with {role.company.trim() || "this client"}, or your defaults.
                          </p>
                          <button className="ag-btn ag-btn-primary" onClick={() => void startBrief()} disabled={startingBrief}>
                            {startingBrief ? "Starting…" : "Start the terms"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/*
                    Discard — the way out of a role created twice or by
                    mistake (22 Sep 2026). Not "close": closing is an outcome
                    that starts the retention clock and tells candidates the
                    role is filled. The server refuses this the moment anyone
                    is on the role, and says to close it instead.
                  */}
                  <div className="ag-card">
                    <div className="ag-card-head"><span className="ag-card-title">Discard this role</span><span className="ag-pill">Audit logged</span></div>
                    <div className="ag-card-body">
                      <p className="ag-note" style={{ marginBottom: 10 }}>
                        For a role added twice or by mistake; the record stays for audit. Once anyone is on
                        it, close it instead — that tells candidates and starts the retention clock.
                      </p>
                      <button className="ag-btn ag-btn-secondary" disabled={discarding} onClick={() => void discardRole()}>
                        {discarding ? "Discarding…" : "Discard this role"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {role && step === "parse" && (
            <>
              <div className="ag-screen-head">
                <div>
                  <h1 className="ag-title">Here&apos;s what we extracted.<br />Tune it before we score.</h1>
                  <p className="ag-sub">Choose how much each requirement counts. It never decides who is kept.</p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Hint info content={WEIGHTING_EXPLAINED}>How this works</Hint>
                  <button className="ag-btn" onClick={() => setStep("intake")}>Back</button>
                  <button className="ag-btn ag-btn-primary" onClick={() => setStep("candidates")} disabled={requirements.length === 0}>Continue to candidates</button>
                </div>
              </div>
              <div className="ag-grid-2 ag-grid-2-wide">
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Requirements</span>
                    <span className="ag-meta">{(["must", "important", "nice"] as const).map((w) => `${requirements.filter((r) => r.weight === w).length} ${w}`).join(" · ")}</span>
                  </div>
                  <div className="ag-card-body ag-stack" style={{ gap: 20 }}>
                    {GROUPS.map((group) => {
                      const inGroup = requirements.filter((r) => r.weight === group.weight)
                      return (
                        <section key={group.weight} className="ag-lv-group" aria-labelledby={`lv-${group.weight}`}>
                          <div className="ag-lv-head">
                            <h3 className="ag-lv-title" id={`lv-${group.weight}`}>
                              {group.label} <span className="ag-lv-n">{inGroup.length}</span>
                            </h3>
                            <p className="ag-lv-hint">{group.hint}</p>
                          </div>
                          {inGroup.map((req) => (
                            <div key={req.id} className="ag-lv-row">
                              <span className="ag-lv-ref">{req.ref}</span>
                              <span className="ag-lv-text">{req.text}</span>
                              {/* A radio group per requirement: arrow keys move it. */}
                              <span className="ag-lv-seg" role="radiogroup" aria-label={`Level for ${req.ref}`}>
                                {GROUPS.map((g) => (
                                  <label key={g.weight} className="ag-lv-opt" data-on={req.weight === g.weight || undefined} data-level={g.weight}>
                                    <input
                                      type="radio"
                                      name={`lv-${req.id}`}
                                      value={g.weight}
                                      checked={req.weight === g.weight}
                                      onChange={() => void setWeight(req, g.weight)}
                                    />
                                    {g.label}
                                  </label>
                                ))}
                              </span>
                              <button className="ag-icon-btn ag-lv-x" onClick={() => removeRequirement(req)} aria-label={`Remove ${req.ref}`} title={`Remove ${req.ref}`}>×</button>
                            </div>
                          ))}
                        </section>
                      )
                    })}
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
                  <p className="ag-sub">Add up to 50 CVs per role — PDF, DOCX or pasted text.</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="ag-btn" onClick={() => setStep("parse")}>Back</button>
                  <button className="ag-btn ag-btn-primary" onClick={() => setStep("screening")} disabled={candidates.length === 0}>Continue to screening</button>
                </div>
              </div>
              {/*
                THE SCAN, WHERE THE WORK IS (10 Sep 2026, Ose).
                This step is "add candidates", and matching is the other way
                candidates arrive — so the scan belongs here, not only in the
                role-level card far below. It shows the PROCESS first, then
                the people. Before this it rendered only once matching was
                already live, so on a fresh role the step said nothing at all
                and publishing was somewhere else entirely.

                Who is listed is unchanged and deliberate: people who match
                AND turned on the third switch. Everyone else the scan
                touched stays a rounded count. Nobody is named who did not
                choose to be seen.
              */}
              <div className="ag-card" style={{ marginBottom: 16 }}>
                <div className="ag-card-head">
                  <span className="ag-card-title">Matched on Tailr</span>
                  {requirements.length > 0 && matching?.enabled && !matching.scanQueued && matching.lastScanAt ? (
                    <Hint bare text="Re-runs on its own when you republish or the requirements change." className="ag-pill">
                      {`Checked ${new Date(matching.lastScanAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                    </Hint>
                  ) : (
                    <span className="ag-pill">
                      {requirements.length === 0
                        ? "Needs requirements"
                        : !matching?.enabled
                          ? "Not scanning"
                          : matching.scanQueued
                            ? "Scan running"
                            : "Waiting for first scan"}
                    </span>
                  )}
                </div>
                <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                  {requirements.length === 0 ? (
                    <p className="ag-note" style={{ margin: 0 }}>
                      Parse the requirements first, then publish this role for matching.
                    </p>
                  ) : !matching?.enabled ? (
                    <>
                      <p className="ag-note" style={{ margin: 0 }}>
                        Only people who opted into matching are scanned. Nobody is contacted; you see only those who chose to be seen.
                      </p>
                      {/* One publish control, and it is in the window. This
                          was a second threshold input and a second publish
                          button — two ways to switch on one thing, which is
                          how the two disagree about what the minimum is. */}
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          className="ag-btn ag-btn-primary"
                          disabled={callerRole === "viewer"}
                          onClick={() => setMatchWindow(true)}
                        >
                          Publish and scan
                        </button>
                        <span className="ag-meta">opens the matching window</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/*
                        THE MATCHED PEOPLE MOVED INTO THE WINDOW (19 Sep 2026,
                        Figma frame 16). They were rendered here AND in the
                        role-level card, which is two places for one list and
                        two chances to disagree — the same duplication the
                        hiring manager's interviews list had.

                        This is now a door. The window shows what the scan is
                        matching against, how far it has got, and who
                        consented to be seen, with room to read it.
                      */}
                      {(matching.scanQueued || !matching.lastScanAt) && (
                        <p className="ag-note" style={{ margin: 0 }}>
                          {matching.scanQueued
                            ? "The scan is running now. Nothing else is needed from you."
                            : "Published. The first scan is queued and will run shortly."}
                        </p>
                      )}
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button className="ag-btn ag-btn-primary" onClick={() => setMatchWindow(true)}>
                          {matching.scanQueued ? "Watch the scan" : "See who matched"}
                        </button>
                        <span className="ag-meta">
                          {matched === null
                            ? "Loading…"
                            : matched.people.length === 0
                              ? "Nobody who matched has chosen to be seen yet."
                              : `${matched.people.length} chose to be seen`}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="ag-grid-2">
                <div className="ag-card">
                  <div className="ag-card-head">
                    <span className="ag-card-title">Candidates ({candidates.length})</span>
                    <span className="ag-grow" />
                    {/* Board 39 (7 Oct 2026): "What happens on add" was a card on
                        every visit; it opens on demand now, word for word. */}
                    <Hint info content={ADD_EXPLAINED}>How this works</Hint>
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
                              {s ? <Hint bare text={RECRUITER_HINTS.fit} className="ag-prof-fit">{Math.round(s.overall)} <ArrowUpRight size={13} strokeWidth={2} /></Hint> : <span className="ag-meta">Not scored yet</span>}
                            </div>
                            <div className="ag-prof-row">
                              <span className="ag-prof-key"><Target size={16} />Must-have coverage</span>
                              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                {s ? (
                                  <Hint bare text={RECRUITER_HINTS.mustHaves} className="ag-prof-val mono">{`${s.must_have_hit}/${s.must_have_total}`}</Hint>
                                ) : (
                                  <span className="ag-prof-val mono">Pending</span>
                                )}
                                {delta !== 0 && s && <AdjustedPill original={s.original_overall} overall={s.overall} />}
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
                              {removing === c.id ? (
                                <span className="ag-remove-confirm">
                                  <span className="ag-note" style={{ margin: 0 }}>
                                    Delete {c.ref} and their CV? This cannot be undone.
                                  </span>
                                  <button
                                    className="ag-btn ag-btn-danger"
                                    disabled={removeBusy}
                                    onClick={() => void removeCandidate(c.id)}
                                  >
                                    {removeBusy ? "Removing…" : "Remove for good"}
                                  </button>
                                  <button className="ag-btn" disabled={removeBusy} onClick={() => setRemoving(null)}>
                                    Keep
                                  </button>
                                </span>
                              ) : (
                                <button
                                  className="ag-btn ag-remove-trigger"
                                  onClick={() => setRemoving(c.id)}
                                  title="Added in error? Remove them and their CV entirely."
                                >
                                  Remove
                                </button>
                              )}
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
                      <textarea
                        className="ag-textarea"
                        style={{ minHeight: 180 }}
                        placeholder="Paste CV text for candidates who sent a document you cannot upload"
                        defaultValue={pasteRef.current}
                        onChange={(e) => {
                          pasteRef.current = e.target.value
                          // Only the crossing matters, not the length.
                          const enough = e.target.value.trim().length >= 100
                          setPasteLen((n) => (enough === n >= 100 ? n : enough ? 100 : 0))
                        }}
                      />
                      <button
                        className="ag-btn ag-btn-primary"
                        style={{ marginTop: 12 }}
                        onClick={() => { const v = pasteRef.current; if (v.trim().length < 100) setError("Paste at least a few paragraphs of CV text"); else ingest({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cvText: v }) }) }}
                        disabled={busy !== null}
                      >
                        {busy === "ingest" ? <><span className="ag-spin" /> Reading the CV</> : "Add candidate"}
                      </button>
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
                    Record each call&rsquo;s answers against the requirements still open.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Hint info content={SCREENING_EXPLAINED}>How this works</Hint>
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
                          <div className="ag-field-label">Questions for this call · {answeredProbes} of {chosenProbes.length} answered</div>
                          {chosenProbes.length === 0 && (
                            <p className="ag-quiet" style={{ padding: "14px 0", textAlign: "left" }}>
                              No questions yet — write one, or pick an open requirement.
                            </p>
                          )}
                          <div className="ag-stack" style={{ gap: 12 }}>
                            {chosenProbes.map((q, i) => (
                              <div key={q.id} className="ag-stack" style={{ gap: 6 }}>
                                <label className="ag-probe-label" htmlFor={`q-${active.id}-${q.id}`}>
                                  <span className="ag-qnum">Q{i + 1}</span>
                                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{q.text}</span>
                                  <span className={`ag-q-tag ag-q-tag-${q.source}`}>
                                    {q.source === "role" ? "For every candidate" : q.source === "call" ? "Added on this call" : q.source === "gap" ? `From a CV gap · ${q.id}` : "Standard"}
                                  </span>
                                  {/* A role question is on every list: it comes off from
                                      the role's list below, not one call at a time. */}
                                  {q.source !== "role" && (
                                    <button className="ag-icon-btn" title="Remove this question" aria-label={`Remove ${q.id}`} onClick={() => setProbe(active.id, q.id, null)}>×</button>
                                  )}
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
                                {/* BOARD 40, band B (8 Oct 2026, UAT item 16). A gap
                                    answered on the call can move the score — by the
                                    recruiter's choice, never by reading the words. The
                                    level writes the same attributed override the matrix
                                    writes, with the answer as its reason. Nothing is
                                    pre-selected; clicking the chosen level clears it. */}
                                {q.source === "gap" && (activeAnswers[q.id] ?? "").trim() && (() => {
                                  const req = requirements.find((r) => r.ref === q.id)
                                  if (!req) return null
                                  const mine = overrides[active.id]?.[req.id] ?? null
                                  const answer = (activeAnswers[q.id] ?? "").trim()
                                  const reason = `From the screening call: ${answer.length > 400 ? `${answer.slice(0, 400)}…` : answer}`
                                  return (
                                    <div className="ag-ev-row" role="group" aria-label={`Does this answer evidence ${req.ref}?`}>
                                      <span className="ag-ev-ask">Does this evidence {req.ref}?</span>
                                      {GAP_LEVELS.map(([level, label]) => (
                                        <button
                                          key={level}
                                          type="button"
                                          className="ag-ev-opt"
                                          aria-pressed={mine === level}
                                          onClick={() => void setOverride(active.id, req.id, mine === level ? null : level, mine === level ? undefined : reason)}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                      {mine && (
                                        <span className="ag-ev-saved" role="status">
                                          Saved as your override on {req.ref}; the score has been updated.
                                        </span>
                                      )}
                                    </div>
                                  )
                                })()}
                              </div>
                            ))}
                          </div>
                          {/* Write a question (frame 37): typed as you would ask
                              it, for this call or for every candidate. */}
                          <div className="ag-q-add">
                            <label className="ag-label" htmlFor="q-new">Add a question</label>
                            <div className="ag-q-add-row">
                              <input
                                id="q-new"
                                className="ag-input"
                                placeholder="Type the question as you would ask it…"
                                maxLength={300}
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addQuestion(active.id) } }}
                              />
                              <button className="ag-btn ag-btn-primary" onClick={() => void addQuestion(active.id)} disabled={!newQuestion.trim() || addingQuestion}>
                                {addingQuestion ? "Adding…" : "Add"}
                              </button>
                            </div>
                            <div className="ag-q-scope" role="radiogroup" aria-label="Who this question is for">
                              <label><input type="radio" name="q-scope" checked={newScope === "call"} onChange={() => setNewScope("call")} /> Just this call</label>
                              <label><input type="radio" name="q-scope" checked={newScope === "role"} onChange={() => setNewScope("role")} /> Every candidate on this role</label>
                            </div>
                            <button className="ag-btn ag-btn-secondary" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={() => setProbePicker((v) => !v)}>
                              {probePicker ? "Close the suggestions" : "Or pick a suggested question"}
                            </button>
                          </div>
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
                              {suggestedProbes.some((q) => q.source === "library") && <p className="ag-picker-group">Standard questions</p>}
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

                        {/* The role's own questions (frame 37): written once, on
                            every call's list. Removing one takes it off calls
                            not yet made; answers already given keep it. */}
                        {written.some((w) => w.candidateId === null && !w.removedAt) && (
                          <div>
                            <div className="ag-field-label">
                              Questions for every candidate on this role · {written.filter((w) => w.candidateId === null && !w.removedAt).length}
                            </div>
                            <ul className="ag-q-role-list">
                              {written.filter((w) => w.candidateId === null && !w.removedAt).map((w) => (
                                <li key={w.id}>
                                  <span className="ag-grow">{w.text}</span>
                                  <button className="ag-btn ag-btn-secondary" onClick={() => void removeRoleQuestion(w.id)}>Remove</button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* The call record (frame 37): append-only, recruiter
                            only — never sent to the client. */}
                        {(activeReview?.call_trail?.length ?? 0) > 0 && (
                          <details className="ag-q-trail">
                            <summary className="ag-field-label">Call record · {active.ref} · recruiter only · {activeReview!.call_trail!.length}</summary>
                            <ol>
                              {activeReview!.call_trail!.slice().reverse().map((e, i) => (
                                <li key={`${e.at}-${e.key}-${e.kind}-${i}`}>
                                  <span className="ag-q-trail-time">
                                    {new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  <span className="ag-grow">
                                    {trailLine(e)}
                                    {e.answer && (e.kind === "removed" || e.kind === "answered" || e.kind === "edited") && (
                                      <span className="ag-q-trail-answer">{e.answer}</span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}

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
                        {requirements.map((req) => {
                          const parsed = parsedStrength(active.id, req.id)
                          const current = effectiveStrength(active.id, req.id)
                          const isOverride = Boolean(overrides[active.id]?.[req.id])
                          const ev = evidenceAt(active.id, req.id)
                          return (
                            <div key={req.id} className="ag-ev-card" data-override={isOverride}>
                              <div className="ag-ev-head">
                                <span className="ag-meta">{req.ref}</span>
                                <span className="ag-mx-weight" data-must={req.weight === "must"}>{req.weight}</span>
                                <span className="ag-grow" />
                                {isOverride && <span className="ag-ev-mine">Your call · attributed</span>}
                              </div>
                              <p className="ag-ev-req">{req.text}</p>
                              {/* The quote is the object, not a footnote: it is the
                                  only thing tying this judgement to a sentence the
                                  person actually said. */}
                              {ev?.quote && (
                                <>
                                  <blockquote className="ag-ev-quote">{ev.quote}</blockquote>
                                  <span className="ag-ev-cite">From the {ev.source_cite || "CV"}</span>
                                </>
                              )}
                              {/* Each option carries its own name AND its own weight,
                                  so there is no legend to scroll away from and meaning
                                  never rests on telling a filled dot from a hollow one
                                  (WCAG 1.4.1). Wraps to two rows when narrow; it must
                                  never fall back to colour alone. */}
                              <div className="ag-ev-pick" role="group" aria-label={`Strength for ${req.ref}`}>
                                {STRENGTHS.map((s) => (
                                  <button
                                    key={s}
                                    aria-pressed={current === s}
                                    className={current === s ? "on" : ""}
                                    onClick={() => setOverride(active.id, req.id, current === s ? null : s)}
                                  >
                                    <span className={`ag-dot ${s}`} />
                                    <span className="ag-ev-pick-name">{s}</span>
                                    <span className="ag-ev-pick-weight">{strengthWeightLabel(s)}</span>
                                  </button>
                                ))}
                              </div>
                              {isOverride && (
                                <p className="ag-ev-said">
                                  Tailr read this as {parsed}. You marked it {current}.
                                </p>
                              )}
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
                        <ConfidenceBars level={activeScore.confidence_level} />
                        <AdjustedPill original={activeScore.original_overall} overall={activeScore.overall} signed />
                        <ScoreBreakdown score={activeScore} />
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
              .filter((c) =>
                candFilter === "all" ? true
                  : candFilter === "called" ? reviews[c.id]?.status === "reviewed"
                    : candFilter === "undecided" ? !decisions[c.id]
                      : decisions[c.id] === candFilter
              )
              .sort((a, b) =>
                compareSort === "name" ? a.full_name.localeCompare(b.full_name)
                  : compareSort === "must" ? (scores[b.id]?.must_have_hit ?? 0) - (scores[a.id]?.must_have_hit ?? 0)
                    : (scores[b.id]?.overall ?? 0) - (scores[a.id]?.overall ?? 0)
              )
            const shownReqs = (reqFilter === "must" ? requirements.filter((r) => r.weight === "must")
              : reqFilter === "must_important" ? requirements.filter((r) => r.weight !== "nice")
                : requirements)
              .slice()
              .sort((a, b) => WEIGHT_RANK.indexOf(a.weight) - WEIGHT_RANK.indexOf(b.weight))
            const cols = `minmax(240px, 1.4fr) repeat(${Math.max(shownCandidates.length, 1)}, minmax(160px, 1fr))`
            // The rail: who is in, in score order. Same list step 07 reads.
            const railEntries: ShortlistEntry[] = submissionShortlisted.map((c) => ({
              id: c.id,
              name: c.full_name,
              initials: initials(c.full_name),
              overall: scores[c.id]?.overall ?? 0,
              mustHit: scores[c.id]?.must_have_hit ?? 0,
              mustTotal: scores[c.id]?.must_have_total ?? 0,
            }))
            // "Add in one go": everyone with every must-have who is not in yet,
            // and the recommendation's first group who are not in yet. Each is
            // still one decision per person, written on the recruiter's click.
            const mustHaveReady = rankedCandidates.filter((c) => {
              const s = scores[c.id]
              return s && s.must_have_total > 0 && s.must_have_hit === s.must_have_total && decisions[c.id] !== "shortlist"
            })
            const recommendedNotIn = (reco.result?.items ?? [])
              .filter((i) => i.group === "recommended" && decisions[i.candidate_id] !== "shortlist")
              .map((i) => i.candidate_id)
            const addRecommended = async () => {
              if (reco.result) return addMany(recommendedNotIn)
              const r = await reco.generate()
              if (!r) {
                setCompareTab("reco")
                return setError("The recommendation did not run, so nobody was added.")
              }
              addMany(r.items.filter((i) => i.group === "recommended").map((i) => i.candidate_id))
            }
            const railProps = {
              company: role.company || "",
              // The role's linked hiring manager, by first name (board 29).
              // Every client-side contact tied to the role sees the names (the
              // linked contact, brief contacts, recipients, panellists, slot
              // contacts — lib/agency/client-header.ts), so the rail names the
              // company, not one person: "Meridian Health sees each name…".
              clientName: role.company?.trim() || "The client",
              entries: railEntries,
              holdCount: decisionCounts.hold,
              passedCount: decisionCounts.reject,
              onRemove: (id: string) => decide(id, "shortlist"),
              onConfirm: () => setStep("submission"),
            }
            return (
              <>
                <div className="ag-screen-head">
                  <h1 className="ag-title">Compare</h1>
                </div>

                {/* Board 26: the cards and the recommendation on the left, the
                    shortlist being built on the right. The rail is the same
                    component under both tabs, so an add from either lands in
                    the same visible place. The matrix stays the default tab. */}
                <div className="ag-cmp-layout">
                <div className="ag-cmp-main">
                <div className="ag-cmp-controls">
                  <div className="ag-cmp-tabs" role="tablist" aria-label="Compare views">
                    <button
                      role="tab"
                      aria-selected={compareTab === "cards"}
                      className={compareTab === "cards" ? "on" : ""}
                      onClick={() => setCompareTab("cards")}
                    >
                      Cards
                    </button>
                    <button
                      role="tab"
                      aria-selected={compareTab === "matrix"}
                      className={compareTab === "matrix" ? "on" : ""}
                      onClick={() => setCompareTab("matrix")}
                    >
                      Matrix
                    </button>
                    <button
                      role="tab"
                      aria-selected={compareTab === "reco"}
                      className={compareTab === "reco" ? "on" : ""}
                      onClick={() => setCompareTab("reco")}
                    >
                      Recommendation
                    </button>
                  </div>
                  {compareTab !== "reco" ? (
                    <details className="ag-cmp-bulk">
                      <summary className="ag-btn ag-btn-secondary">Add in bulk ▾</summary>
                      <div className="ag-cmp-bulk-menu" role="group" aria-label="Add in bulk">
                        <button
                          type="button"
                          className="ag-cmp-bulk-item"
                          disabled={mustHaveReady.length === 0}
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open")
                            addMany(mustHaveReady.map((c) => c.id))
                          }}
                          title="One decision per person, yours, with undo."
                        >
                          Everyone with all must-haves · {mustHaveReady.length}
                        </button>
                        <button
                          type="button"
                          className="ag-cmp-bulk-item"
                          disabled={reco.busy || (Boolean(reco.result) && recommendedNotIn.length === 0)}
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open")
                            void addRecommended()
                          }}
                          title={reco.result ? "One decision per person, yours, with undo." : "Runs the recommendation first. One decision per person, yours, with undo."}
                        >
                          {reco.busy ? "Reading…" : reco.result ? `The recommended ones · ${recommendedNotIn.length}` : "The recommended ones"}
                        </button>
                      </div>
                    </details>
                  ) : (
                    reco.result && (
                      <button className="ag-btn ag-btn-secondary ag-reco-again" onClick={() => void reco.generate()} disabled={reco.busy}>
                        {reco.busy ? <><span className="ag-spin" /> Reading {candidates.length} candidates…</> : "Run it again"}
                      </button>
                    )
                  )}
                </div>
                {compareTab !== "reco" ? (
                  <>

                {/* The filter bar (frame 37): three labelled dropdowns, each
                    saying what it does. View controls only. */}
                <div className="ag-cmp-filters" role="group" aria-label="Filter the comparison">
                  <label className="ag-cmp-filter">
                    <span className="ag-label">Sort</span>
                    <select className="ag-input" value={compareSort} onChange={(e) => setCompareSort(e.target.value as typeof compareSort)}>
                      <option value="score">Score</option>
                      <option value="must">Must-haves met</option>
                      <option value="name">Name</option>
                    </select>
                  </label>
                  <label className="ag-cmp-filter">
                    <span className="ag-label">Show</span>
                    <select className="ag-input" value={reqFilter} onChange={(e) => setReqFilter(e.target.value as typeof reqFilter)}>
                      <option value="all">All requirements</option>
                      <option value="must">Must-haves only</option>
                      <option value="must_important">Must-haves and important</option>
                    </select>
                  </label>
                  <label className="ag-cmp-filter">
                    <span className="ag-label">Who</span>
                    <select className="ag-input" value={candFilter} onChange={(e) => setCandFilter(e.target.value as typeof candFilter)}>
                      <option value="all">Everyone · {candidates.length}</option>
                      <option value="undecided">Not decided yet · {decisionCounts.undecided}</option>
                      <option value="shortlist">Shortlisted · {decisionCounts.shortlist}</option>
                      <option value="hold">On hold · {decisionCounts.hold}</option>
                      <option value="reject">Passed · {decisionCounts.reject}</option>
                      <option value="called">Call logged · {reviewedCount}</option>
                    </select>
                  </label>
                  {hiddenCandidates.length > 0 && (
                    <button className="ag-btn ag-btn-secondary ag-cmp-restore" onClick={() => setHiddenCandidates([])}>Restore {hiddenCandidates.length} hidden</button>
                  )}
                </div>

                {compareTab === "cards" && (
                <div className="ag-cmp-grid">
                  {shownCandidates.map((c) => {
                    const s = scores[c.id]
                    const topRisk = requirements.find((r) => r.weight !== "nice" && effectiveStrength(c.id, r.id) === "missing")
                    const allMust = s ? s.must_have_hit === s.must_have_total : false
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
                        <div className="ag-cmp-card-body">
                          <div className="ag-cmp-who">
                            <span className="ag-cmp-name">{c.full_name}</span>
                            <span className="ag-cmp-title">{c.current_title || c.ref}</span>
                            <button
                              className="ag-icon-btn ag-cmp-hide"
                              title={`Hide ${c.full_name} from the comparison`}
                              aria-label={`Hide ${c.full_name} from the comparison`}
                              onClick={() => setHiddenCandidates((h) => [...h, c.id])}
                            >
                              ×
                            </button>
                          </div>
                          {s && (
                            <div className="ag-cmp-facts">
                              <FitHint score={s} />
                              <AdjustedPill original={s.original_overall} overall={s.overall} />
                              <span className="ag-cmp-must" data-all={allMust}>Must-haves {s.must_have_hit}/{s.must_have_total}</span>
                              {reviews[c.id]?.status === "reviewed" && <span className="ag-cmp-call">Call done</span>}
                            </div>
                          )}
                          {topRisk && <span className="ag-cmp-gap">Gap: {topRisk.text}</span>}
                          <DecisionSlot
                            decision={decisions[c.id] ?? null}
                            name={c.full_name}
                            onDecide={(d) => decide(c.id, d)}
                          />
                          <button className="ag-cmp-view" onClick={() => router.push(`/agencies/roles/${roleId}/candidates/${c.id}`)}>
                            View →
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}

                {compareTab === "matrix" && (
                <div className="ag-card" style={{ overflow: "hidden" }}>
                  <div className="ag-card-head">
                    <span className="ag-meta">{shownReqs.length} requirements × {shownCandidates.length} candidates</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: 240 + shownCandidates.length * 160 }}>
                      <div className="ag-mx-head" style={{ gridTemplateColumns: cols }}>
                        <div style={{ padding: "10px 16px" }}>
                          <Hint bare text="Strong counts 1.0, transferable 0.7, partial 0.4, missing 0. Coral cells are your overrides." className="ag-field-label ag-hint-label">Requirement</Hint>
                        </div>
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
                )}

                  </>
                ) : (
                  <RecommendationPanel
                    candidateCount={candidates.length}
                    callsLogged={reviewedCount}
                    result={reco.result}
                    busy={reco.busy}
                    error={reco.error}
                    onGenerate={() => void reco.generate()}
                    decisions={decisions}
                    onDecide={(id, d) => decide(id, d)}
                    onAddMany={addMany}
                    onOpenCandidate={(id) => router.push(`/agencies/roles/${roleId}/candidates/${id}`)}
                  />
                )}
                </div>

                <aside className="ag-cmp-rail">
                  <ShortlistRail {...railProps} />
                </aside>
                </div>

                {/* The tally under both tabs. Confirm lives on the rail now,
                    so this bar carries no button: count, and the keys. The
                    undo a bulk add leaves behind rides here too, because the
                    bar is where the eye already is (sticky at the bottom on
                    desktop, fixed above the shortlist bar on a phone) — a
                    group add three screens down must still be able to reach
                    its Undo before the eight seconds are up. */}
                <div className="ag-decisions-bar">
                  <div className="ag-undo" role="status" data-empty={!undo}>
                    {undo && (
                      <>
                        <span>Added {undo.n} to the shortlist</span>
                        <span className="ag-undo-dot" aria-hidden>·</span>
                        <button type="button" className="ag-undo-btn" onClick={undoLast}>Undo</button>
                      </>
                    )}
                  </div>
                  <span className="ag-decisions-tally">
                    {decisionTotals} · <b>{decisionCounts.undecided} undecided</b>
                  </span>
                  <span className="ag-grow" />
                  <Hint
                    info
                    className="ag-kbd-hints"
                    content={
                      <>
                        <span className="ag-hint-block"><kbd className="ag-kbd">S</kbd> add / remove</span>
                        <span className="ag-hint-block"><kbd className="ag-kbd">H</kbd> hold</span>
                        <span className="ag-hint-block"><kbd className="ag-kbd">R</kbd> pass</span>
                      </>
                    }
                  >
                    Keys
                  </Hint>
                </div>

                {/* ≤ 900px: the rail as a sticky bottom bar, opening as a sheet. */}
                <ShortlistBar {...railProps} />
              </>
            )
          })()}

          {role && step === "submission" && (() => {
            // Every list here is memoised at component level — see
            // submissionRows. Nothing in this IIFE may derive from `intro`.
            const shortlistedList = submissionShortlisted
            const heldList = submissionHeld
            const snap = submissionSnap
            const recipients = contacts.filter((c) => chosenContacts.includes(c.id))
            const musts = submissionMusts
            const rows = submissionRows
            /**
             * Derived, not from this session alone. `snap` is only populated
             * by a send in THIS session, so after a reload a role that has
             * already gone to the client had `snap === null` and the bar
             * offered a live "Send to client" as though nothing had happened.
             * The phase survives the reload; both are consulted.
             */
            const alreadySent = Boolean(snap) || (phase !== null && phase !== "shortlist")
            const company = role.company || "the client"
            const noWorkspace = recipients.filter((c) => !c.has_workspace)
            const passed = notShortlisted.filter((c) => decisions[c.id] !== "hold")
            // Two shortlisted rows that are the same person (ingest's
            // duplicate_of) would reach the client as two people.
            const shortlistedIds = new Set(shortlistedList.map((c) => c.id))
            const twins = shortlistedList.filter((c) => c.duplicate_of && shortlistedIds.has(c.duplicate_of))
            const introShown = snap ? snap.intro ?? "" : intro
            const sendLabel =
              recipients.length === 0
                ? "Choose who gets it"
                : `3 · Send to ${recipients.length === 1 ? (recipients[0].full_name || "1 person") : `${recipients.length} people`} at ${role.company || "the client"} →`

            return (
              <>
                {/* The document, for print only (board 34: files are extras).
                    Mounted at <body> so printing it hides the app. */}
                <PrintPortal>
                  <div className="ag-print-doc">
                    <SubmissionDocument
                      rows={rows}
                      disclosure={snap?.disclosure ?? disclosure}
                      intro={introShown}
                      roleTitle={role.title}
                      company={role.company}
                      stats={{ reviewed: candidates.length, shortlisted: rows.length, musts: musts.length, held: decisionCounts.hold }}
                    />
                  </div>
                </PrintPortal>

                {/* Board 40 (8 Oct 2026): where this sits in add → confirm → send. */}
                <ShortlistStages at={2} done={alreadySent} />
                <div className="ag-screen-head">
                  <div>
                    <h1 className="ag-title">
                      {countWordCap(shortlisted)} candidate{shortlisted === 1 ? "" : "s"}, ready for {company}.
                    </h1>
                    <p className="ag-sub">
                      Send the shortlist to the client&rsquo;s workspace, with your reasoning attached.
                    </p>
                  </div>
                  {/* A COMPLETED STATE MUST NOT BE ARMED (13 Sep 2026).
                      This was one primary that read "✓ Submission sent" and
                      stayed enabled — disabled only while busy or on an empty
                      shortlist — so the moment a send finished it was
                      clickable again, and a second click minted a second
                      snapshot, fresh portal links and another email to the
                      client. The route's only refusal is the right-to-
                      represent gate; nothing anywhere said "already sent".

                      Once it has gone, the primary stops existing. What
                      replaces it is a fact, and the only primary left on the
                      screen is the receipt's "Go to interviews". */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button className="ag-btn" onClick={() => setStep("compare")}>Back to compare</button>
                    {alreadySent ? (
                      <>
                        <span className="ag-sent-chip" role="status">
                          {snap
                            ? `Sent ${new Date(snap.generated_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                            : "Sent"}
                        </span>
                        <button
                          className="ag-btn ag-btn-secondary"
                          disabled={shortlisted === 0 || busy !== null}
                          onClick={() => setResendAsk(true)}
                        >
                          {busy === "submission" ? <><span className="ag-spin" /> Sending</> : "Send again…"}
                        </button>
                      </>
                    ) : (
                      <button
                        className="ag-btn ag-btn-primary"
                        onClick={() => generateSubmission()}
                        disabled={shortlisted === 0 || recipients.length === 0 || busy !== null}
                      >
                        {busy === "submission" ? <><span className="ag-spin" /> Sending</> : sendLabel}
                      </button>
                    )}
                  </div>
                </div>

                {/* Shown from the derived phase as well as this session's send,
                    so the completion survives a reload: a recruiter who comes
                    back tomorrow sees where the client is up to, not a bare
                    send button. */}
                {alreadySent && (
                  <SubmissionProgress
                    roleId={roleId}
                    company={role.company}
                    delivery={submissionResult?.delivery ?? null}
                    links={submissionResult?.links ?? []}
                    showLinks={extras.link}
                    onGoInterviews={() => router.push(`/agencies/roles/${roleId}/interviews`)}
                    onPdf={printShortlistDocument}
                    onCopyEmail={copyEmailText}
                    whoHasIt={<SentLinks roleId={roleId} />}
                  />
                )}

                {resendAsk && (
                  <div className="ag-card" style={{ marginBottom: 16, borderColor: "var(--ag-warn)" }} role="alertdialog" aria-labelledby="resend-title">
                    <div className="ag-card-body" style={{ padding: 18 }}>
                      <div id="resend-title" style={{ fontWeight: 600, marginBottom: 6 }}>
                        This shortlist has already gone to {role.company || "your client"}.
                      </div>
                      <p className="ag-note" style={{ margin: "0 0 6px" }}>
                        Sending again adds a second snapshot with fresh links; the copy they hold stays
                        as it was. Recorded under your name.
                      </p>
                      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                        <button
                          className="ag-btn ag-btn-primary"
                          disabled={busy !== null || recipients.length === 0}
                          onClick={() => { setResendAsk(false); void generateSubmission() }}
                        >
                          Send a second submission
                        </button>
                        <button className="ag-btn ag-btn-secondary" disabled={busy !== null} onClick={() => setResendAsk(false)}>
                          Cancel
                        </button>
                      </div>
                      {recipients.length === 0 && (
                        <p className="ag-prose-note" style={{ margin: "10px 0 0" }}>Choose who gets it first.</p>
                      )}
                    </div>
                  </div>
                )}

                {representAsk && (
                  <div className="ag-card" style={{ marginBottom: 16, borderColor: "var(--ag-warn)" }} role="alertdialog" aria-labelledby="rep-ask-title">
                    <div className="ag-card-body" style={{ padding: 18 }}>
                      <div id="rep-ask-title" style={{ fontWeight: 600, marginBottom: 6 }}>
                        {representAsk.refs.join(", ")} {representAsk.refs.length === 1 ? "has" : "have"} not agreed to be put forward.
                      </div>
                      <p className="ag-note" style={{ margin: "0 0 6px" }}>
                        The ask is on their rights page, unanswered — and unanswered is not yes. Going
                        ahead is your call and audit-logged; they can still withdraw, which stops future
                        submissions.
                      </p>
                      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                        <button
                          className="ag-btn ag-btn-primary"
                          disabled={busy !== null}
                          onClick={() => generateSubmission(true)}
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
                      Nothing shortlisted yet — shortlist candidates on Compare.
                    </div>
                  </div>
                ) : (
                  <div className="ag-sub-grid">
                    <div className="ag-stack" style={{ minWidth: 0 }}>
                      {!alreadySent && (
                        <section className="ag-card" aria-labelledby="who-h">
                          <div className="ag-card-head">
                            <span className="ag-card-title" id="who-h">Who gets it</span>
                            <span className="ag-meta">in their workspace</span>
                          </div>
                          <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                            {contacts.length === 0 && (
                              <p className="ag-note" style={{ margin: 0 }}>
                                No client contacts yet — add the hiring manager under Client access.
                              </p>
                            )}
                            {contacts.map((contact) => {
                              const checked = chosenContacts.includes(contact.id)
                              return (
                                <label key={contact.id} className="ag-who-row">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => setChosenContacts((prev) => (e.target.checked ? [...prev, contact.id] : prev.filter((id) => id !== contact.id)))}
                                  />
                                  <span className="ag-avatar" style={{ width: 34, height: 34, fontSize: 12 }} aria-hidden="true">
                                    {initials(contact.full_name || contact.company || "?")}
                                  </span>
                                  <span className="ag-grow" style={{ minWidth: 0 }}>
                                    <span className="ag-who-name">{contact.full_name || contact.email}</span>
                                    <span className="ag-prose-note">
                                      {contact.company}
                                      {contact.id === role.contact_id ? " · this role's contact" : ""}
                                    </span>
                                  </span>
                                  <span className="ag-who-state">
                                    <span className="ag-who-chip" data-tone={contact.has_workspace ? "ok" : "new"}>
                                      {contact.has_workspace ? "Has a workspace" : "No account yet"}
                                    </span>
                                    <span className="ag-prose-note">
                                      {contact.has_workspace ? "Sees it the moment you send" : "Gets an invite with the shortlist"}
                                    </span>
                                  </span>
                                </label>
                              )
                            })}
                            {addingContact ? (
                              <div className="ag-stack" style={{ gap: 8, borderTop: "1px solid var(--ag-border)", paddingTop: 12 }}>
                                <div className="ag-who-form">
                                  <input className="ag-input" placeholder="Name" aria-label="Name" value={newContact.full_name} onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })} />
                                  <input className="ag-input" placeholder="Email" aria-label="Email" type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                                  <input className="ag-input" placeholder="Company" aria-label="Company" value={newContact.company} onChange={(e) => setNewContact({ ...newContact, company: e.target.value })} />
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button className="ag-btn ag-btn-secondary" onClick={() => void createContact().then(() => setAddingContact(false))}>Add and include</button>
                                  <button className="ag-btn" onClick={() => setAddingContact(false)}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                className="ag-linkbtn"
                                style={{ alignSelf: "flex-start" }}
                                onClick={() => {
                                  setNewContact((n) => ({ ...n, company: n.company || role.company || "" }))
                                  setAddingContact(true)
                                }}
                              >
                                + Add someone from {role.company || "the client"}
                              </button>
                            )}
                          </div>
                        </section>
                      )}

                      <section className="ag-card" aria-labelledby="note-h">
                        <div className="ag-card-head">
                          <span className="ag-card-title" id="note-h">Your note to them</span>
                          <span className="ag-meta">{snap ? "as sent" : "optional"}</span>
                        </div>
                        <div className="ag-card-body">
                          {snap ? (
                            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{snap.intro || "No introduction was written."}</p>
                          ) : (
                            <textarea
                              className="ag-textarea"
                              style={{ minHeight: 76 }}
                              aria-label="Submission introduction"
                              defaultValue={introRef.current}
                              onChange={(e) => onIntroChange(e.target.value)}
                            />
                          )}
                        </div>
                      </section>

                      <SubmissionPreview
                        rows={rows}
                        disclosure={snap?.disclosure ?? disclosure}
                        intro={introShown}
                        roleTitle={role.title}
                        agencyName={agencyName}
                      />
                    </div>

                    <div className="ag-sub-side">
                      {!alreadySent && (
                        <div className="ag-card">
                          <div className="ag-card-head"><span className="ag-card-title">Ready to send</span></div>
                          <div className="ag-card-body">
                            <ul className="ag-ready">
                              <li data-ok="true">
                                <span>{shortlisted} shortlisted{heldList.length > 0 ? `, ${heldList.length} held back` : ""}</span>
                                <small>Held and passed stay with you. Nothing about them is sent.</small>
                              </li>
                              <li data-ok={recipients.length > 0}>
                                <span>{recipients.length > 0 ? `Going to ${recipients.length === 1 ? "1 person" : `${recipients.length} people`}` : "Nobody chosen yet"}</span>
                                {recipients.length === 0 && <small>Tick who gets it on the left.</small>}
                              </li>
                              {recipients.length > 0 && (
                                <li data-ok={noWorkspace.length === 0}>
                                  <Hint
                                    bare
                                    text={noWorkspace.length === 0 ? "Sent to their Tailr account — no email to find." : "The invite and shortlist arrive in one email."}
                                  >
                                    {noWorkspace.length === 0
                                      ? recipients.length === 1 ? "They have a workspace" : "They all have a workspace"
                                      : `${noWorkspace.length} will be invited first`}
                                  </Hint>
                                </li>
                              )}
                              {twins.map((c) => (
                                <li key={c.id} data-ok="false">
                                  <span>{c.ref} looks like {candidates.find((o) => o.id === c.duplicate_of)?.ref ?? "another candidate"}</span>
                                  <small>Both shortlisted — the client would see two people.</small>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      <div className="ag-card">
                        <div className="ag-card-head"><span className="ag-card-title">What they see</span></div>
                        <div className="ag-card-body ag-stack" style={{ gap: 0 }}>
                          {([
                            ["scores", "Fit scores"],
                            ["evidence", "Must-have evidence"],
                            ["probes", "What to probe at interview"],
                            ["notes", "Your call notes"],
                            ["logistics", "Comp and logistics"],
                            // The CV itself (22 Sep 2026): on by default, the
                            // recruiter's to withhold. The E2E found it
                            // freezing ON with no switch and no mention.
                            ["cv", "The CV, contact details removed"],
                          ] as const).map(([key, label]) => {
                            const value = (snap?.disclosure ?? disclosure)[key]
                            return (
                              <button
                                key={key}
                                role="switch"
                                aria-checked={value}
                                className="ag-toggle-row"
                                disabled={Boolean(snap) || alreadySent}
                                onClick={() => setDisclosure((d) => ({ ...d, [key]: !d[key] }))}
                              >
                                <span style={{ fontSize: 12.5 }}>{label}</span>
                                <span className="ag-switch" data-on={value}><span className="ag-switch-knob" /></span>
                              </button>
                            )
                          })}
                          <p className="ag-meta" style={{ margin: "10px 0 0" }}>
                            {alreadySent
                              ? "Locked. These choices were written into the submission when you sent it."
                              : "Frozen into the submission when you send; what the client received never changes."}
                          </p>
                        </div>
                      </div>

                      {!alreadySent && (
                        <div className="ag-card">
                          <div className="ag-card-head">
                            <span className="ag-card-title">Also deliver as</span>
                            <span className="ag-meta">optional</span>
                          </div>
                          <div className="ag-card-body ag-stack" style={{ gap: 12 }}>
                            {([
                              ["email", "Email them a summary", "Names and a link back only — never the shortlist in an inbox."],
                              ["pdf", "PDF for their files", ""],
                              ["link", "A link for someone without an account", "Expires in 30 days, revocable. Shown once after you send."],
                            ] as const).map(([key, title, sub]) => (
                              <label key={key} className="ag-extra-row">
                                <input
                                  type="checkbox"
                                  checked={extras[key]}
                                  onChange={(e) => setExtras((x) => ({ ...x, [key]: e.target.checked }))}
                                />
                                <span>
                                  {key === "pdf" ? (
                                    <Hint bare text="Printable, with the confidentiality footer and known gaps. Opens to save when you send." className="ag-extra-title">
                                      {title}
                                    </Hint>
                                  ) : (
                                    <span className="ag-extra-title">{title}</span>
                                  )}
                                  {sub && <span className="ag-prose-note">{sub}</span>}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {(heldList.length > 0 || passed.length > 0) && (
                        <details className="ag-card ag-stays">
                          <summary className="ag-card-head">
                            <span className="ag-card-title">Stays with you</span>
                            <span className="ag-meta">
                              {[heldList.length > 0 ? `${heldList.length} held` : "", passed.length > 0 ? `${passed.length} not shortlisted` : ""].filter(Boolean).join(" · ")}
                            </span>
                          </summary>
                          <div className="ag-card-body ag-stack" style={{ gap: 10 }}>
                            {[...heldList, ...passed].map((c) => (
                              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  <span className="ag-avatar" style={{ width: 22, height: 22, fontSize: 9 }}>{initials(c.full_name)}</span>
                                  <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.full_name}</span>
                                </span>
                                <span className="ag-pill">{decisions[c.id] === "hold" ? "on hold" : decisions[c.id] === "reject" ? "passed" : "undecided"}</span>
                              </div>
                            ))}
                            <p className="ag-note">
                              Never sent to the client; the reasons stay in the audit log.
                            </p>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* Nothing sits below the step content. The matching window is
              reached from step 03, where sourcing lives. */}
        </div>

        {/* The matching window. One instance for the screen: the publish card
            and step 03 both open THIS, so there is no second place where the
            matched people are rendered and no chance of the two disagreeing. */}
        <MatchingWindow
          open={matchWindow}
          onClose={() => setMatchWindow(false)}
          roleRef={role?.ref ?? ""}
          requirements={requirements}
          matching={matching}
          matched={matched}
          pool={pool}
          inviting={inviting}
          onWithdraw={withdrawInvite}
          onInvite={invite}
          canInvite={callerRole !== "viewer"}
          minScore={minScoreDraft}
          onMinScoreChange={setMinScoreDraft}
          onPublish={setMatchingEnabled}
          busy={busy === "matching"}
          canPublish={callerRole !== "viewer"}
        />
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
                  <button
                    className="ag-btn ag-btn-secondary"
                    title="Stops this one link. The record of what they were sent stays, and other recipients are untouched."
                    onClick={() => setConfirming(r.id)}
                  >
                    Revoke
                  </button>
                ))}
            </div>
          ))
        )}
        {error && <span className="ag-meta" style={{ color: "var(--ag-coral-text)" }}>{error}</span>}
      </div>
    </div>
  )
}
