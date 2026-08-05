/**
 * The override → rescore loop. Everything that changes a score after ingestion
 * funnels through recomputeAndStore(): screening soft signals, overrides,
 * mark-reviewed, reset, and submission generation (which recomputes rather
 * than trusting any cached row — no frontend-computed score can reach a
 * client-facing document because no route accepts one).
 */

import {
  AgencyAccessError,
  agencyAdmin,
  writeAudit,
  type AgencyClient,
} from "./db"
import {
  computeScore,
  ENGINE_VERSION,
  inputsHash,
  type ScoreResult,
  type ScoringBaselines,
  type ScoringInput,
} from "./scoring"
import type { AgencyContext, Strength, Weight } from "./types"

interface ScoringState {
  candidate: { id: string; agency_id: string; role_id: string; ref: string }
  input: ScoringInput
  originalOverall: number | null
  reviewId: string | null
}

/** Load everything that feeds a candidate's score from the database. */
export async function loadScoringState(
  admin: AgencyClient,
  agencyId: string,
  candidateId: string
): Promise<ScoringState> {
  const { data: candidate, error: candError } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, ref")
    .eq("id", candidateId)
    .maybeSingle()
  if (candError) throw candError
  if (!candidate || candidate.agency_id !== agencyId) {
    throw new AgencyAccessError("candidate not found in caller's agency")
  }

  const [{ data: requirements }, { data: evidence }, { data: review }, { data: breakdown }] =
    await Promise.all([
      admin
        .from("requirements")
        .select("id, ref, weight")
        .eq("role_id", candidate.role_id)
        .order("sort_order"),
      admin
        .from("candidate_evidence")
        .select("requirement_id, strength")
        .eq("candidate_id", candidateId),
      admin
        .from("candidate_reviews")
        .select("id, status, communication, motivation")
        .eq("candidate_id", candidateId)
        .maybeSingle(),
      admin
        .from("score_breakdowns")
        .select("baselines, original_overall")
        .eq("candidate_id", candidateId)
        .maybeSingle(),
    ])

  const overrides: Record<string, Strength> = {}
  if (review?.id) {
    const { data: overrideRows } = await admin
      .from("review_overrides")
      .select("requirement_id, to_strength")
      .eq("review_id", review.id)
    for (const row of overrideRows ?? []) {
      overrides[row.requirement_id] = row.to_strength as Strength
    }
  }

  const evidenceMap: Record<string, Strength> = {}
  for (const row of evidence ?? []) {
    evidenceMap[row.requirement_id] = row.strength as Strength
  }

  const stored = (breakdown?.baselines ?? {}) as Partial<ScoringBaselines>
  const baselines: ScoringBaselines = {
    seniority: stored.seniority ?? 50,
    contextFit: stored.contextFit ?? 50,
    confidence: stored.confidence ?? 50,
    confidenceLevel: (stored.confidenceLevel ?? 2) as 1 | 2 | 3 | 4,
  }

  return {
    candidate,
    reviewId: review?.id ?? null,
    originalOverall: breakdown?.original_overall ?? null,
    input: {
      requirements: (requirements ?? []) as Array<{ id: string; ref: string; weight: Weight }>,
      evidence: evidenceMap,
      overrides,
      baselines,
      softSignals: {
        communication: review?.communication ?? null,
        motivation: review?.motivation ?? null,
      },
      reviewed: review?.status === "reviewed",
    },
  }
}

/** Recompute from current DB state and persist. Returns the fresh result. */
export async function recomputeAndStore(
  admin: AgencyClient,
  agencyId: string,
  candidateId: string
): Promise<ScoreResult & { inputs_hash: string; original_overall: number | null }> {
  const state = await loadScoringState(admin, agencyId, candidateId)
  const score = computeScore(state.input)
  const hash = inputsHash(state.input)

  const { error } = await admin.from("score_breakdowns").upsert(
    {
      agency_id: agencyId,
      candidate_id: candidateId,
      overall: score.overall,
      requirement_coverage: score.requirement_coverage,
      evidence_strength: score.evidence_strength,
      seniority_calibration: score.seniority_calibration,
      context_fit: score.context_fit,
      confidence_completeness: score.confidence_completeness,
      must_have_hit: score.must_have_hit,
      must_have_total: score.must_have_total,
      confidence_level: score.confidence_level,
      effective: score.effective,
      baselines: state.input.baselines,
      // Preserved from ingestion; the DeltaChip's "was" side.
      original_overall: state.originalOverall ?? score.overall,
      inputs_hash: hash,
      engine_version: ENGINE_VERSION,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "candidate_id" }
  )
  if (error) throw error

  return { ...score, inputs_hash: hash, original_overall: state.originalOverall ?? score.overall }
}

/**
 * Apply recruiter overrides: { [requirementId]: strength | null } (null
 * clears). Writes the audit row per override — from = the PARSED strength so
 * the human-vs-machine delta is always visible — then rescores once.
 */
export async function applyOverrides(
  ctx: AgencyContext,
  candidateId: string,
  changes: Record<string, Strength | null>,
  reason?: string
): Promise<ReturnType<typeof recomputeAndStore>> {
  const admin = agencyAdmin()
  const state = await loadScoringState(admin, ctx.agencyId, candidateId)

  // Ensure a review shell exists to hang overrides off.
  let reviewId = state.reviewId
  if (!reviewId) {
    const { data, error } = await admin
      .from("candidate_reviews")
      .insert({
        agency_id: ctx.agencyId,
        role_id: state.candidate.role_id,
        candidate_id: candidateId,
        recruiter_id: ctx.userId,
      })
      .select("id")
      .single()
    if (error) throw error
    reviewId = data.id as string
  }

  const validStrengths: Strength[] = ["strong", "transferable", "partial", "missing"]
  const requirementById = new Map(state.input.requirements.map((r) => [r.id, r]))

  for (const [requirementId, toStrength] of Object.entries(changes)) {
    const requirement = requirementById.get(requirementId)
    if (!requirement) continue
    const parsed = state.input.evidence[requirementId] ?? "missing"

    if (toStrength === null) {
      const { error } = await admin
        .from("review_overrides")
        .delete()
        .eq("review_id", reviewId)
        .eq("requirement_id", requirementId)
      if (error) throw error
      await writeAudit(admin, {
        agencyId: ctx.agencyId,
        roleId: state.candidate.role_id,
        candidateId,
        actorId: ctx.userId,
        entityType: "override",
        entityRef: requirement.ref,
        action: "cleared",
        fromValue: { strength: state.input.overrides[requirementId] ?? parsed },
        toValue: { strength: parsed },
        reason,
      })
      continue
    }

    if (!validStrengths.includes(toStrength)) continue

    const { error } = await admin.from("review_overrides").upsert(
      {
        agency_id: ctx.agencyId,
        review_id: reviewId,
        requirement_id: requirementId,
        from_strength: parsed,
        to_strength: toStrength,
        reason: reason ?? null,
        recruiter_id: ctx.userId,
      },
      { onConflict: "review_id,requirement_id" }
    )
    if (error) throw error

    await writeAudit(admin, {
      agencyId: ctx.agencyId,
      roleId: state.candidate.role_id,
      candidateId,
      actorId: ctx.userId,
      entityType: "override",
      entityRef: requirement.ref,
      action: "overridden",
      fromValue: { strength: parsed },
      toValue: { strength: toStrength },
      reason,
    })
  }

  return recomputeAndStore(admin, ctx.agencyId, candidateId)
}
