/**
 * Interview audio → transcript.
 *
 * ⚠ GATED, and gated twice over. Nothing here may touch a real candidate
 * until CONSENT-COPY-DRAFT §2/§3 is cleared and the DPIA is done — and
 * separately, NO REAL VENDOR IS WIRED IN. Sending a candidate's voice to a
 * third party makes that third party a sub-processor, which is a decision
 * for Ose and the lawyer, named in the DPA, not something this module gets
 * to pick. So the provider is an interface with a synthetic implementation:
 * the whole pipeline — queue, run, states, verification, sweep — is built and
 * drillable today, and the day a vendor is named it is one adapter.
 *
 * DIARIZATION IS NOT OPTIONAL.
 * In an interview, two or more people speak, and only the CANDIDATE's words
 * may ever become the candidate's evidence. Attributing an interviewer's
 * question to the candidate would be a fairness bug wearing a data-modelling
 * costume — "so you led the migration?" is not a claim the candidate made.
 * Every provider must therefore return speaker-labelled segments, and any
 * candidate that cannot is not a candidate.
 *
 * WHICH SPEAKER IS THE CANDIDATE IS A HUMAN'S ANSWER.
 * Diarization returns "speaker 0, speaker 1" — it does not know who they
 * are, and guessing (longest talker? second voice?) would be inference about
 * a person by the back door. So verification is not a rubber stamp: a
 * recruiter confirms the transcript reads correctly AND says which speaker
 * is the candidate. Only then does verified_at get stamped — which is the
 * same moment the sweep is allowed to delete the audio. The promise "the
 * recording is deleted once the transcript is checked" and the act of
 * checking it are deliberately the same event.
 *
 * NEVER: tone, sentiment, confidence, fluency, accent, hesitation. Verbatim
 * words mapped to requirements, or nothing. This is the product's argument
 * and the line the EU AI Act draws around emotion inference in hiring.
 */

import { agencyAdmin, writeAudit, assertWriter, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"
import { RECORDING_BUCKET } from "./recordings"

// ── The transcript shape ──────────────────────────────────────────────

export interface TranscriptSegment {
  /** Diarization label as the provider gave it — 0, 1, 2… never a name. */
  speaker: number
  start: number
  end: number
  text: string
}

export interface TranscriptContent {
  segments: TranscriptSegment[]
  language: string
  durationSeconds: number
  /** Set at verification by a human, never inferred. Null until then. */
  candidateSpeaker: number | null
}

// ── The provider seam ─────────────────────────────────────────────────

export interface TranscriptionResult {
  segments: TranscriptSegment[]
  language: string
  durationSeconds: number
  /** Free-form provider + model identifier, stamped on the artifact. */
  engineVersion: string
}

export interface TranscriptionProvider {
  readonly name: string
  transcribe(audio: Blob): Promise<TranscriptionResult>
}

/**
 * The only provider that exists today.
 *
 * It does not transcribe: it returns a fixed two-speaker exchange so the
 * queue, the states, verification and the sweep can all be drilled end to
 * end without a vendor, a key, or a byte of anyone's voice leaving the
 * building. Its engineVersion says so plainly, so a synthetic transcript can
 * never be mistaken for a real one in the artifact table.
 */
export const syntheticProvider: TranscriptionProvider = {
  name: "synthetic",
  async transcribe(audio: Blob): Promise<TranscriptionResult> {
    return {
      segments: [
        { speaker: 0, start: 0, end: 4, text: "Thanks for making the time — shall we start with the migration you led?" },
        { speaker: 1, start: 4, end: 14, text: "Sure. I owned the streaming layer end to end, about eighteen months, and we cut failed deliveries from roughly three percent to under one." },
        { speaker: 0, start: 14, end: 17, text: "And who else was on that team?" },
        { speaker: 1, start: 17, end: 26, text: "Four engineers. I was the only one on call for the pipeline itself, which is where most of the reliability work came from." },
      ],
      language: "en",
      durationSeconds: 26,
      engineVersion: `synthetic-1 (${audio.size} bytes, NOT A REAL TRANSCRIPT)`,
    }
  },
}

/**
 * Resolve the provider. Deliberately explicit: a missing or unknown value
 * yields the synthetic provider rather than silently reaching for a vendor,
 * because the failure mode of guessing here is candidate audio leaving the
 * building unannounced.
 */
export function resolveProvider(): TranscriptionProvider {
  const configured = process.env.TRANSCRIPTION_PROVIDER?.trim().toLowerCase()
  if (!configured || configured === "synthetic") return syntheticProvider
  throw new AgencyAccessError(
    `TRANSCRIPTION_PROVIDER="${configured}" is not implemented. Wiring a real ` +
      `transcription vendor makes it a sub-processor: it must be named in the ` +
      `DPA and covered by the DPIA before any adapter lands here.`
  )
}

// ── Queue ─────────────────────────────────────────────────────────────

export type TranscribeRefusal = "not_found" | "no_recording" | "already_queued" | "already_done"

/**
 * Queue a round for transcription. Writes a job row and nothing else — the
 * cron does the work, so a dead process loses no audio and spends no budget.
 */
export async function queueTranscription(
  ctx: AgencyContext,
  roundId: string
): Promise<{ ok: true; jobId: string } | { ok: false; reason: TranscribeRefusal }> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: round, error } = await admin
    .from("interview_rounds")
    .select("id, agency_id, role_id, candidate_id")
    .eq("id", roundId)
    .maybeSingle()
  if (error) throw error
  if (!round || round.agency_id !== ctx.agencyId) return { ok: false, reason: "not_found" }

  const { data: artifact } = await admin
    .from("round_artifacts")
    .select("id, kind, recording_path, recording_deleted_at, verified_at, content")
    .eq("round_id", roundId)
    .maybeSingle()

  if (!artifact || artifact.kind !== "transcript" || !artifact.recording_path) {
    return { ok: false, reason: "no_recording" }
  }
  if (artifact.verified_at) return { ok: false, reason: "already_done" }
  // The audio is gone once swept; there is nothing left to transcribe from.
  if (artifact.recording_deleted_at) return { ok: false, reason: "already_done" }

  const { data: job, error: jobErr } = await admin
    .from("ingestion_jobs")
    .insert({
      agency_id: round.agency_id,
      role_id: round.role_id,
      candidate_id: round.candidate_id,
      round_id: roundId,
      kind: "transcribe",
      status: "queued",
    })
    .select("id")
    .single()
  // The partial unique index refuses a second live job for the same round.
  if (jobErr) {
    if ((jobErr as { code?: string }).code === "23505") {
      return { ok: false, reason: "already_queued" }
    }
    throw jobErr
  }

  return { ok: true, jobId: job.id as string }
}

// ── Run ───────────────────────────────────────────────────────────────

/**
 * Run one queued transcription. Bounded by the caller; failures are recorded
 * on the job row and the audio is left exactly where it is, because a failed
 * transcription must be retryable — deleting audio on failure would destroy
 * the only copy of something the candidate agreed to have transcribed once.
 */
export async function runTranscription(jobId: string): Promise<boolean> {
  const admin = agencyAdmin()

  const { data: job } = await admin
    .from("ingestion_jobs")
    .select("id, agency_id, role_id, candidate_id, round_id, status")
    .eq("id", jobId)
    .maybeSingle()
  if (!job || job.status !== "queued") return false

  await admin
    .from("ingestion_jobs")
    .update({ status: "running", started_at: new Date().toISOString(), attempts: 1 })
    .eq("id", jobId)

  try {
    const { data: artifact } = await admin
      .from("round_artifacts")
      .select("id, recording_path, recording_deleted_at, verified_at")
      .eq("round_id", job.round_id as string)
      .maybeSingle()
    if (!artifact?.recording_path || artifact.recording_deleted_at || artifact.verified_at) {
      throw new Error("no audio to transcribe")
    }

    const { data: blob, error: dlErr } = await admin.storage
      .from(RECORDING_BUCKET)
      .download(artifact.recording_path as string)
    if (dlErr || !blob) throw new Error(`recording unreadable: ${dlErr?.message ?? "missing"}`)

    const provider = resolveProvider()
    const result = await provider.transcribe(blob)

    const content: TranscriptContent = {
      segments: result.segments,
      language: result.language,
      durationSeconds: result.durationSeconds,
      // A human names the candidate at verification. Never guessed here.
      candidateSpeaker: null,
    }

    const { error: writeErr } = await admin
      .from("round_artifacts")
      .update({ content, engine_version: result.engineVersion })
      .eq("id", artifact.id as string)
      .eq("kind", "transcript")
    if (writeErr) throw writeErr

    await admin
      .from("ingestion_jobs")
      .update({ status: "succeeded", finished_at: new Date().toISOString() })
      .eq("id", jobId)

    const { data: candidate } = await admin
      .from("candidates")
      .select("ref")
      .eq("id", job.candidate_id as string)
      .maybeSingle()

    await writeAudit(admin, {
      agencyId: job.agency_id as string,
      roleId: job.role_id as string,
      candidateId: job.candidate_id as string,
      actorId: null, // the cron, not a person
      entityType: "artifact",
      entityRef: (candidate?.ref as string) ?? "",
      action: "transcribed",
      // Shape, never content: an audit log is not a place to keep a
      // transcript of somebody's interview.
      toValue: {
        round_id: job.round_id,
        segments: result.segments.length,
        speakers: new Set(result.segments.map((s) => s.speaker)).size,
        engine: result.engineVersion,
      },
    })
    return true
  } catch (err) {
    await admin
      .from("ingestion_jobs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_code: "model_error",
        error_detail: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      })
      .eq("id", jobId)
    return false
  }
}

/** The cron backstop. Bounded so one run cannot spend the whole budget. */
export async function runQueuedTranscriptions(limit = 2): Promise<number> {
  const admin = agencyAdmin()
  const { data: jobs } = await admin
    .from("ingestion_jobs")
    .select("id")
    .eq("kind", "transcribe")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit)

  let ran = 0
  for (const job of jobs ?? []) {
    if (await runTranscription(job.id as string)) ran++
  }
  return ran
}

// ── Verify ────────────────────────────────────────────────────────────

export type VerifyRefusal = "not_found" | "not_transcribed" | "already_verified" | "bad_speaker"

/**
 * A human confirms the transcript and names the candidate's speaker.
 *
 * This is the hinge of the whole feature. Stamping verified_at is what
 * releases the audio for deletion, so it must never be automatic: the
 * promise made to the candidate is that a person checked it, and the only
 * thing that makes that true is a person doing it.
 */
export async function verifyTranscript(
  ctx: AgencyContext,
  roundId: string,
  candidateSpeaker: number
): Promise<{ ok: true } | { ok: false; reason: VerifyRefusal }> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: round } = await admin
    .from("interview_rounds")
    .select("id, agency_id, role_id, candidate_id")
    .eq("id", roundId)
    .maybeSingle()
  if (!round || round.agency_id !== ctx.agencyId) return { ok: false, reason: "not_found" }

  const { data: artifact } = await admin
    .from("round_artifacts")
    .select("id, kind, content, verified_at")
    .eq("round_id", roundId)
    .maybeSingle()
  if (!artifact || artifact.kind !== "transcript") return { ok: false, reason: "not_found" }
  if (artifact.verified_at) return { ok: false, reason: "already_verified" }

  const content = (artifact.content ?? {}) as Partial<TranscriptContent>
  const segments = content.segments ?? []
  if (segments.length === 0) return { ok: false, reason: "not_transcribed" }

  // The named speaker has to be one that actually speaks in this transcript,
  // or every quote drawn from it would be attributed to nobody.
  const speakers = new Set(segments.map((s) => s.speaker))
  if (!speakers.has(candidateSpeaker)) return { ok: false, reason: "bad_speaker" }

  const { error } = await admin
    .from("round_artifacts")
    .update({
      content: { ...content, candidateSpeaker },
      verified_at: new Date().toISOString(),
    })
    .eq("id", artifact.id as string)
    .eq("kind", "transcript")
  if (error) throw error

  const { data: candidate } = await admin
    .from("candidates")
    .select("ref")
    .eq("id", round.candidate_id as string)
    .maybeSingle()

  await writeAudit(admin, {
    agencyId: round.agency_id as string,
    roleId: round.role_id as string,
    candidateId: round.candidate_id as string,
    actorId: ctx.userId,
    entityType: "artifact",
    entityRef: (candidate?.ref as string) ?? "",
    action: "transcript_verified",
    toValue: {
      round_id: roundId,
      candidate_speaker: candidateSpeaker,
      segments: segments.length,
      // Says out loud what this action releases.
      releases_audio_for_deletion: true,
    },
  })

  return { ok: true }
}
