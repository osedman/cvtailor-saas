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
import { getAppOrigin } from "@/lib/site-url"
import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import { notify } from "./notify"
import { RECORDING_BUCKET } from "./artifacts"
import { recomputeAndStore } from "./rescore"
import { loadCandidateMail, sendCandidateMail, whenLine } from "./candidate-mail"
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

/**
 * The round a raw consent token opens, or null. Every link minted for a round
 * lives in consent_links and keeps working (14 Nov 2026), so asking again
 * never kills the link in an earlier email. Links minted before then are on
 * the round itself.
 */
async function roundIdForToken(
  admin: ReturnType<typeof agencyAdmin>,
  rawToken: string
): Promise<string | null> {
  const hash = hashToken(rawToken)
  const { data: link, error } = await admin
    .from("consent_links")
    .select("round_id")
    .eq("token_hash", hash)
    .maybeSingle()
  if (error) throw error
  if (link) return link.round_id as string
  const { data: legacy, error: legacyError } = await admin
    .from("interview_rounds")
    .select("id")
    .eq("consent_token_hash", hash)
    .maybeSingle()
  if (legacyError) throw legacyError
  return (legacy?.id as string | undefined) ?? null
}

export interface CaptureRequest {
  rawToken: string
  candidateId: string
  /** True when this round had been asked before: the email is a resend. */
  resend: boolean
  /** The employer the interview is with, from the round's contact. */
  company: string | null
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
    .select("id, agency_id, role_id, candidate_id, contact_id, scheduled_at, capture_consent_status, capture_requested_at")
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

  const [{ data: candidate }, { data: role }, { data: agency }, { data: contact }] = await Promise.all([
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
    round.contact_id
      ? admin.from("client_contacts").select("company").eq("id", round.contact_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!candidate) throw new AgencyAccessError("candidate not found in your agency")

  // A new link, alongside any earlier ones (they keep working). The round is
  // stamped as asked so the panel stops reading 'pending' as "not asked".
  const raw = randomBytes(24).toString("base64url")
  const { error: linkError } = await admin.from("consent_links").insert({
    agency_id: ctx.agencyId,
    round_id: roundId,
    token_hash: hashToken(raw),
  })
  if (linkError) throw linkError
  const resend = !!round.capture_requested_at
  if (!resend) {
    const { error: updateError } = await admin
      .from("interview_rounds")
      .update({ capture_requested_at: new Date().toISOString() })
      .eq("id", roundId)
      .eq("agency_id", ctx.agencyId)
    if (updateError) throw updateError
  }

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId: round.role_id as string,
    candidateId: round.candidate_id as string,
    actorId: ctx.userId,
    entityType: "round",
    entityRef: (candidate.ref as string) ?? "",
    action: resend ? "capture_reasked" : "capture_requested",
    // No token, no address. Asking is the event; the answer is the candidate's.
    toValue: { round_id: roundId },
  })

  return {
    rawToken: raw,
    candidateId: round.candidate_id as string,
    resend,
    company: ((contact as { company?: string } | null)?.company as string | undefined) ?? null,
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

  const roundId = await roundIdForToken(admin, rawToken)
  if (!roundId) return null
  const { data: round, error } = await admin
    .from("interview_rounds")
    .select(
      "id, agency_id, role_id, candidate_id, contact_id, scheduled_at, duration_minutes, status, capture_consent_status"
    )
    .eq("id", roundId)
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
  const tokenRoundId = await roundIdForToken(admin, rawToken)
  if (!tokenRoundId) return null

  const { data: round, error } = await admin
    .from("interview_rounds")
    .select("id, agency_id, role_id, candidate_id, contact_id, scheduled_at, status, capture_consent_status")
    .eq("id", tokenRoundId)
    .maybeSingle()
  if (error) throw error
  if (!round || round.status === "cancelled") return null

  const roundId = round.id as string
  const agencyId = round.agency_id as string
  const candidateId = round.candidate_id as string

  // Repeating the answer they already gave changes nothing, so it records
  // nothing and tells nobody. Without this, a link that POSTs the same (or an
  // alternating) decision in a loop sends one recruiter email per request —
  // the doorway rate limit is per link and generous by design. A repeated
  // withdrawal still runs the cascade below (idempotent, and the privacy-safe
  // side to err on), but only reports if it actually removed something.
  const unchanged = round.capture_consent_status === decision
  if (unchanged && decision !== "withdrawn") {
    return { ok: true, decision, recordingPaths: [], rescoreCandidateId: null }
  }

  if (!unchanged) {
    const { error: updateError } = await admin
      .from("interview_rounds")
      .update({
        capture_consent_status: decision,
        capture_consent_at: new Date().toISOString(),
      })
      .eq("id", roundId)
    if (updateError) throw updateError
  }

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
    // The audio goes FIRST, through the Storage API (deleting storage.objects
    // rows in SQL orphans the blob). If it fails we stop before the rows go:
    // the artifact still names the path, so the candidate's retry — or the
    // nightly sweep — can finish the job. Deleting the rows first would leave
    // a voice in storage that nothing points at any more.
    if (recordingPaths.length > 0) {
      const { error: blobError } = await admin.storage.from(RECORDING_BUCKET).remove(recordingPaths)
      if (blobError) throw blobError
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

  // A repeated withdrawal that found nothing left to remove is a no-op.
  if (unchanged && recordingPaths.length === 0 && rescoreCandidateId === null) {
    return { ok: true, decision, recordingPaths, rescoreCandidateId }
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

  // Agency-bound only. facesClient() keeps this off the hiring manager's
  // desk: the panel interviewing someone is never told what they chose.
  // Only a changed answer is news; a repeated withdrawal's clean-up is not.
  if (!unchanged) {
    await notify(admin, {
      kind: "consent_answered",
      agencyId,
      actorId: null,
      roleId: round.role_id as string,
      candidateRef: (candidate?.ref as string) ?? "",
    })
  }

  // Withdrawal's last step: the score must stop counting what was deleted.
  if (rescoreCandidateId) {
    await recomputeAndStore(admin, agencyId, rescoreCandidateId)
  }

  // The candidate hears back every time their answer changes, and after a
  // withdrawal only once the deletion above has actually happened.
  const mailCtx = await loadCandidateMail(admin, candidateId)
  if (mailCtx) {
    if (round.contact_id) {
      const { data: contact } = await admin
        .from("client_contacts")
        .select("company")
        .eq("id", round.contact_id as string)
        .maybeSingle()
      if (contact?.company) mailCtx.company = contact.company as string
    }
    const when = whenLine(round.scheduled_at as string | null)
    const consentUrl = `${getAppOrigin()}/consent/${rawToken}`
    const removedSomething = recordingPaths.length > 0 || rescoreCandidateId !== null
    if (decision === "withdrawn" && removedSomething) {
      await sendCandidateMail(admin, mailCtx, {
        kind: "recording_deleted",
        roundDate: round.scheduled_at
          ? new Date(round.scheduled_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })
          : "",
      })
    } else if (!unchanged) {
      await sendCandidateMail(admin, mailCtx, {
        kind: "recording_receipt",
        answer: decision === "granted" ? "granted" : "declined",
        when,
        consentUrl,
      })
    }
  }

  return { ok: true, decision, recordingPaths, rescoreCandidateId }
}

/**
 * The one reminder (frame 47 §B email 3): a round in the next two days whose
 * candidate was asked and has not answered gets a single nudge, stamped on the
 * round so a re-run of the cron cannot send it twice. Silence after that means
 * no recording — never an assumed yes. Each reminder carries a new link; the
 * earlier ones keep working. Returns how many were sent.
 */
export async function runCaptureReminders(): Promise<number> {
  const admin = agencyAdmin()
  const now = new Date()
  const horizon = new Date(now.getTime() + 48 * 3_600_000)
  const { data: rounds, error } = await admin
    .from("interview_rounds")
    .select("id, agency_id, candidate_id, contact_id, scheduled_at")
    .eq("capture_consent_status", "pending")
    .eq("status", "scheduled")
    .not("capture_requested_at", "is", null)
    .is("capture_reminded_at", null)
    .gt("scheduled_at", now.toISOString())
    .lte("scheduled_at", horizon.toISOString())
    .limit(100)
  if (error) throw error

  let sent = 0
  for (const round of rounds ?? []) {
    try {
      // Stamp first: a reminder that might go twice is worse than one that
      // might not go at all, for a question that defaults to no.
      const { data: claimed } = await admin
        .from("interview_rounds")
        .update({ capture_reminded_at: now.toISOString() })
        .eq("id", round.id as string)
        .is("capture_reminded_at", null)
        .select("id")
      if (!claimed || claimed.length === 0) continue

      const mailCtx = await loadCandidateMail(admin, round.candidate_id as string)
      if (!mailCtx?.email) continue
      if (round.contact_id) {
        const { data: contact } = await admin
          .from("client_contacts")
          .select("company")
          .eq("id", round.contact_id as string)
          .maybeSingle()
        if (contact?.company) mailCtx.company = contact.company as string
      }
      const raw = randomBytes(24).toString("base64url")
      const { error: linkError } = await admin.from("consent_links").insert({
        agency_id: round.agency_id as string,
        round_id: round.id as string,
        token_hash: hashToken(raw),
      })
      if (linkError) throw linkError
      const ok = await sendCandidateMail(admin, mailCtx, {
        kind: "recording_reminder",
        when: whenLine(round.scheduled_at as string),
        consentUrl: `${getAppOrigin()}/consent/${raw}`,
      })
      if (ok) sent++
    } catch (e) {
      console.error("[consent] reminder failed", { name: e instanceof Error ? e.name : typeof e })
    }
  }
  return sent
}
