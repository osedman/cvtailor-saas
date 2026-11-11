/**
 * The recruiter's shortlist decision — the ONE writer of
 * recruiter_reviews.decision.
 *
 * Two routes call this: the single-candidate PATCH (a card, a key press) and
 * the bulk PATCH (an "add in one go" chip, a group head on the recommendation
 * tab, an undo). They used to be one route with the write inline; the bulk
 * route made a second copy inevitable, and two copies of "what a decision
 * means" is how the audit row and the toggle-to-null would have drifted. So
 * the semantics live here and both routes import them.
 *
 * What a decision means, in one place:
 *   - Human-only. The caller must be an authenticated owner/recruiter
 *     (assertWriter); no machine path may reach this. The recommendation
 *     reads decisions and never writes one.
 *   - null is a first-class value: it clears the decision (the card's Remove,
 *     the rail's ×, an undo back to "undecided").
 *   - The candidate must belong to the caller's agency, and, when the caller
 *     names a role, to that role — a bulk body cannot reach across roles.
 *   - One audit row per candidate, every time, carrying the previous value,
 *     so a bulk add can be undone exactly and the trail reads person by person.
 *   - The previous value comes back to the caller for the same reason.
 */

import {
  AgencyAccessError,
  agencyAdmin,
  assertWriter,
  writeAudit,
  type AgencyClient,
} from "@/lib/agency/db"
import type { AgencyContext } from "@/lib/agency/types"

export const RECRUITER_DECISIONS = ["shortlist", "hold", "reject"] as const
export type RecruiterDecision = (typeof RECRUITER_DECISIONS)[number]

/** The most people one bulk call may decide on. Matches the per-role
 * candidate cap, so "everyone" always fits in one request. */
export const MAX_BULK_DECISIONS = 50

export interface DecisionChange {
  candidateId: string
  decision: RecruiterDecision | null
}

export interface ApplyDecisionOptions {
  /** Free-text note stored beside the decision and used as the audit reason.
   * The single route accepts one from the body; bulk never does. */
  note?: string
  /** When set, the candidate must be on THIS role as well as in the agency.
   * The bulk route always sets it. */
  roleId?: string
  /** Where the click came from. "bulk" is recorded as the audit reason so a
   * reader of the trail can tell one chip from fifty cards. */
  source?: "single" | "bulk"
  /** Injected in tests; production callers leave it out. */
  admin?: AgencyClient
  /** A candidate row the caller has ALREADY read with the same four columns.
   * The bulk route reads all fifty in one query and passes each row here so
   * the per-person select is skipped; the tenancy and role checks still run
   * on the row, so the guarantee does not move. */
  candidate?: KnownCandidate
  /** The candidate's current decision, when the caller has already read it
   * (the bulk route reads the whole batch's in one query). `undefined` means
   * "not read; look it up"; `null` means "read, and undecided". */
  previous?: RecruiterDecision | null
}

/** The four columns a decision needs to know about its candidate. */
export interface KnownCandidate {
  id: string
  agency_id: string
  role_id: string
  ref: string
}

export interface AppliedDecision {
  candidateId: string
  candidateRef: string
  roleId: string
  decision: RecruiterDecision | null
  previous: RecruiterDecision | null
}

/** Parse one decision value from a request body. `undefined` means invalid;
 * `null` is the legitimate "clear it". */
export function parseDecision(value: unknown): RecruiterDecision | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value === "string" && (RECRUITER_DECISIONS as readonly string[]).includes(value)) {
    return value as RecruiterDecision
  }
  return undefined
}

export type ParsedBulkBody =
  | { ok: true; changes: DecisionChange[] }
  | { ok: false; error: string }

/**
 * Validate a bulk body: { changes: [{ candidateId, decision }] }, 1–50
 * entries, each id a non-empty string, each decision one of the three or
 * null, no candidate named twice (a body that says both "shortlist" and
 * "hold" for one person has no honest answer, so it is refused whole).
 * Pure, so it is unit-tested directly.
 */
export function parseBulkDecisions(body: unknown): ParsedBulkBody {
  const raw = (body as { changes?: unknown } | null)?.changes
  if (!Array.isArray(raw)) return { ok: false, error: "changes must be an array" }
  if (raw.length === 0) return { ok: false, error: "changes must name at least one person" }
  if (raw.length > MAX_BULK_DECISIONS) {
    return { ok: false, error: `changes may name at most ${MAX_BULK_DECISIONS} people` }
  }
  const seen = new Set<string>()
  const changes: DecisionChange[] = []
  for (const entry of raw as Array<{ candidateId?: unknown; decision?: unknown }>) {
    const candidateId = entry?.candidateId
    if (typeof candidateId !== "string" || candidateId.trim() === "" || candidateId.length > 64) {
      return { ok: false, error: "each change needs a candidateId" }
    }
    const decision = parseDecision(entry?.decision)
    if (decision === undefined) return { ok: false, error: "Invalid decision" }
    if (seen.has(candidateId)) return { ok: false, error: "a candidate may appear only once" }
    seen.add(candidateId)
    changes.push({ candidateId, decision })
  }
  return { ok: true, changes }
}

/**
 * The current decision of each named candidate, in one query. The bulk route
 * reads its whole batch here and hands each value to applyDecision, so fifty
 * people cost one read rather than fifty. Ids with no review row are absent
 * from the map; the caller treats absence as null (undecided).
 */
export async function loadPreviousDecisions(
  candidateIds: string[],
  admin: AgencyClient = agencyAdmin()
): Promise<Map<string, RecruiterDecision | null>> {
  const out = new Map<string, RecruiterDecision | null>()
  if (candidateIds.length === 0) return out
  const { data, error } = await admin
    .from("recruiter_reviews")
    .select("candidate_id, decision")
    .in("candidate_id", candidateIds)
  if (error) throw error
  for (const row of data ?? []) {
    out.set(row.candidate_id as string, (row.decision ?? null) as RecruiterDecision | null)
  }
  return out
}

/**
 * Write one decision. Throws AgencyAccessError for a viewer, for a candidate
 * outside the caller's agency, or for one off the named role; anything else
 * that throws is a database failure and the caller should surface it.
 *
 * Query count: two reads and two writes when called bare (the single route);
 * two writes only when the caller passes `candidate` and `previous` it has
 * already read (the bulk route, once per batch rather than once per person).
 */
export async function applyDecision(
  ctx: AgencyContext,
  candidateId: string,
  decision: RecruiterDecision | null,
  options: ApplyDecisionOptions = {}
): Promise<AppliedDecision> {
  assertWriter(ctx)
  const admin = options.admin ?? agencyAdmin()
  const note = typeof options.note === "string" ? options.note.slice(0, 2000) : ""

  let candidate: KnownCandidate | null
  if (options.candidate && options.candidate.id === candidateId) {
    candidate = options.candidate
  } else {
    const { data, error: candError } = await admin
      .from("candidates")
      .select("id, agency_id, role_id, ref")
      .eq("id", candidateId)
      .maybeSingle()
    if (candError) throw candError
    candidate = (data as KnownCandidate | null) ?? null
  }
  if (!candidate || candidate.agency_id !== ctx.agencyId) {
    throw new AgencyAccessError("candidate not found in caller's agency")
  }
  if (options.roleId && candidate.role_id !== options.roleId) {
    throw new AgencyAccessError("candidate is not on this role")
  }

  let previous: RecruiterDecision | null
  if (options.previous !== undefined) {
    previous = options.previous
  } else {
    const { data: existing } = await admin
      .from("recruiter_reviews")
      .select("decision")
      .eq("candidate_id", candidateId)
      .maybeSingle()
    previous = (existing?.decision ?? null) as RecruiterDecision | null
  }

  const { error } = await admin.from("recruiter_reviews").upsert(
    {
      agency_id: ctx.agencyId,
      role_id: candidate.role_id,
      candidate_id: candidateId,
      decision,
      decision_note: note,
      decided_by: ctx.userId,
      decided_at: decision ? new Date().toISOString() : null,
    },
    { onConflict: "candidate_id" }
  )
  if (error) throw error

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: candidate.role_id,
    candidateId,
    actorId: ctx.userId,
    entityType: "decision",
    entityRef: candidate.ref,
    action: decision ? "decided" : "cleared",
    fromValue: { decision: previous },
    toValue: { decision },
    reason: note || (options.source === "bulk" ? "bulk" : undefined),
  })

  return {
    candidateId,
    candidateRef: candidate.ref,
    roleId: candidate.role_id,
    decision,
    previous,
  }
}
