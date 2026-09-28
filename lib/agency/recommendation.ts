/**
 * The shortlist recommendation — step 05's second tab.
 *
 * Ose's ask, 19 Sep 2026: "the AI should be able to suggest who to shortlist
 * based on the screening call and the final scores", with the efficiency case
 * being fifty candidates rather than ten. This module is the half that has to
 * be right: what the model is allowed to see, and what its answer has to
 * survive before a recruiter reads it.
 *
 * SERVER-IMPORT-FREE ON PURPOSE. The page imports the types and the group
 * labels; importing a runtime constant from a module that reaches
 * `agencyAdmin` drags `next/headers` and the service-role key into the
 * browser bundle and fails the build. Same pattern as settings-limits.ts and
 * round-delta.ts.
 *
 * ── The four things this file exists to enforce ──────────────────────────
 *
 * 1. THE MODEL NEVER SEES A NAME. Candidates go in as refs (CAN-01) and come
 *    back as refs; names are attached afterwards, here, from the row the
 *    recruiter already has. A model that cannot read a name cannot reason
 *    from one.
 *
 * 2. THE MODEL NEVER SEES THE SOFT SIGNALS. `candidate_reviews.communication`
 *    and `.motivation` are 1-5 stars a recruiter may set; they are the only
 *    fields in the schema that rate a person rather than their evidence, and
 *    they are deliberately absent from `buildRecommendationInput`. A
 *    source-scan test fails the build if the route starts selecting them.
 *
 * 3. EVERY REASON SHOWS ITS WORKING. The model does not write citations in
 *    prose; it picks trace ids from an allowlist computed here from the real
 *    rows. Anything it invents is dropped, and a reason left with no trace is
 *    replaced by a fact line this file computes. "A reason that cannot show
 *    its working is not shippable" (docs/NEXT-SESSION-SHORTLIST-RECOMMENDATIONS.md).
 *
 * 4. NOBODY FALLS OFF. Every candidate handed in comes back out exactly once.
 *    A candidate the model forgot is appended to `not_yet` with a computed
 *    reason rather than silently vanishing — the failure mode the whole
 *    product is built against. Grouping is not filtering: the matrix still
 *    renders all of them, in the recruiter's order, and no code path here
 *    writes to `recruiter_reviews`.
 */

import type { Strength, Weight } from "@/lib/agency/types"

export type RecommendationGroup = "recommended" | "second_look" | "not_yet"

/** Display order and copy. "not_yet" keeps its adverb — it is the whole word. */
export const GROUP_LABELS: Record<RecommendationGroup, string> = {
  recommended: "Recommended",
  second_look: "Worth a second look",
  not_yet: "Not recommended yet",
}

export const GROUP_ORDER: RecommendationGroup[] = ["recommended", "second_look", "not_yet"]

export function isRecommendationGroup(v: unknown): v is RecommendationGroup {
  return v === "recommended" || v === "second_look" || v === "not_yet"
}

// ── What goes to the model ───────────────────────────────────────────────

export interface RecommendationRequirementInput {
  ref: string
  weight: Weight
  strength: Strength
  /** Verbatim CV quote, capped. Null when the evidence row is MISSING. */
  quote: string | null
  /** True when the recruiter moved this strength themselves. */
  overridden: boolean
  /** What the recruiter typed on the call against this requirement's probe. */
  call_answer: string | null
}

export interface RecommendationCandidateInput {
  ref: string
  overall: number
  must_hit: number
  must_total: number
  /** Whether a screening call has been logged at all. */
  reviewed: boolean
  /** The recruiter's private call notes, capped. Their words, not a rating. */
  notes: string
  requirements: RecommendationRequirementInput[]
}

export interface RecommendationInput {
  role_title: string
  candidates: RecommendationCandidateInput[]
}

// ── What comes back ──────────────────────────────────────────────────────

export interface RecommendationItem {
  candidate_id: string
  ref: string
  full_name: string
  group: RecommendationGroup
  /** One sentence. Validated, trace-backed, and never about the person. */
  reason: string
  /** Human-readable citations, already resolved from the allowlist. */
  traces: string[]
  /** True when the model's reason was refused and this one was computed. */
  computed: boolean
  overall: number
  must_hit: number
  must_total: number
}

export interface RecommendationResult {
  generated_at: string
  model: string
  role_ref: string
  items: RecommendationItem[]
  /** Requirements no candidate has evidence or a call answer for. */
  unasked: Array<{ ref: string; text: string; weight: Weight; candidates: number }>
  /** Candidates with no screening call logged at all. */
  no_call: number
  counts: Record<RecommendationGroup, number>
}

// ── Caps ─────────────────────────────────────────────────────────────────

export const QUOTE_CAP = 400
export const ANSWER_CAP = 600
export const NOTES_CAP = 1200
export const REASON_CAP = 400

/**
 * Trim a long reason at a sentence boundary rather than mid-word.
 *
 * The live model writes to the brief it is given, and when the brief drifts
 * it writes 900-character paragraphs. A hard `.slice(0, 400)` turned one of
 * those into "...and the record also shows R07 was not as" on screen, which
 * reads as a broken product rather than a long answer. Keep whole sentences
 * up to the cap; if the very first sentence is already over it, fall back to
 * a word boundary and an ellipsis.
 */
export function trimToSentence(prose: string, cap = REASON_CAP): string {
  const text = prose.trim()
  if (text.length <= cap) return text
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? []
  let out = ""
  for (const s of sentences) {
    if ((out + s).trim().length > cap) break
    out += s
  }
  out = out.trim()
  if (out) return out
  const cut = text.slice(0, cap)
  const space = cut.lastIndexOf(" ")
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`
}
/** Above this the payload stops being worth sending in one request. */
export const MAX_RECOMMENDATION_CANDIDATES = 50

// ── Trace ids ────────────────────────────────────────────────────────────

/**
 * The ids the model may cite, and how each renders.
 *
 * Shaped `kind:REF` so the allowlist is a Set lookup rather than a parse.
 * `notes` and `no-call` are candidate-wide and carry no requirement.
 */
export function traceLabel(id: string): string | null {
  if (id === "notes") return "Your call notes"
  if (id === "no-call") return "No screening call logged"
  const [kind, ref] = id.split(":")
  if (!ref || !/^[A-Z]\d{1,3}$/.test(ref)) return null
  switch (kind) {
    case "cv":
      return `CV · ${ref} quote`
    case "call":
      return `Your call note · ${ref}`
    case "override":
      return `Your override · ${ref}`
    case "missing":
      return `${ref} · MISSING`
    case "unasked":
      return `${ref} · not asked on the call`
    default:
      return null
  }
}

/** Every id this candidate's own rows actually support. */
export function allowedTraces(c: RecommendationCandidateInput): Set<string> {
  const out = new Set<string>()
  if (c.notes.trim()) out.add("notes")
  if (!c.reviewed) out.add("no-call")
  for (const r of c.requirements) {
    if (r.quote && r.quote.trim()) out.add(`cv:${r.ref}`)
    if (r.call_answer && r.call_answer.trim()) out.add(`call:${r.ref}`)
    if (r.overridden) out.add(`override:${r.ref}`)
    if (r.strength === "missing") {
      out.add(`missing:${r.ref}`)
      if (!r.call_answer || !r.call_answer.trim()) out.add(`unasked:${r.ref}`)
    }
  }
  return out
}

// ── The language guard ───────────────────────────────────────────────────

/**
 * Words that describe a PERSON rather than their evidence, plus the verdict
 * vocabulary the product refuses to print.
 *
 * This is belt and braces over the prompt: the prompt forbids all of it, and
 * a reason that contains any of it is thrown away and replaced with a
 * computed fact line rather than shown. `communication` and `motivation` are
 * here too — not because the model is given them (it is not, see
 * buildRecommendationInput) but so that the day someone adds them, the
 * output stops rather than the guard.
 *
 * Whole-word matched, so "reject" catches "rejected" only via its own entry
 * and "confidence" never catches the score component name inside a trace
 * label (labels are not scanned — only model prose is).
 */
export const FORBIDDEN_REASON_TERMS = [
  "confident", "confidence", "articulate", "fluent", "personable", "charismatic",
  "enthusiastic", "passionate", "personality", "attitude", "demeanour", "demeanor",
  "rapport", "likeable", "likable", "impression", "impressive", "tone", "sentiment",
  "culture fit", "cultural fit", "culture-fit", "seems", "feels",
  // Tense matters: the first probe of this guard was defeated by "came
  // across" while "comes across" was listed.
  "comes across", "came across", "coming across", "come across",
  "communication", "motivation", "motivated", "energy", "vibe",
  "reject", "rejected", "unsuitable", "not suitable", "weak candidate", "poor candidate",
] as const

const FORBIDDEN_RE = new RegExp(
  `\\b(${FORBIDDEN_REASON_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|")})\\b`,
  "i"
)

/** The term that tripped the guard, or null when the prose is clean. */
export function forbiddenTerm(reason: string): string | null {
  const m = FORBIDDEN_RE.exec(reason)
  return m ? m[1].toLowerCase() : null
}

// ── Computed fact lines ──────────────────────────────────────────────────

/**
 * The reason this file writes when the model's is refused or missing.
 *
 * Nothing here is a judgement: coverage, then the first must-have with
 * nothing under it, then whether anyone has asked about it. It reads as a
 * sentence because a recruiter has to be able to act on it, but every clause
 * is a count or a ref.
 */
export function computedReason(c: RecommendationCandidateInput): string {
  if (!c.reviewed) {
    return `No screening call logged yet. ${c.must_hit} of ${c.must_total} must-haves evidenced on the CV alone — nothing has been asked of them.`
  }
  const musts = c.requirements.filter((r) => r.weight === "must")
  const gap = musts.find((r) => r.strength === "missing")
  if (!gap) {
    return `Clears all ${c.must_total} must-haves on the record as it stands.`
  }
  const asked = Boolean(gap.call_answer && gap.call_answer.trim())
  return asked
    ? `${c.must_hit} of ${c.must_total} must-haves evidenced. ${gap.ref} has no evidence; your call answer is the only thing under it.`
    : `${c.must_hit} of ${c.must_total} must-haves evidenced. ${gap.ref} has no evidence and no call answer — it has not been asked.`
}

/** The traces that back a computed reason, so even the fallback cites. */
export function computedTraces(c: RecommendationCandidateInput): string[] {
  const allowed = allowedTraces(c)
  const out: string[] = []
  if (!c.reviewed && allowed.has("no-call")) out.push("no-call")
  const musts = c.requirements.filter((r) => r.weight === "must")
  const gap = musts.find((r) => r.strength === "missing")
  if (gap) {
    if (allowed.has(`unasked:${gap.ref}`)) out.push(`unasked:${gap.ref}`)
    else if (allowed.has(`missing:${gap.ref}`)) out.push(`missing:${gap.ref}`)
    if (allowed.has(`call:${gap.ref}`)) out.push(`call:${gap.ref}`)
  } else {
    const evidenced = c.requirements.find((r) => r.weight === "must" && allowed.has(`cv:${r.ref}`))
    if (evidenced) out.push(`cv:${evidenced.ref}`)
  }
  return out.slice(0, 3)
}

// ── Validation ───────────────────────────────────────────────────────────

export interface RawRecommendationItem {
  ref?: unknown
  group?: unknown
  reason?: unknown
  traces?: unknown
}

/**
 * Turn what the model said into what the recruiter sees.
 *
 * The invariant this function is written around: `items.length` equals
 * `input.candidates.length`, always, whatever the model returned. Unknown
 * refs are dropped, duplicates keep the first, and anyone missed is appended
 * to `not_yet` with a computed reason. Nothing is ever removed for being
 * unmentioned — that would be the automatic rejection the product does not do.
 */
export function validateRecommendation(
  raw: RawRecommendationItem[],
  input: RecommendationInput,
  identify: (ref: string) => { candidate_id: string; full_name: string } | null
): RecommendationItem[] {
  const byRef = new Map(input.candidates.map((c) => [c.ref, c]))
  const seen = new Set<string>()
  const items: RecommendationItem[] = []

  const push = (c: RecommendationCandidateInput, group: RecommendationGroup, reason: string, traces: string[], computed: boolean) => {
    const who = identify(c.ref)
    if (!who) return
    items.push({
      candidate_id: who.candidate_id,
      ref: c.ref,
      full_name: who.full_name,
      group,
      reason,
      traces: traces.map(traceLabel).filter((l): l is string => Boolean(l)),
      computed,
      overall: c.overall,
      must_hit: c.must_hit,
      must_total: c.must_total,
    })
  }

  for (const item of Array.isArray(raw) ? raw : []) {
    const ref = typeof item.ref === "string" ? item.ref.trim() : ""
    const c = byRef.get(ref)
    if (!c || seen.has(ref)) continue
    seen.add(ref)

    const group = isRecommendationGroup(item.group) ? item.group : "not_yet"
    const allowed = allowedTraces(c)
    const traces = (Array.isArray(item.traces) ? item.traces : [])
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => allowed.has(t))
      .slice(0, 4)

    const prose = typeof item.reason === "string" ? trimToSentence(item.reason) : ""
    // Three ways a reason is refused: empty, unbacked, or about the person.
    const refused = !prose || traces.length === 0 || forbiddenTerm(prose) !== null
    if (refused) {
      push(c, group, computedReason(c), computedTraces(c), true)
    } else {
      push(c, group, prose, traces, false)
    }
  }

  // Anyone the model did not mention. They are not hidden; they are listed.
  for (const c of input.candidates) {
    if (seen.has(c.ref)) continue
    push(c, "not_yet", computedReason(c), computedTraces(c), true)
  }

  return items
}

export function countGroups(items: RecommendationItem[]): Record<RecommendationGroup, number> {
  const counts: Record<RecommendationGroup, number> = { recommended: 0, second_look: 0, not_yet: 0 }
  for (const i of items) counts[i.group] += 1
  return counts
}
