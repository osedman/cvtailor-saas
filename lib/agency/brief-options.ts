/**
 * The client brief — the terms of a search — as configuration.
 *
 * Figma frame 25, signed off 23 Sep 2026. Ose's brief in one line: "as much
 * dropdown as possible." Every field here is a choice from a set the product
 * already owns, because typed, "Priya Raman" and "P. Raman" are two people
 * and "45 mins" is not a number the wave planner can size a window to. Free
 * text is where a brief stops being configuration and goes back to being a
 * document — which is what killed the first one.
 *
 * THIS MODULE IMPORTS NOTHING FROM THE SERVER. The option sets are rendered
 * by the recruiter's form and the client's review page, both in the browser,
 * and a runtime constant that drags `agencyAdmin` into a client bundle fails
 * the build (settings-limits.ts is the precedent). Keep it that way.
 *
 * Two tiers, one pill: the client AGREES to the first four sections and
 * ACKNOWLEDGES the rest. `TIER` says which, once, and both screens read it.
 */

// ── option sets ───────────────────────────────────────────────────────────

export const ROUND_PURPOSES = ["screen", "technical", "panel", "case", "final", "culture"] as const
export type RoundPurpose = (typeof ROUND_PURPOSES)[number]
export const ROUND_PURPOSE_LABEL: Record<RoundPurpose, string> = {
  screen: "Screen",
  technical: "Technical",
  panel: "Panel",
  case: "Case study",
  final: "Final",
  culture: "Culture",
}

export const ROUND_FORMATS = ["video", "in_person", "phone"] as const
export type RoundFormat = (typeof ROUND_FORMATS)[number]
export const ROUND_FORMAT_LABEL: Record<RoundFormat, string> = {
  video: "video",
  in_person: "in person",
  phone: "phone",
}

export const DURATIONS_MIN = [30, 45, 60, 90, 120] as const
export const TURNAROUND_DAYS = [1, 2, 3, 5] as const
export const FEEDBACK_DAYS = [2, 3, 5, 10] as const
export const NOTICE_HOURS = [12, 24, 48] as const
export const BUFFER_MIN = [0, 10, 15, 30] as const
export const MAX_PER_DAY = { min: 1, max: 6 } as const
export const MAX_ROUNDS = 6
export const OWNERSHIP_MONTHS = [6, 12, 18, 24] as const
export const REBATE_WEEKS = { min: 0, max: 26 } as const
export const SHORTLIST_SIZE = { min: 1, max: 10 } as const

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"] as const
export type Weekday = (typeof WEEKDAYS)[number]
export const WEEKDAY_LABEL: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" }

export const FEE_BASES = ["contingent", "retained", "fixed"] as const
export type FeeBasis = (typeof FEE_BASES)[number]
export const FEE_BASIS_LABEL: Record<FeeBasis, string> = { contingent: "Contingent", retained: "Retained", fixed: "Fixed fee" }

export const REBATE_SHAPES = ["sliding", "full", "none"] as const
export type RebateShape = (typeof REBATE_SHAPES)[number]
export const REBATE_SHAPE_LABEL: Record<RebateShape, string> = { sliding: "Sliding", full: "Full", none: "None" }

export const INVOICE_POINTS = ["offer_accepted", "start_date", "start_plus_30"] as const
export type InvoicePoint = (typeof INVOICE_POINTS)[number]
export const INVOICE_POINT_LABEL: Record<InvoicePoint, string> = {
  offer_accepted: "On offer accepted",
  start_date: "On start date",
  start_plus_30: "30 days after start",
}

export const FEEDBACK_MODES = ["via_recruiter", "direct", "none"] as const
export type FeedbackMode = (typeof FEEDBACK_MODES)[number]
export const FEEDBACK_MODE_LABEL: Record<FeedbackMode, string> = {
  via_recruiter: "Yes, via the recruiter",
  direct: "Yes, directly from the client",
  none: "No",
}

export const REFERENCE_KINDS_ON_BRIEF = ["character", "hr"] as const

/** Half-hour steps, "HH:MM". */
export const TIME_STEPS: string[] = Array.from({ length: 29 }, (_, i) => {
  const mins = 7 * 60 + i * 30 // 07:00 → 21:00
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${mins % 60 === 0 ? "00" : "30"}`
})

// ── the config ────────────────────────────────────────────────────────────

export interface BriefRound {
  purpose: RoundPurpose
  format: RoundFormat
  /** client_contacts ids, in order. The first decides. */
  interviewerIds: string[]
  durationMinutes: number
}

export interface BriefDisclosure {
  scores: boolean
  evidence: boolean
  notes: boolean
  cv: boolean
  logistics: boolean
}

export interface BriefConfig {
  // Tier 1 — the client agrees
  rounds: BriefRound[]
  decisionTurnaroundDays: number
  interviewDays: Weekday[]
  windowFrom: string
  windowTo: string
  noticeHours: number
  bufferMinutes: number
  maxPerDay: number
  disclosure: BriefDisclosure
  feedbackMode: FeedbackMode
  feedbackDays: number
  // Tier 2 — the agency states
  feeBasis: FeeBasis
  feePercent: number
  rebateWeeks: number
  rebateShape: RebateShape
  invoicePoint: InvoicePoint
  ownershipMonths: number
  /** client_contacts id. */
  offerAuthorityContactId: string | null
  offerCeiling: number | null
  /** "YYYY-MM". */
  startTargetMonth: string | null
  shortlistSize: number
  referencesWanted: Array<"character" | "hr">
  /** The one free-text field, optional, capped. */
  note: string
}

/** Which tier each top-level key belongs to. The pill both screens render. */
export const TIER: Record<keyof BriefConfig, 1 | 2 | 0> = {
  rounds: 1,
  decisionTurnaroundDays: 1,
  interviewDays: 1,
  windowFrom: 1,
  windowTo: 1,
  noticeHours: 1,
  bufferMinutes: 1,
  maxPerDay: 1,
  disclosure: 1,
  feedbackMode: 1,
  feedbackDays: 1,
  feeBasis: 2,
  feePercent: 2,
  rebateWeeks: 2,
  rebateShape: 2,
  invoicePoint: 2,
  ownershipMonths: 2,
  offerAuthorityContactId: 2,
  offerCeiling: 2,
  startTargetMonth: 2,
  shortlistSize: 2,
  referencesWanted: 2,
  note: 0,
}

/** What a client may change. Tier-1 keys only; the rest they read and, if
 *  wrong, say so — which is a change too, routed the same way. */
export const CLIENT_EDITABLE: ReadonlyArray<keyof BriefConfig> = (Object.keys(TIER) as Array<keyof BriefConfig>).filter(
  (k) => TIER[k] === 1
)

export const DEFAULT_BRIEF: BriefConfig = {
  rounds: [
    { purpose: "screen", format: "video", interviewerIds: [], durationMinutes: 45 },
    { purpose: "panel", format: "in_person", interviewerIds: [], durationMinutes: 90 },
  ],
  decisionTurnaroundDays: 2,
  interviewDays: ["mon", "tue", "wed", "thu"],
  windowFrom: "09:00",
  windowTo: "17:00",
  noticeHours: 24,
  bufferMinutes: 15,
  maxPerDay: 3,
  disclosure: { scores: true, evidence: true, notes: false, cv: true, logistics: true },
  feedbackMode: "via_recruiter",
  feedbackDays: 5,
  feeBasis: "contingent",
  feePercent: 20,
  rebateWeeks: 12,
  rebateShape: "sliding",
  invoicePoint: "start_date",
  ownershipMonths: 12,
  offerAuthorityContactId: null,
  offerCeiling: null,
  startTargetMonth: null,
  shortlistSize: 5,
  referencesWanted: ["character"],
  note: "",
}

// ── normalising ───────────────────────────────────────────────────────────

const pick = <T>(set: readonly T[], v: unknown, fallback: T): T => (set.includes(v as T) ? (v as T) : fallback)
const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(n)))
}
const uuidish = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)
const time = (v: unknown, fallback: string): string => (typeof v === "string" && TIME_STEPS.includes(v) ? v : fallback)

/**
 * Coerce anything into a valid brief. Never throws; every out-of-set value
 * falls back to the default, because a brief the client is about to sign
 * must not carry a value the product has no word for. Unknown keys are
 * dropped — a brief is not a bag.
 */
export function normaliseBrief(input: unknown, base: BriefConfig = DEFAULT_BRIEF): BriefConfig {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const roundsIn = Array.isArray(o.rounds) ? o.rounds : base.rounds
  const rounds: BriefRound[] = roundsIn.slice(0, MAX_ROUNDS).map((r) => {
    const rr = (r && typeof r === "object" ? r : {}) as Record<string, unknown>
    return {
      purpose: pick(ROUND_PURPOSES, rr.purpose, "screen"),
      format: pick(ROUND_FORMATS, rr.format, "video"),
      interviewerIds: Array.isArray(rr.interviewerIds) ? rr.interviewerIds.filter(uuidish).slice(0, 8) : [],
      durationMinutes: pick<number>(DURATIONS_MIN, rr.durationMinutes, 45),
    }
  })
  const daysIn = Array.isArray(o.interviewDays) ? o.interviewDays : base.interviewDays
  const interviewDays = WEEKDAYS.filter((d) => daysIn.includes(d))
  // Absent means "unchanged", not "back to the product default". The first
  // cut fell to defaults for disclosure, note, offer authority, ceiling and
  // start target when the key was missing — so a title-only amend rewrote
  // what the client would be shown and cleared the client's signature for a
  // change nobody made (found in the 23 Sep E2E).
  const d = (o.disclosure && typeof o.disclosure === "object" ? o.disclosure : base.disclosure) as Record<string, unknown>
  const refsIn = Array.isArray(o.referencesWanted) ? o.referencesWanted : base.referencesWanted
  // Canonical order — the DB constraint on candidates.references_wanted
  // refuses ['hr','character'], and this is where that promise is kept.
  const referencesWanted = REFERENCE_KINDS_ON_BRIEF.filter((k) => refsIn.includes(k))
  const windowFrom = time(o.windowFrom, base.windowFrom)
  let windowTo = time(o.windowTo, base.windowTo)
  if (windowTo <= windowFrom) windowTo = base.windowTo > windowFrom ? base.windowTo : TIME_STEPS[TIME_STEPS.length - 1]
  const startTargetMonth =
    o.startTargetMonth === undefined ? base.startTargetMonth : typeof o.startTargetMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(o.startTargetMonth) ? o.startTargetMonth : null
  const feePercentRaw = typeof o.feePercent === "number" ? o.feePercent : Number(o.feePercent)
  const feePercent = Number.isFinite(feePercentRaw) ? Math.min(50, Math.max(0, Math.round(feePercentRaw * 2) / 2)) : base.feePercent
  const ceilingRaw = typeof o.offerCeiling === "number" ? o.offerCeiling : Number(o.offerCeiling)
  const offerCeiling =
    o.offerCeiling === undefined ? base.offerCeiling : o.offerCeiling === null || !Number.isFinite(ceilingRaw) ? null : Math.max(0, Math.round(ceilingRaw / 1000) * 1000)

  return {
    rounds: rounds.length > 0 ? rounds : base.rounds,
    decisionTurnaroundDays: pick<number>(TURNAROUND_DAYS, o.decisionTurnaroundDays, base.decisionTurnaroundDays),
    interviewDays: interviewDays.length > 0 ? interviewDays : base.interviewDays,
    windowFrom,
    windowTo,
    noticeHours: pick<number>(NOTICE_HOURS, o.noticeHours, base.noticeHours),
    bufferMinutes: pick<number>(BUFFER_MIN, o.bufferMinutes, base.bufferMinutes),
    maxPerDay: clampInt(o.maxPerDay, MAX_PER_DAY.min, MAX_PER_DAY.max, base.maxPerDay),
    disclosure: {
      scores: d.scores !== false,
      evidence: d.evidence !== false,
      notes: d.notes === true,
      cv: d.cv !== false,
      logistics: d.logistics !== false,
    },
    feedbackMode: pick(FEEDBACK_MODES, o.feedbackMode, base.feedbackMode),
    feedbackDays: pick<number>(FEEDBACK_DAYS, o.feedbackDays, base.feedbackDays),
    feeBasis: pick(FEE_BASES, o.feeBasis, base.feeBasis),
    feePercent,
    rebateWeeks: clampInt(o.rebateWeeks, REBATE_WEEKS.min, REBATE_WEEKS.max, base.rebateWeeks),
    rebateShape: pick(REBATE_SHAPES, o.rebateShape, base.rebateShape),
    invoicePoint: pick(INVOICE_POINTS, o.invoicePoint, base.invoicePoint),
    ownershipMonths: pick<number>(OWNERSHIP_MONTHS, o.ownershipMonths, base.ownershipMonths),
    offerAuthorityContactId: o.offerAuthorityContactId === undefined ? base.offerAuthorityContactId : uuidish(o.offerAuthorityContactId) ? o.offerAuthorityContactId : null,
    offerCeiling,
    startTargetMonth,
    shortlistSize: clampInt(o.shortlistSize, SHORTLIST_SIZE.min, SHORTLIST_SIZE.max, base.shortlistSize),
    referencesWanted,
    note: o.note === undefined ? base.note : typeof o.note === "string" ? o.note.trim().slice(0, 600) : "",
  }
}

// ── the state machine ─────────────────────────────────────────────────────

export type BriefSide = "recruiter" | "client"

export interface BriefVersionSignatures {
  version: number
  recruiterApprovedAt: string | null
  clientApprovedAt: string | null
  /** Who wrote this version. */
  authoredBy: BriefSide
  sentAt: string | null
}

export type BriefState = "draft" | "sent" | "amended" | "approved" | "superseded"

/**
 * Approved means BOTH signatures on THIS version. Nothing else counts.
 *
 * `draft`     — recruiter writing, never sent. Nobody else sees it.
 * `sent`      — the recruiter's version, signed by them, waiting on the client.
 * `amended`   — the client's version, signed by them, waiting on the recruiter.
 * `approved`  — both.
 * `superseded`— a later version exists; this one is read-only history.
 */
export function briefState(v: BriefVersionSignatures, isLatest: boolean): BriefState {
  if (!isLatest) return "superseded"
  if (v.recruiterApprovedAt && v.clientApprovedAt) return "approved"
  if (!v.sentAt) return "draft"
  return v.authoredBy === "client" ? "amended" : "sent"
}

/** Whose move it is, in words both screens use. */
export function waitingOn(state: BriefState): BriefSide | null {
  if (state === "sent") return "client"
  if (state === "amended") return "recruiter"
  return null
}

// ── the diff ──────────────────────────────────────────────────────────────

export interface BriefChange {
  key: keyof BriefConfig
  tier: 0 | 1 | 2
  from: unknown
  to: unknown
}

/** Every top-level key whose value differs. Deep-compared by JSON, which is
 *  enough for a config this shape and keeps this module dependency-free. */
export function diffBrief(from: BriefConfig, to: BriefConfig): BriefChange[] {
  const out: BriefChange[] = []
  for (const key of Object.keys(TIER) as Array<keyof BriefConfig>) {
    const a = JSON.stringify(from[key])
    const b = JSON.stringify(to[key])
    if (a !== b) out.push({ key, tier: TIER[key], from: from[key], to: to[key] })
  }
  return out
}

/**
 * Apply a client's amendment. Only tier-1 keys move; anything else in the
 * payload is ignored rather than refused, because the review page only
 * offers Change on tier-1 lines and a stray key is a bug, not an attack.
 * Returns the merged config and what actually changed.
 */
export function applyClientAmendment(current: BriefConfig, proposed: unknown): { config: BriefConfig; changes: BriefChange[] } {
  const candidate = normaliseBrief(proposed, current)
  const merged: BriefConfig = { ...current }
  for (const key of CLIENT_EDITABLE) {
    ;(merged as unknown as Record<string, unknown>)[key] = candidate[key]
  }
  return { config: merged, changes: diffBrief(current, merged) }
}

// ── words ─────────────────────────────────────────────────────────────────

export const KEY_LABEL: Record<keyof BriefConfig, string> = {
  rounds: "Rounds",
  decisionTurnaroundDays: "You decide within",
  interviewDays: "Interview days",
  windowFrom: "Interviews from",
  windowTo: "Interviews until",
  noticeHours: "Notice to candidates",
  bufferMinutes: "Buffer between interviews",
  maxPerDay: "Max interviews a day",
  disclosure: "You will be shown",
  feedbackMode: "Unsuccessful candidates",
  feedbackDays: "Feedback within",
  feeBasis: "Basis",
  feePercent: "Fee",
  rebateWeeks: "Rebate",
  rebateShape: "Rebate shape",
  invoicePoint: "Invoice",
  ownershipMonths: "Introduced candidates are the agency's for",
  offerAuthorityContactId: "Offer authority",
  offerCeiling: "Offer ceiling",
  startTargetMonth: "Start target",
  shortlistSize: "Shortlist size",
  referencesWanted: "References on every hire",
  note: "Note",
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`

/** One line of prose per key, the same on both sides. `names` resolves
 *  contact ids so nobody reads a uuid. */
export function describe(key: keyof BriefConfig, c: BriefConfig, names: Record<string, string> = {}): string {
  const name = (id: string) => names[id] ?? "a contact"
  switch (key) {
    case "rounds":
      return `${c.rounds.length} · ` + c.rounds.map((r) => `${ROUND_PURPOSE_LABEL[r.purpose]} (${r.durationMinutes} min, ${r.interviewerIds.length ? r.interviewerIds.map(name).join(" + ") : "interviewer to confirm"})`).join(" → ")
    case "decisionTurnaroundDays":
      return `${plural(c.decisionTurnaroundDays, "working day")} of each round`
    case "interviewDays":
      return c.interviewDays.map((d) => WEEKDAY_LABEL[d]).join(", ")
    case "windowFrom":
      return c.windowFrom
    case "windowTo":
      return c.windowTo
    case "noticeHours":
      return `${c.noticeHours} hours`
    case "bufferMinutes":
      return `${c.bufferMinutes} min`
    case "maxPerDay":
      return String(c.maxPerDay)
    case "disclosure": {
      const on = [c.disclosure.scores && "score", c.disclosure.evidence && "evidence quotes", c.disclosure.cv && "the CV", c.disclosure.logistics && "logistics"].filter(Boolean)
      return `${on.join(" · ")}${c.disclosure.notes ? " · the recruiter's notes" : ". Not the recruiter's notes"}`
    }
    case "feedbackMode":
      return c.feedbackMode === "none" ? "Do not get a reason" : c.feedbackMode === "direct" ? `Get a reason directly from the client within ${plural(c.feedbackDays, "working day")}` : `Get a reason via the recruiter within ${plural(c.feedbackDays, "working day")}`
    case "feedbackDays":
      return plural(c.feedbackDays, "working day")
    case "feeBasis":
      return FEE_BASIS_LABEL[c.feeBasis]
    case "feePercent":
      return `${FEE_BASIS_LABEL[c.feeBasis]} · ${c.feePercent}% of first-year salary · ${INVOICE_POINT_LABEL[c.invoicePoint].toLowerCase()}`
    case "rebateWeeks":
      return c.rebateShape === "none" ? "No rebate" : `${plural(c.rebateWeeks, "week")}, ${REBATE_SHAPE_LABEL[c.rebateShape].toLowerCase()}`
    case "rebateShape":
      return REBATE_SHAPE_LABEL[c.rebateShape]
    case "invoicePoint":
      return INVOICE_POINT_LABEL[c.invoicePoint]
    case "ownershipMonths":
      return plural(c.ownershipMonths, "month")
    case "offerAuthorityContactId":
      return c.offerAuthorityContactId ? `${name(c.offerAuthorityContactId)}${c.offerCeiling ? `, up to £${c.offerCeiling.toLocaleString("en-GB")}` : ""}` : "Not named"
    case "offerCeiling":
      return c.offerCeiling ? `£${c.offerCeiling.toLocaleString("en-GB")}` : "Not set"
    case "startTargetMonth": {
      if (!c.startTargetMonth) return "Not set"
      const [y, m] = c.startTargetMonth.split("-").map(Number)
      return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    }
    case "shortlistSize":
      return `up to ${plural(c.shortlistSize, "candidate")}`
    case "referencesWanted":
      return c.referencesWanted.length === 0 ? "None" : c.referencesWanted.map((k) => (k === "hr" ? "HR" : "Character")).join(" + ")
    case "note":
      return c.note
  }
}
