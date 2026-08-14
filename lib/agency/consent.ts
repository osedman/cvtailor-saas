/**
 * Interview capture consent — the candidate's decision, and nobody else's.
 *
 * Copy and decisions: docs/CONSENT-COPY-DRAFT.md. Settled with Ose 14 Aug:
 * audio only, the AGENCY is controller, and the client never sees the raw
 * transcript — only structured evidence drawn from it.
 *
 * The invariant this module exists to protect: `capture_consent_status` moves
 * off 'pending' ONLY through a link the candidate holds. lib/agency/rounds.ts
 * deliberately has no function that can set it, and nothing here accepts an
 * AgencyContext or a HiringContext for the decision itself — recordDecision
 * takes a raw token and nothing else. A recruiter cannot consent on someone's
 * behalf because there is no code path that would let them.
 *
 * Requesting is separate from booking on purpose: a recruiter may book a round
 * and only later decide to ask about recording, and the two acts have different
 * weights. requestCapture mints the token and leaves the status at 'pending'.
 *
 * WITHDRAWAL IS A CASCADE, NOT A FLAG. Withdrawing deletes the artifact, its
 * recording path, and every candidate_evidence row that came from that round,
 * then the caller rescores. Same shape as the consumer-revocation rule in
 * AGENCIES_SCHEMA.md §5: if the basis goes, everything derived from it goes.
 */

import { createHash, randomBytes } from "crypto"
import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

export type ConsentDecision = "granted" | "declined" | "withdrawn"

/** Raw-once token discipline, same as portal links and invites. */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

/** Cheap guard before touching the database on a guessed value. */
function tokenLooksPlausible(raw: string): boolean {
  return typeof raw === "string" && raw.length >= 16 && raw.length <= 64
}

export interface CaptureRequest {
  rawToken: string
  candidateEmail: string | null
  candidateName: string
  roleTitle: string
  scheduledAt: string | null
  retentionDays: number
}

/**
 * Mint the candidate's consent link for a round.
 *
 * Returns the raw token exactly once so the caller can send the email. Status
 * stays 'pending' — this asks the question, it does not answer it.
 */
export async function requestCapture(
  ctx: AgencyContext,
  roundId: string
): Promise<CaptureRequest> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: round, error } = await admin
    .from("interview_rounds")
    .select("id, agency_id, role_id, candidate_id, scheduled_at, capture_consent_status")
    .eq("id", roundId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (error) throw error
  if (!round) throw new AgencyAccessError("round not found in your agency")
  if (round.capture_consent_status === "granted") {
    throw new AgencyAccessError("this candidate has already agreed to recording")
  }
  if (round.capture_consent_status === "withdrawn") {
    throw new AgencyAccessError(
      "this candidate withdrew consent — asking again is a conversation, not a link"
    )
  }

  const [{ data: candidate }, { data: role }, { data: agency }] = await Promise.all([
    admin
      .from("candidates")
      .select("id, ref, full_name, email")
      .eq("id", round.candidate_id as string)
      .eq("agency_id", ctx.agencyId)
      .maybeSingle(),
    admin
      .from("job_roles")
      .select("id, title")
      .eq("id", round.role_id as string)
      .eq("agency_id", ctx.agencyId)
      .maybeSingle(),
    admin.from("agencies").select("retention_days").eq("id", ctx.agencyId).maybeSingle(),
  ])
  if (!candidate) throw new AgencyAccessError("candidate not found in your agency")

  const raw = randomBytes(24).toString("base64url")
  const { error: updateError } = await admin
    .from("interview_rounds")
    .update({ consent_token_hash: hashToken(raw) })
    .eq("id", roundId)
    .eq("agency_id", ctx.agencyId)
  if (updateError) throw updateError

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: round.role_id as string,
    candidateId: round.candidate_id as string,
    actorId: ctx.userId,
    entityType: "round",
    entityRef: (candidate.ref as string) ?? "",
    action: "capture_requested",
    // No token, no address. Asking is the event; the answer is the candidate's.
    toValue: { round_id: roundId },
  })

  return {
    rawToken: raw,
    candidateEmail: (candidate.email as string | null) ?? null,
    candidateName: (candidate.full_name as string) ?? "",
    roleTitle: (role?.title as string) ?? "the role",
    scheduledAt: (round.scheduled_at as string | null) ?? null,
    retentionDays: (agency?.retention_days as number) ?? 180,
  }
}

export interface ConsentView {
  agencyName: string
  company: string
  roleTitle: string
  candidateFirstName: string
  scheduledAt: string | null
  durationMinutes: number
  retentionDays: number
  status: string
}

/**
 * What the consent page renders. Token-authenticated and nothing more — the
 * candidate has no account and must never need one.
 *
 * Returns null for anything unrecognised, so an invalid, stale or cancelled
 * link is indistinguishable from a guessed one.
 */
export async function peekConsent(rawToken: string): Promise<ConsentView | null> {
  if (!tokenLooksPlausible(rawToken)) return null
  const admin = agencyAdmin()

  const { data: round, error } = await admin
    .from("interview_rounds")
    .select(
      "id, agency_id, role_id, candidate_id, contact_id, scheduled_at, duration_minutes, status, capture_consent_status"
    )
    .eq("consent_token_hash", hashToken(rawToken))
    .maybeSingle()
  if (error) throw error
  if (!round) return null
  // A cancelled interview has no question to answer.
  if (round.status === "cancelled") return null

  const [{ data: candidate }, { data: role }, { data: agency }, { data: contact }] =
    await Promise.all([
      admin.from("candidates").select("full_name").eq("id", round.candidate_id as string).maybeSingle(),
      admin.from("job_roles").select("title").eq("id", round.role_id as string).maybeSingle(),
      admin
        .from("agencies")
        .select("name, retention_days")
        .eq("id", round.agency_id as string)
        .maybeSingle(),
      admin
        .from("client_contacts")
        .select("company")
        .eq("id", round.contact_id as string)
        .maybeSingle(),
    ])

  const full = ((candidate?.full_name as string) ?? "").trim()
  return {
    agencyName: (agency?.name as string) ?? "the agency",
    company: (contact?.company as string) ?? "the employer",
    roleTitle: (role?.title as string) ?? "the role",
    candidateFirstName: full.split(/\s+/)[0] ?? "",
    scheduledAt: (round.scheduled_at as string | null) ?? null,
    durationMinutes: (round.duration_minutes as number) ?? 45,
    retentionDays: (agency?.retention_days as number) ?? 180,
    status: (round.capture_consent_status as string) ?? "pending",
  }
}

export interface DecisionResult {
  ok: true
  decision: ConsentDecision
  /** Storage paths the caller must delete via the Storage API. SQL deletion of
   * storage.objects orphans blobs — the same lesson as purge_candidate. */
  recordingPaths: string[]
  /** True when derived evidence was removed and the candidate needs rescoring. */
  rescoreCandidateId: string | null
}

/**
 * Record the candidate's answer. Token is the ONLY credential.
 *
 * 'withdrawn' is the one that does real work: the artifact goes, the recording
 * path comes back for blob deletion, and every candidate_evidence row sourced
 * from this round is deleted so nothing derived from a withdrawn recording can
 * survive in a score. The caller rescores.
 */
export async function recordDecision(
  rawToken: string,
  decision: ConsentDecision
): Promise<DecisionResult | null> {
  if (!tokenLooksPlausible(rawToken)) return null
  const admin = agencyAdmin()
  const tokenHash = hashToken(rawToken)

  const { data: round, error } = await admin
    .from("interview_rounds")
    .select("id, agency_id, role_id, candidate_id, status, capture_consent_status")
    .eq("consent_token_hash", tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!round || round.status === "cancelled") return null

  const roundId = round.id as string
  const agencyId = round.agency_id as string
  const candidateId = round.candidate_id as string

  const { error: updateError } = await admin
    .from("interview_rounds")
    .update({
      capture_consent_status: decision,
      capture_consent_at: new Date().toISOString(),
    })
    .eq("id", roundId)
  if (updateError) throw updateError

  const recordingPaths: string[] = []
  let rescoreCandidateId: string | null = null

  if (decision === "withdrawn") {
    // 1. The artifact and its recording.
    const { data: artifacts } = await admin
      .from("round_artifacts")
      .select("id, recording_path")
      .eq("round_id", roundId)
    for (const a of artifacts ?? []) {
      const path = a.recording_path as string | null
      if (path) recordingPaths.push(path)
    }
    if ((artifacts ?? []).length > 0) {
      const { error: delArtifact } = await admin
        .from("round_artifacts")
        .delete()
        .eq("round_id", roundId)
      if (delArtifact) throw delArtifact
    }

    // 2. Everything the transcript produced. If the basis is gone, so is
    //    anything derived from it — the consumer-revocation rule, applied here.
    const { data: derived } = await admin
      .from("candidate_evidence")
      .select("id")
      .eq("round_id", roundId)
      .eq("origin", "interview")
    if ((derived ?? []).length > 0) {
      const { error: delEvidence } = await admin
        .from("candidate_evidence")
        .delete()
        .eq("round_id", roundId)
        .eq("origin", "interview")
      if (delEvidence) throw delEvidence
      rescoreCandidateId = candidateId
    }
  }

  const { data: candidate } = await admin
    .from("candidates")
    .select("ref")
    .eq("id", candidateId)
    .maybeSingle()

  await writeAudit(admin, {
    agencyId,
    roleId: round.role_id as string,
    candidateId,
    // The candidate is not an auth user; the actor is deliberately null and the
    // action names who acted. Their identity is the round, not an account.
    actorId: null,
    entityType: "round",
    entityRef: (candidate?.ref as string) ?? "",
    action: `capture_${decision}`,
    reason: "candidate decision",
    toValue: {
      round_id: roundId,
      evidence_removed: rescoreCandidateId !== null,
      recordings_removed: recordingPaths.length,
    },
  })

  return { ok: true, decision, recordingPaths, rescoreCandidateId }
}
