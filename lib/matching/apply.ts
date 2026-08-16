/**
 * Applying: the one moment quiet matching shares anything with an agency.
 *
 * The route shows the person a manifest (getApplyManifest), they confirm, and
 * applyToRole recomputes the ENTIRE payload server-side — nothing the client
 * sent is trusted, because the client can only have gotten it from us anyway —
 * then hands it to public.apply_matched_recommendation(), which does every
 * write in one transaction: claim, consent event, candidate, identities,
 * evidence, score, audit. No half-states; a double-click aborts whole.
 *
 * TWO DELIBERATE DIVERGENCES FROM RECRUITER INGESTION:
 *
 * 1. No model call. The person was already assessed by the scan; what they
 *    confirmed in the manifest is what crosses. Re-extracting could produce a
 *    different bundle than the one they agreed to send.
 * 2. No candidate limit. MAX_CANDIDATES_PER_ROLE guards recruiter upload
 *    volume; applied to self-submissions it would be auto-rejection by
 *    arithmetic — the eleventh matched applicant refused for arriving late.
 *
 * FRESHNESS: the person applies against the frozen snapshot. If the live
 * requirements have drifted from it (a recruiter edited without republishing),
 * the mapping from the snapshot's refs onto live requirement ids is no longer
 * what they consented to, so applying REFUSES — the same stale-hash ethos as
 * submission generation. Republishing (which rescans) is the recruiter's fix.
 */

import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { agencyAdmin } from "@/lib/agency/db"
import {
  computeScore,
  ENGINE_VERSION,
  identityHash,
  inputsHash,
} from "@/lib/agency/scoring"
import type { Strength, Weight } from "@/lib/agency/types"
import type { EvidenceRow } from "@/lib/career-arc-ledger"
import { buildProfileText, requirementsHash } from "./scan-core"
import { CONSENT_COPY_VERSION } from "./limits"

interface LiveRequirement {
  id: string
  ref: string
  text: string
  weight: Weight
}

interface RecEvidence {
  requirement_ref: string
  strength: Strength
  quote: string | null
}

export interface ApplyManifest {
  copyVersion: string
  sharedWith: string
  roleRef: string
  roleTitle: string
  /** Days the agency keeps the record after the role closes. */
  retentionDays: number
  name: string
  email: string | null
  evidenceCardCount: number
  cvTextChars: number
  cvTextSha256: string
  evidenceMap: Array<{ ref: string; text: string; strength: Strength; quote: string | null }>
  score: number
}

export type ManifestResult =
  | { ok: true; manifest: ApplyManifest }
  | { ok: false; reason: "not_found" | "settled" | "not_live" | "stale" | "empty_bank" }

export interface ApplyResult {
  candidateRef: string
  /** Their own rights doorway — access, rectification, erasure. Shown once. */
  rightsPath: string
  suppressionOverridden: boolean
}

/**
 * Map the recommendation's ref-keyed evidence onto live requirement ids,
 * enforcing the same constraints the database will: missing ⇔ null quote,
 * 1000-char cap, and a requirement with no entry is missing — never invented.
 * Pure; exported for tests.
 */
export function buildAgencyEvidence(
  requirements: LiveRequirement[],
  recEvidence: RecEvidence[]
): Array<{ requirement_id: string; strength: Strength; quote: string | null; source_cite: string }> {
  const byRef = new Map(recEvidence.map((e) => [e.requirement_ref, e]))
  return requirements.map((req) => {
    const found = byRef.get(req.ref)
    const quote = (found?.quote ?? "").trim().slice(0, 1000)
    const strength: Strength = !found || quote === "" ? "missing" : found.strength
    return {
      requirement_id: req.id,
      strength,
      quote: strength === "missing" ? null : quote,
      source_cite: strength === "missing" ? "" : "Tailr evidence bank",
    }
  })
}

/** Shared loading for manifest and apply, so they cannot diverge. */
async function loadApplyContext(userId: string, recommendationId: string) {
  const pub = createAdminClient()
  const admin = agencyAdmin()

  const { data: rec, error: recErr } = await pub
    .from("role_recommendations")
    .select("id, user_id, published_role_id, state, score, score_breakdown, evidence")
    .eq("id", recommendationId)
    .maybeSingle()
  if (recErr) throw recErr
  // Ownership is checked here AND inside the RPC. A recommendation that is
  // not yours is reported as not found — its existence is itself information.
  if (!rec || rec.user_id !== userId) return { failure: "not_found" as const }
  if (rec.state === "dismissed" || rec.state === "applied") {
    return { failure: "settled" as const }
  }

  const { data: snapshot, error: snapErr } = await pub
    .from("published_roles")
    .select("id, role_id, agency_id, agency_name, role_ref, title, status, requirements_hash")
    .eq("id", rec.published_role_id)
    .maybeSingle()
  if (snapErr) throw snapErr
  if (!snapshot || snapshot.status !== "live") return { failure: "not_live" as const }

  const { data: liveReqs, error: reqErr } = await admin
    .from("requirements")
    .select("id, ref, text, weight")
    .eq("role_id", snapshot.role_id)
    .order("sort_order", { ascending: true })
  if (reqErr) throw reqErr
  const requirements = (liveReqs ?? []) as LiveRequirement[]

  const computedHash = requirementsHash(requirements)
  if (computedHash !== snapshot.requirements_hash) {
    /**
     * TEMPORARY DIAGNOSTIC (16 Aug): a live apply on staging hit this branch
     * while three independent SQL recomputations said the hashes agree. The
     * debug block rides the 409 so the toast itself says which input the
     * runtime actually saw — row count zero means the requirements query is
     * the lie; differing hash over 12 rows means the computation is. Strip
     * once the culprit is caught. No PII: counts and hash prefixes only.
     */
    return {
      failure: "stale" as const,
      debug: {
        reqCount: requirements.length,
        computed: computedHash.slice(0, 8),
        stored: String(snapshot.requirements_hash ?? "null").slice(0, 8),
        roleId: String(snapshot.role_id).slice(0, 8),
      },
    }
  }

  const [{ data: profile }, { data: bank }, { data: agencyRow }] = await Promise.all([
    pub.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    pub
      .from("career_evidence")
      .select(
        "id, category, claim, source_role, source_company, source_span, cv_line, pinned, hidden, rephrased_text, sort_order"
      )
      .eq("user_id", userId)
      .eq("hidden", false),
    admin.from("agencies").select("retention_days").eq("id", snapshot.agency_id).maybeSingle(),
  ])

  const cvText = buildProfileText((bank ?? []) as EvidenceRow[])
  if (!cvText) return { failure: "empty_bank" as const }

  const email = (profile?.email as string | null) ?? null
  const name = ((profile?.full_name as string | null) ?? "").trim() || email || "Tailr applicant"

  return {
    failure: null,
    rec: rec as {
      id: string
      published_role_id: string
      state: string
      score: number | string
      score_breakdown: Record<string, number> | null
      evidence: RecEvidence[]
    },
    snapshot,
    requirements,
    cvText,
    bankCount: (bank ?? []).length,
    name,
    email,
    retentionDays: (agencyRow?.retention_days as number) ?? 180,
  }
}

function manifestOf(ctx: Exclude<Awaited<ReturnType<typeof loadApplyContext>>, { failure: string }>): ApplyManifest {
  const byRef = new Map(ctx.rec.evidence.map((e) => [e.requirement_ref, e]))
  return {
    copyVersion: CONSENT_COPY_VERSION,
    sharedWith: ctx.snapshot.agency_name as string,
    roleRef: ctx.snapshot.role_ref as string,
    roleTitle: ctx.snapshot.title as string,
    retentionDays: ctx.retentionDays,
    name: ctx.name,
    email: ctx.email,
    evidenceCardCount: ctx.bankCount,
    cvTextChars: ctx.cvText.length,
    cvTextSha256: createHash("sha256").update(ctx.cvText).digest("hex"),
    evidenceMap: ctx.requirements.map((req) => {
      const found = byRef.get(req.ref)
      const quote = (found?.quote ?? "")?.trim() || null
      return {
        ref: req.ref,
        text: req.text,
        strength: quote ? found!.strength : "missing",
        quote,
      }
    }),
    score: typeof ctx.rec.score === "string" ? parseFloat(ctx.rec.score) : ctx.rec.score,
  }
}

export async function getApplyManifest(
  userId: string,
  recommendationId: string
): Promise<ManifestResult> {
  const ctx = await loadApplyContext(userId, recommendationId)
  if (ctx.failure) return { ok: false, reason: ctx.failure }
  return { ok: true, manifest: manifestOf(ctx) }
}

export type ApplyFailure = "not_found" | "settled" | "not_live" | "stale" | "empty_bank"

export async function applyToRole(
  userId: string,
  recommendationId: string
): Promise<{ ok: true; result: ApplyResult } | { ok: false; reason: ApplyFailure }> {
  const ctx = await loadApplyContext(userId, recommendationId)
  if (ctx.failure) return { ok: false, reason: ctx.failure }

  const manifest = manifestOf(ctx)
  const evidenceRows = buildAgencyEvidence(ctx.requirements, ctx.rec.evidence)

  // Recompute the score from what actually crosses, with the scan's stored
  // calibration — so inputs_hash is correct by construction and the recruiter
  // side's stale-hash refusal logic holds for matched candidates too.
  const strengthsById: Record<string, Strength> = {}
  for (const row of evidenceRows) strengthsById[row.requirement_id] = row.strength
  const breakdown = ctx.rec.score_breakdown ?? {}
  const baselines = {
    seniority: breakdown.seniority_calibration ?? 50,
    contextFit: breakdown.context_fit ?? 50,
    confidence: breakdown.confidence_completeness ?? 50,
    // Pre-migration recommendations lack this; 2 is the engine's own default
    // for an unremarkable CV and changes no overall number.
    confidenceLevel: (breakdown.confidence_level ?? 2) as 1 | 2 | 3 | 4,
  }
  const scoringInput = {
    requirements: ctx.requirements.map((r) => ({ id: r.id, ref: r.ref, weight: r.weight })),
    evidence: strengthsById,
    overrides: {},
    baselines,
    softSignals: {},
    reviewed: false,
  }
  const score = computeScore(scoringInput)

  const pub = createAdminClient()
  const { data, error } = await pub.rpc("apply_matched_recommendation", {
    p_recommendation: recommendationId,
    p_actor: userId,
    p_full_name: ctx.name,
    p_email: ctx.email ?? "",
    p_identity_hash: identityHash(ctx.email, ctx.name) ?? "",
    p_cv_text: ctx.cvText,
    p_manifest: manifest,
    p_evidence: evidenceRows,
    p_breakdown: {
      ...score,
      baselines,
      inputs_hash: inputsHash(scoringInput),
      engine_version: ENGINE_VERSION,
    },
  })
  if (error) {
    // The RPC's claim makes a concurrent second apply abort cleanly.
    if (/already settled/.test(error.message ?? "")) return { ok: false, reason: "settled" }
    if (/no longer live/.test(error.message ?? "")) return { ok: false, reason: "not_live" }
    throw error
  }

  const out = data as {
    candidate_ref: string
    rights_token: string
    suppression_overridden: boolean
  }
  return {
    ok: true,
    result: {
      candidateRef: out.candidate_ref,
      rightsPath: `/rights/${out.rights_token}`,
      suppressionOverridden: Boolean(out.suppression_overridden),
    },
  }
}
