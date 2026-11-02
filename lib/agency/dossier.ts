/**
 * The living dossier — how each requirement came to be believed.
 *
 * Built for the signed-off frame "HM · Living dossier — stratigraphy v2".
 * Everything on that screen is a layer, and every layer here is a real row:
 *
 *   CV         candidate_evidence (origin 'cv' | 'tailr_profile') — what the
 *              document said, with its quote.
 *   SCREENING  review_overrides — where a recruiter disagreed with the parse,
 *              carrying from → to and their reason. This is the layer the
 *              compare matrix already tints, because a human's fingerprints
 *              are the thing worth colouring.
 *   ROUND n    debrief answers keyed by requirement ref, and (once enrichment
 *              ships) candidate_evidence rows with origin 'interview' and a
 *              round_id.
 *
 * WHAT IS THIN TODAY, AND WHY THAT IS HONEST. Transcript enrichment does not
 * exist — it sits behind the DPIA and consent gate — so no requirement has an
 * 'interview' evidence row yet. The strata therefore run two or three deep
 * rather than five. The screen renders exactly what happened rather than
 * implying depth it does not have, and gains the fourth layer the day capture
 * ships without a line changing here.
 *
 * Recruiter-side. The frame was drawn on the hiring-manager surface, but a
 * dossier is the recruiter's working: it contains the parse, their overrides
 * and their reasons. The client sees the submission snapshot, which is the
 * disclosed subset. Putting this on the client surface would hand them the
 * working and contradict lib/agency/client-auth's whole disclosure rule — so
 * it lives here, and an HM-facing version would need a "was this candidate
 * actually submitted to you" gate first.
 */

import { agencyAdmin, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

export type Strength = "strong" | "transferable" | "partial" | "missing"

export type LayerKind = "cv" | "screening" | "round"

export interface Layer {
  kind: LayerKind
  /** 'CV', 'SCREENING', 'R1' — what the chip reads. */
  label: string
  strength: Strength | null
  quote: string | null
  source: string
  /** Only on screening layers: what the recruiter changed and why. */
  from?: Strength
  to?: Strength
  reason?: string | null
  at: string | null
}

export interface RequirementStrata {
  requirementId: string
  ref: string
  text: string
  weight: string
  layers: Layer[]
  /** Effective strength after overrides — what scoring actually used. */
  current: Strength
  /** True when nothing has evidenced it yet: the shrinking-unknown number. */
  open: boolean
}

export interface DossierRound {
  id: string
  number: number
  when: string | null
  status: string
  artifact: string | null
  decision: string | null
}

export interface Dossier {
  candidate: { id: string; ref: string; name: string }
  role: { id: string; ref: string; title: string }
  requirements: RequirementStrata[]
  rounds: DossierRound[]
  /** The waterfall: where the score started and where it is now. */
  score: { overall: number | null; original: number | null } | null
  unknown: { open: number; total: number }
  /** True while transcript enrichment does not exist, so the UI can say so
   * instead of letting a thin dossier read as a shallow candidate. */
  enrichmentPending: boolean
}

const ORDER: Record<Strength, number> = { missing: 0, partial: 1, transferable: 2, strong: 3 }

export async function buildDossier(
  ctx: AgencyContext,
  roleId: string,
  candidateId: string
): Promise<Dossier> {
  const admin = agencyAdmin()

  const [{ data: candidate }, { data: role }] = await Promise.all([
    admin
      .from("candidates")
      .select("id, ref, full_name, role_id")
      .eq("id", candidateId)
      .eq("agency_id", ctx.agencyId)
      .maybeSingle(),
    admin
      .from("job_roles")
      .select("id, ref, title")
      .eq("id", roleId)
      .eq("agency_id", ctx.agencyId)
      .maybeSingle(),
  ])
  if (!role) throw new AgencyAccessError("role not found in your agency")
  if (!candidate || candidate.role_id !== roleId) {
    throw new AgencyAccessError("candidate not found on that role")
  }

  const { data: requirements } = await admin
    .from("requirements")
    .select("id, ref, text, weight")
    .eq("role_id", roleId)
    .order("sort_order", { ascending: true })

  const { data: evidence } = await admin
    .from("candidate_evidence")
    .select("requirement_id, strength, quote, source_cite, origin, round_id, created_at")
    .eq("candidate_id", candidateId)

  // The screening layer: a recruiter's override on this candidate's review.
  const { data: review } = await admin
    .from("candidate_reviews")
    .select("id")
    .eq("candidate_id", candidateId)
    .maybeSingle()
  const { data: overrides } = review
    ? await admin
        .from("review_overrides")
        .select("requirement_id, from_strength, to_strength, reason, created_at")
        .eq("review_id", review.id as string)
        .eq("agency_id", ctx.agencyId)
    : { data: [] as Array<Record<string, unknown>> }

  const { data: roundRows } = await admin
    .from("interview_rounds")
    .select("id, round_number, scheduled_at, status")
    .eq("role_id", roleId)
    .eq("candidate_id", candidateId)
    .neq("status", "cancelled")
    .order("round_number", { ascending: true })

  const roundIds = (roundRows ?? []).map((r) => r.id as string)
  const [{ data: artifacts }, { data: decisions }, { data: breakdown }] = await Promise.all([
    roundIds.length
      ? admin.from("round_artifacts").select("round_id, kind, content").in("round_id", roundIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    roundIds.length
      ? admin
          .from("round_decisions")
          .select("round_id, decision, created_at")
          .in("round_id", roundIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    admin
      .from("score_breakdowns")
      .select("overall, original_overall, effective")
      .eq("candidate_id", candidateId)
      .maybeSingle(),
  ])

  const artifactByRound = new Map(
    (artifacts ?? []).map((a) => [a.round_id as string, a as Record<string, unknown>])
  )
  const decisionByRound = new Map<string, string>()
  for (const d of decisions ?? []) {
    const rid = d.round_id as string
    if (!decisionByRound.has(rid)) decisionByRound.set(rid, d.decision as string)
  }

  const rounds: DossierRound[] = (roundRows ?? []).map((r) => ({
    id: r.id as string,
    number: r.round_number as number,
    when: (r.scheduled_at as string | null) ?? null,
    status: r.status as string,
    artifact: (artifactByRound.get(r.id as string)?.kind as string) ?? null,
    decision: decisionByRound.get(r.id as string) ?? null,
  }))

  // Debrief answers are keyed by requirement ref, so a round contributes to a
  // requirement's story even with no transcript. This is what makes the
  // stratigraphy non-empty today.
  const answersByRef = new Map<string, Array<{ round: number; answer: string; at: string | null }>>()
  for (const r of rounds) {
    const art = artifactByRound.get(r.id)
    if (!art) continue
    const content = (art.content ?? {}) as { answers?: Array<{ key: string; answer: string }> }
    for (const a of content.answers ?? []) {
      if (!a.key || !a.answer?.trim()) continue
      const list = answersByRef.get(a.key) ?? []
      list.push({ round: r.number, answer: a.answer, at: r.when })
      answersByRef.set(a.key, list)
    }
  }

  const evidenceByReq = new Map<string, Record<string, unknown>>()
  const interviewByReq = new Map<string, Array<Record<string, unknown>>>()
  for (const e of evidence ?? []) {
    const rid = e.requirement_id as string
    if ((e.origin as string) === "interview") {
      const list = interviewByReq.get(rid) ?? []
      list.push(e)
      interviewByReq.set(rid, list)
    } else {
      evidenceByReq.set(rid, e)
    }
  }

  const overrideByReq = new Map(
    (overrides ?? []).map((o) => [o.requirement_id as string, o as Record<string, unknown>])
  )
  const effective = (breakdown?.effective ?? {}) as Record<string, string>

  const roundNumberById = new Map(rounds.map((r) => [r.id, r.number]))

  const strata: RequirementStrata[] = (requirements ?? []).map((req) => {
    const reqId = req.id as string
    const ref = (req.ref as string) ?? ""
    const layers: Layer[] = []

    const cv = evidenceByReq.get(reqId)
    if (cv) {
      layers.push({
        kind: "cv",
        label: (cv.origin as string) === "tailr_profile" ? "PROFILE" : "CV",
        strength: cv.strength as Strength,
        quote: (cv.quote as string | null) ?? null,
        source: (cv.source_cite as string) ?? "",
        at: (cv.created_at as string | null) ?? null,
      })
    }

    const ov = overrideByReq.get(reqId)
    if (ov) {
      layers.push({
        kind: "screening",
        label: "SCREENING",
        strength: ov.to_strength as Strength,
        quote: null,
        source: "Recruiter override",
        from: ov.from_strength as Strength,
        to: ov.to_strength as Strength,
        reason: (ov.reason as string | null) ?? null,
        at: (ov.created_at as string | null) ?? null,
      })
    }

    // Interview-origin evidence, when enrichment exists.
    for (const ie of interviewByReq.get(reqId) ?? []) {
      const n = roundNumberById.get(ie.round_id as string)
      layers.push({
        kind: "round",
        label: n ? `R${n}` : "ROUND",
        strength: ie.strength as Strength,
        quote: (ie.quote as string | null) ?? null,
        source: (ie.source_cite as string) ?? "",
        at: (ie.created_at as string | null) ?? null,
      })
    }

    // Debrief answers — a round's contribution without a transcript. No
    // strength: nobody scored it, a person wrote it down.
    for (const a of answersByRef.get(ref) ?? []) {
      layers.push({
        kind: "round",
        label: `R${a.round}`,
        strength: null,
        quote: a.answer,
        source: "Write-up",
        at: a.at,
      })
    }

    const current =
      (effective[reqId] as Strength) ??
      (ov?.to_strength as Strength) ??
      ((cv?.strength as Strength) || "missing")

    return {
      requirementId: reqId,
      ref,
      text: (req.text as string) ?? "",
      weight: (req.weight as string) ?? "",
      layers,
      current,
      open: ORDER[current] === 0,
    }
  })

  const open = strata.filter((s) => s.open).length

  return {
    candidate: {
      id: candidateId,
      ref: (candidate.ref as string) ?? "",
      name: (candidate.full_name as string) ?? "",
    },
    role: { id: roleId, ref: (role.ref as string) ?? "", title: (role.title as string) ?? "" },
    requirements: strata,
    rounds,
    score: breakdown
      ? {
          overall: breakdown.overall === null ? null : Number(breakdown.overall),
          original:
            breakdown.original_overall === null ? null : Number(breakdown.original_overall),
        }
      : null,
    unknown: { open, total: strata.length },
    // No interview-origin evidence anywhere means enrichment has not shipped.
    enrichmentPending: (evidence ?? []).every((e) => (e.origin as string) !== "interview"),
  }
}
