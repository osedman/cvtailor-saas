/**
 * Interview audio: getting it in, and the guard that decides whether it may
 * come in at all.
 *
 * ⚠ GATED. Nothing here may point at a real candidate until the lawyer has
 * read docs/CONSENT-COPY-DRAFT.md §2/§3 and the DPIA is done. It exists so
 * the path can be built and drilled against synthetic audio — the day the
 * gate clears should be a day something is switched on, not started.
 *
 * THE ONE GUARD THAT MATTERS: `capture_consent_status === 'granted'`.
 * Everything else here is ordinary tenancy checking; this is the promise.
 * A recruiter cannot consent for a candidate (recordDecision takes a raw
 * token and nothing else), so a granted status can only have come from the
 * candidate's own click on /consent/{token}. If that check is ever loosened,
 * the feature becomes the thing the product exists to argue against.
 *
 * WHY SIGNED URLS RATHER THAN A PROXY ROUTE
 * Audio is tens of megabytes and serverless request bodies are not. The
 * route mints a short-lived service-role upload token AFTER the consent
 * check, the browser PUTs the bytes straight to storage, and a second call
 * confirms. The bucket has no policies at all, so a token minted here is the
 * only way in — the check cannot be routed around.
 *
 * The artifact row is written at CONFIRM, never at mint: a row pointing at a
 * blob that was never uploaded would put a recording_path into the deletion
 * sweep's sights that does not exist, and the sweep's silence is a promise
 * being kept. It must never be a lie.
 */

import { agencyAdmin, writeAudit, assertWriter, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

// One name for one bucket. artifacts.ts has owned this since the deletion
// sweep was written; a second constant is how a sweep ends up pointed
// somewhere the uploader is not.
export { RECORDING_BUCKET } from "./artifacts"
import { RECORDING_BUCKET } from "./artifacts"

/** Mirrors the bucket's allowed_mime_types; audio only, deliberately. */
export const ALLOWED_AUDIO = [
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
] as const

const EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
}

export type RecordingRefusal =
  | "not_found"
  | "no_consent"
  | "already_recorded"
  | "debriefed"
  | "bad_type"

export interface UploadTicket {
  path: string
  token: string
  bucket: string
}

interface RoundRow {
  id: string
  agency_id: string
  role_id: string
  candidate_id: string
  status: string
  capture_consent_status: string
}

/** Load the round and apply every gate. Shared so mint and confirm cannot
 *  drift — the consent check must be identical on both. */
async function gate(
  ctx: AgencyContext,
  roundId: string
): Promise<{ ok: true; round: RoundRow } | { ok: false; reason: RecordingRefusal }> {
  const admin = agencyAdmin()

  const { data: round, error } = await admin
    .from("interview_rounds")
    .select("id, agency_id, role_id, candidate_id, status, capture_consent_status")
    .eq("id", roundId)
    .maybeSingle()
  if (error) throw error
  // Cross-tenant reads as not found: the existence of another agency's round
  // is itself information.
  if (!round || round.agency_id !== ctx.agencyId) return { ok: false, reason: "not_found" }

  if (round.capture_consent_status !== "granted") return { ok: false, reason: "no_consent" }

  // round_id is unique on round_artifacts: a round holds ONE artifact, and it
  // is either the transcript of a recorded round or the debrief of an
  // unrecorded one. A round already written up as a debrief cannot then
  // acquire audio.
  const { data: existing, error: artErr } = await admin
    .from("round_artifacts")
    .select("id, kind, recording_path, recording_deleted_at")
    .eq("round_id", roundId)
    .maybeSingle()
  if (artErr) throw artErr
  if (existing) {
    if (existing.kind === "debrief") return { ok: false, reason: "debriefed" }
    // Re-uploading over an existing recording would orphan the first blob and
    // silently replace evidence someone may already have read.
    if (existing.recording_path) return { ok: false, reason: "already_recorded" }
  }

  return { ok: true, round: round as RoundRow }
}

/**
 * Mint a short-lived upload ticket. Writes nothing: if the browser never
 * uploads, nothing happened.
 */
export async function createUploadTicket(
  ctx: AgencyContext,
  roundId: string,
  mimeType: string
): Promise<{ ok: true; ticket: UploadTicket } | { ok: false; reason: RecordingRefusal }> {
  assertWriter(ctx)

  const ext = EXT_BY_MIME[mimeType]
  if (!ext) return { ok: false, reason: "bad_type" }

  const gated = await gate(ctx, roundId)
  if (!gated.ok) return gated

  // Agency-scoped, round-unique: round_artifacts.round_id is unique, so one
  // round can only ever own one blob.
  const path = `${gated.round.agency_id}/${roundId}.${ext}`

  const admin = agencyAdmin()
  const { data, error } = await admin.storage
    .from(RECORDING_BUCKET)
    .createSignedUploadUrl(path, { upsert: false })
  if (error) throw error

  return { ok: true, ticket: { path: data.path, token: data.token, bucket: RECORDING_BUCKET } }
}

/**
 * Confirm an upload: prove the blob is really there, then write the artifact
 * row that puts it under the deletion sweep's care.
 */
export async function confirmUpload(
  ctx: AgencyContext,
  roundId: string,
  path: string
): Promise<{ ok: true; artifactId: string } | { ok: false; reason: RecordingRefusal }> {
  assertWriter(ctx)

  const gated = await gate(ctx, roundId)
  if (!gated.ok) return gated
  const { round } = gated

  // The client tells us where it put the file; we do not believe it. The path
  // is recomputed from the round and must match, so a confirm cannot attach
  // some other agency's blob to this round.
  const expectedPrefix = `${round.agency_id}/${roundId}.`
  if (!path.startsWith(expectedPrefix)) return { ok: false, reason: "not_found" }

  const admin = agencyAdmin()
  const folder = round.agency_id
  const name = path.slice(folder.length + 1)
  const { data: listed, error: listErr } = await admin.storage
    .from(RECORDING_BUCKET)
    .list(folder, { search: name, limit: 1 })
  if (listErr) throw listErr
  const blob = (listed ?? []).find((o) => o.name === name)
  // No blob, no row. An artifact pointing at nothing would make the sweep's
  // "nothing to delete" mean two different things.
  if (!blob) return { ok: false, reason: "not_found" }

  const { data: existing } = await admin
    .from("round_artifacts")
    .select("id")
    .eq("round_id", roundId)
    .maybeSingle()

  let artifactId: string
  if (existing) {
    const { error: upErr } = await admin
      .from("round_artifacts")
      .update({ recording_path: path })
      .eq("id", existing.id as string)
      .eq("kind", "transcript")
    if (upErr) throw upErr
    artifactId = existing.id as string
  } else {
    const { data: created, error: insErr } = await admin
      .from("round_artifacts")
      .insert({
        agency_id: round.agency_id,
        round_id: roundId,
        kind: "transcript",
        // Empty until transcription runs. verified_at stays null, so the
        // sweep leaves the audio alone until the transcript is checked.
        content: {},
        recording_path: path,
        engine_version: "",
      })
      .select("id")
      .single()
    if (insErr) throw insErr
    artifactId = created.id as string
  }

  const { data: candidate } = await admin
    .from("candidates")
    .select("ref")
    .eq("id", round.candidate_id)
    .maybeSingle()

  await writeAudit(admin, {
    agencyId: round.agency_id,
    roleId: round.role_id,
    candidateId: round.candidate_id,
    actorId: ctx.userId,
    entityType: "artifact",
    entityRef: (candidate?.ref as string) ?? "",
    action: "recording_uploaded",
    // Size and type, never a path or a byte of content.
    toValue: {
      round_id: roundId,
      artifact_id: artifactId,
      bytes: (blob.metadata as { size?: number } | null)?.size ?? null,
    },
  })

  return { ok: true, artifactId }
}

// ── Read ──────────────────────────────────────────────────────────────

/**
 * The five states the capture panel renders, resolved server-side so the UI
 * never has to infer one from a pile of nullable columns — the place that
 * decides "is this transcribed yet" should be one place, not every renderer.
 */
export type CaptureState =
  | "no_consent"
  | "ready"
  | "uploaded"
  | "transcribing"
  | "failed"
  | "needs_check"
  | "verified"

export interface CaptureView {
  state: CaptureState
  consentStatus: string
  /** Never the path — the UI has no use for it and it is not the UI's. */
  hasRecording: boolean
  audioDeleted: boolean
  uploadedBytes: number | null
  segmentCount: number
  /** Distinct diarization labels; the recruiter picks the candidate's. */
  speakers: number[]
  candidateSpeaker: number | null
  verifiedAt: string | null
  jobStatus: string | null
  jobError: string | null
  /** When the candidate was first asked, and when they answered (frame 47 §A). */
  requestedAt: string | null
  remindedAt: string | null
  answeredAt: string | null
  /** The transcript, for reading before naming a voice. Recruiter-only, like
   *  everything on this panel; capped so a long call stays a sane payload. */
  lines: Array<{ speaker: number; start: number; text: string }>
  /** Quotes this round added to the candidate's evidence (card 6). */
  quotes: Array<{ ref: string; requirement: string; weight: string; strength: string; quote: string; source: string }>
}

const LINE_CAP = 400

export async function getCaptureState(
  ctx: AgencyContext,
  roundId: string
): Promise<CaptureView | null> {
  const admin = agencyAdmin()

  const { data: round } = await admin
    .from("interview_rounds")
    .select("id, agency_id, capture_consent_status, capture_consent_at, capture_requested_at, capture_reminded_at")
    .eq("id", roundId)
    .maybeSingle()
  if (!round || round.agency_id !== ctx.agencyId) return null

  const { data: evidence } = await admin
    .from("candidate_evidence")
    .select("quote, strength, source_cite, requirement_id")
    .eq("round_id", roundId)
    .eq("origin", "interview")
  const reqIds = [...new Set((evidence ?? []).map((e) => e.requirement_id as string))]
  const { data: reqs } = reqIds.length
    ? await admin.from("requirements").select("id, ref, text, weight, sort_order").in("id", reqIds)
    : { data: [] as Array<{ id: string; ref: string; text: string; weight: string; sort_order: number }> }
  const reqById = new Map((reqs ?? []).map((r) => [r.id as string, r]))

  const { data: artifact } = await admin
    .from("round_artifacts")
    .select("kind, content, recording_path, recording_deleted_at, verified_at")
    .eq("round_id", roundId)
    .maybeSingle()

  const { data: job } = await admin
    .from("ingestion_jobs")
    .select("status, error_detail")
    .eq("round_id", roundId)
    .eq("kind", "transcribe")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const content = (artifact?.content ?? {}) as {
    segments?: Array<{ speaker: number; start?: number; text?: string }>
    candidateSpeaker?: number | null
  }
  const segments = content.segments ?? []
  const speakers = [...new Set(segments.map((s) => s.speaker))].sort((a, b) => a - b)

  const consentStatus = round.capture_consent_status as string
  const transcript = artifact?.kind === "transcript" ? artifact : null

  let state: CaptureState
  if (consentStatus !== "granted") state = "no_consent"
  else if (transcript?.verified_at) state = "verified"
  else if (segments.length > 0) state = "needs_check"
  else if (job?.status === "failed") state = "failed"
  else if (job?.status === "queued" || job?.status === "running") state = "transcribing"
  else if (transcript?.recording_path) state = "uploaded"
  else state = "ready"

  return {
    state,
    consentStatus,
    hasRecording: Boolean(transcript?.recording_path),
    audioDeleted: Boolean(transcript?.recording_deleted_at),
    uploadedBytes: null,
    segmentCount: segments.length,
    speakers,
    candidateSpeaker: content.candidateSpeaker ?? null,
    verifiedAt: (transcript?.verified_at as string | null) ?? null,
    jobStatus: (job?.status as string | null) ?? null,
    jobError: (job?.error_detail as string | null) ?? null,
    requestedAt: (round.capture_requested_at as string | null) ?? null,
    remindedAt: (round.capture_reminded_at as string | null) ?? null,
    answeredAt: consentStatus === "pending" ? null : ((round.capture_consent_at as string | null) ?? null),
    lines:
      transcript && segments.length > 0
        ? segments.slice(0, LINE_CAP).map((seg) => ({
            speaker: seg.speaker,
            start: Number(seg.start ?? 0),
            text: String(seg.text ?? ""),
          }))
        : [],
    quotes: (evidence ?? [])
      .map((e) => {
        const r = reqById.get(e.requirement_id as string)
        return {
          ref: (r?.ref as string) ?? "",
          requirement: (r?.text as string) ?? "",
          weight: (r?.weight as string) ?? "",
          strength: e.strength as string,
          quote: e.quote as string,
          source: (e.source_cite as string) ?? "",
          order: Number(r?.sort_order ?? 0),
        }
      })
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...q }) => q),
  }
}

/** Not exported to any route yet — the read path lands with transcription. */
export async function assertRecordingsBucketExists(): Promise<boolean> {
  const admin = agencyAdmin()
  const { data, error } = await admin.storage.getBucket(RECORDING_BUCKET)
  if (error) throw new AgencyAccessError(error.message)
  return Boolean(data && data.public === false)
}
