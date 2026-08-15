/**
 * Candidate ingestion pipeline: untrusted CV in → candidate row + evidence map
 * + server-side score out. Every AI output passes sanitizeDeep and the
 * missing⇔quote rules before touching the database; the DB constraints are the
 * backstop, this file is the enforcement point.
 *
 * Order matters:
 *   1. objection/erasure suppression check (pre-parse, via email regex) —
 *      a suppressed identity is not processed at all
 *   2. model extraction (profile + calibration + per-requirement evidence)
 *   3. candidate row (user-scoped client — RLS re-checks membership)
 *   4. identity rows + duplicate detection (service role)
 *   5. CV file to storage (service role; bucket has no client write path)
 *   6. evidence rows + score_breakdowns (service role)
 *   7. Art 14 notice row, scheduled at agency.notice_delay_days
 *   8. audit row
 */

// The model call, the tool schema and the prompt live in ./assessment, shared
// with the matching scan so both judge a person identically.
import { extractAssessment, QUOTE_LIMIT } from "./assessment"
import {
  AgencyAccessError,
  agencyAdmin,
  assertWriter,
  writeAudit,
  type AgencyClient,
} from "./db"
import {
  computeScore,
  ENGINE_VERSION,
  identityHash,
  inputsHash,
  type ScoringBaselines,
} from "./scoring"
import type { AgencyContext, Candidate, Requirement, Strength } from "./types"

export const CV_TEXT_LIMIT = 60_000


export async function extractFileText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (ext === "pdf") {
    await import("@/lib/pdf-node-polyfill")
    const { extractText, getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return Array.isArray(text) ? text.join("\n\n") : text
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  if (ext === "txt") return buffer.toString("utf-8")
  throw new AgencyAccessError("Unsupported file type: use PDF, DOCX or TXT")
}

export interface IngestSource {
  cvText: string
  source: Candidate["source"]
  sourceDetail: string
  file?: { buffer: Buffer; name: string; contentType: string }
}

export interface IngestResult {
  candidate: Candidate
  score: ReturnType<typeof computeScore>
  duplicateOf: string | null
}

export async function ingestCandidate(
  ctx: AgencyContext,
  db: AgencyClient,
  roleId: string,
  input: IngestSource
): Promise<IngestResult> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: role, error: roleError } = await admin
    .from("job_roles")
    .select("id, agency_id, ref, title, seniority, company_context")
    .eq("id", roleId)
    .maybeSingle()
  if (roleError) throw roleError
  if (!role || role.agency_id !== ctx.agencyId) {
    throw new AgencyAccessError("role not found in caller's agency")
  }

  const cvText = input.cvText.slice(0, CV_TEXT_LIMIT)

  // 1. Objection check before any processing. Email regex is the pre-parse
  // approximation of identity; the post-parse identity is checked again below.
  const emailMatch = cvText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  if (emailMatch) {
    const hash = identityHash(emailMatch[0])
    if (hash && (await isSuppressed(admin, ctx.agencyId, hash))) {
      throw new AgencyAccessError(
        "This person has asked your agency not to process their data"
      )
    }
  }

  const { data: requirements, error: reqError } = await admin
    .from("requirements")
    .select("id, ref, text, weight")
    .eq("role_id", roleId)
    .order("sort_order")
  if (reqError) throw reqError
  if (!requirements || requirements.length === 0) {
    throw new AgencyAccessError("Parse the job description before adding candidates")
  }

  const job = await createJob(admin, ctx.agencyId, roleId, "cv_parse")

  try {
    // 2. Model extraction. CV content is untrusted data, never instructions.
    const extraction = await extractAssessment(
      cvText,
      role as { title: string; seniority: string; company_context: string },
      requirements as Pick<Requirement, "id" | "ref" | "text" | "weight">[]
    )

    // Post-parse suppression re-check on the authoritative identity.
    const idHash = identityHash(extraction.profile.email || null, extraction.profile.full_name)
    if (idHash && (await isSuppressed(admin, ctx.agencyId, idHash))) {
      throw new AgencyAccessError(
        "This person has asked your agency not to process their data"
      )
    }

    // 3. Candidate row through the user-scoped client (RLS enforces role).
    const { data: ref, error: refError } = await admin.rpc("next_candidate_ref", {
      p_role: roleId,
    })
    if (refError) throw refError

    const { data: candidate, error: candError } = await db
      .from("candidates")
      .insert({
        agency_id: ctx.agencyId,
        role_id: roleId,
        ref,
        full_name: extraction.profile.full_name,
        email: extraction.profile.email || null,
        current_title: extraction.profile.current_title,
        years: extraction.profile.years ?? null,
        location: extraction.profile.location ?? "",
        salary_text: extraction.profile.salary_text ?? "",
        source: input.source,
        source_detail: input.sourceDetail,
        ingested_by: ctx.userId,
        redacted: extraction.profile.redacted ?? false,
        cv_text: cvText,
        parse_status: "parsed",
        parsed_at: new Date().toISOString(),
      })
      .select("*")
      .single()
    if (candError) throw candError

    // 4. Identity + duplicate detection (agency-wide, banner-only, never a block).
    let duplicateOf: string | null = null
    if (idHash) {
      const { data: existing } = await admin
        .from("candidate_identities")
        .select("candidate_id")
        .eq("agency_id", ctx.agencyId)
        .eq("identity_hash", idHash)
        .neq("candidate_id", candidate.id)
        .limit(1)
      duplicateOf = existing?.[0]?.candidate_id ?? null

      await admin.from("candidate_identities").insert({
        agency_id: ctx.agencyId,
        identity_hash: idHash,
        candidate_id: candidate.id,
      })
      if (duplicateOf) {
        await admin.from("candidates").update({ duplicate_of: duplicateOf }).eq("id", candidate.id)
      }
    }

    // 5. Original file to storage (compliance asset; same purge lifecycle).
    if (input.file) {
      const safeName = input.file.name.replace(/[^\w.\-]+/g, "_").slice(-80)
      const path = `${ctx.agencyId}/${roleId}/${candidate.id}/${safeName}`
      const { error: uploadError } = await admin.storage
        .from("agency-cvs")
        .upload(path, input.file.buffer, { contentType: input.file.contentType })
      if (!uploadError) {
        await admin.from("candidates").update({ cv_storage_path: path }).eq("id", candidate.id)
        candidate.cv_storage_path = path
      }
    }

    // 6. Evidence rows — the missing⇔quote promise enforced in code first.
    const evidenceByReq: Record<string, Strength> = {}
    const evidenceRows = requirements.map((req) => {
      const found = extraction.evidence.find((e) => e.requirement_ref === req.ref)
      let strength: Strength = found?.strength ?? "missing"
      let quote = (found?.quote ?? "").trim().slice(0, QUOTE_LIMIT)
      // A strength claim the model can't back with a verbatim quote that
      // actually appears in the CV is downgraded, never stored as inferred.
      if (strength !== "missing" && (!quote || !cvText.includes(quote.slice(0, 60)))) {
        strength = "missing"
        quote = ""
      }
      evidenceByReq[req.id] = strength
      return {
        agency_id: ctx.agencyId,
        candidate_id: candidate.id,
        requirement_id: req.id,
        strength,
        quote: strength === "missing" ? null : quote,
        source_cite: strength === "missing" ? "" : (found?.source_cite ?? ""),
        origin: "cv" as const,
      }
    })
    const { error: evError } = await admin.from("candidate_evidence").insert(evidenceRows)
    if (evError) throw evError

    // Server-side score; first compute doubles as the pre-screening original.
    const baselines: ScoringBaselines = {
      seniority: extraction.calibration.seniority,
      contextFit: extraction.calibration.context_fit,
      confidence: extraction.calibration.confidence,
      confidenceLevel: extraction.calibration.confidence_level,
    }
    const scoringInput = {
      requirements: requirements as { id: string; ref: string; weight: Requirement["weight"] }[],
      evidence: evidenceByReq,
      overrides: {},
      baselines,
      softSignals: {},
      reviewed: false,
    }
    const score = computeScore(scoringInput)
    const { error: sbError } = await admin.from("score_breakdowns").upsert(
      {
        agency_id: ctx.agencyId,
        candidate_id: candidate.id,
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
        baselines,
        original_overall: score.overall,
        inputs_hash: inputsHash(scoringInput),
        engine_version: ENGINE_VERSION,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "candidate_id" }
    )
    if (sbError) throw sbError

    // 7. Art 14 notice, scheduled into the agency's delay window. The cron
    // handles no-contact-details and late suppressions at send time.
    const { data: agencyRow } = await admin
      .from("agencies")
      .select("notice_delay_days")
      .eq("id", ctx.agencyId)
      .single()
    const delayDays = agencyRow?.notice_delay_days ?? 7
    const scheduledFor = new Date(Date.now() + delayDays * 86_400_000).toISOString()
    await admin.from("candidate_notices").insert({
      agency_id: ctx.agencyId,
      candidate_id: candidate.id,
      scheduled_for: scheduledFor,
    })

    // 8. Audit — provenance of the candidate record itself.
    await writeAudit(admin, {
      agencyId: ctx.agencyId,
      roleId,
      candidateId: candidate.id,
      actorId: ctx.userId,
      entityType: "candidate",
      entityRef: ref as string,
      action: "created",
      toValue: { source: input.source, source_detail: input.sourceDetail },
    })

    await finishJob(admin, job, "succeeded")
    return { candidate: candidate as Candidate, score, duplicateOf }
  } catch (error) {
    await finishJob(
      admin,
      job,
      "failed",
      error instanceof AgencyAccessError ? "rejected" : "model_error",
      error instanceof Error ? error.message.slice(0, 500) : String(error)
    )
    throw error
  }
}

async function isSuppressed(admin: AgencyClient, agencyId: string, hash: string) {
  const { data } = await admin
    .from("notice_suppressions")
    .select("identity_hash")
    .eq("agency_id", agencyId)
    .eq("identity_hash", hash)
    .maybeSingle()
  return !!data
}

async function createJob(
  admin: AgencyClient,
  agencyId: string,
  roleId: string,
  kind: "jd_parse" | "cv_parse" | "score" | "match_scan"
): Promise<string | null> {
  const { data } = await admin
    .from("ingestion_jobs")
    .insert({
      agency_id: agencyId,
      role_id: roleId,
      kind,
      status: "running",
      attempts: 1,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  return data?.id ?? null
}

async function finishJob(
  admin: AgencyClient,
  jobId: string | null,
  status: "succeeded" | "failed",
  errorCode?: string,
  errorDetail?: string
) {
  if (!jobId) return
  await admin
    .from("ingestion_jobs")
    .update({
      status,
      error_code: errorCode ?? null,
      error_detail: errorDetail ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId)
}

export { createJob, finishJob }
