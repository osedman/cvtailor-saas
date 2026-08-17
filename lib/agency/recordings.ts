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

/** Not exported to any route yet — the read path lands with transcription. */
export async function assertRecordingsBucketExists(): Promise<boolean> {
  const admin = agencyAdmin()
  const { data, error } = await admin.storage.getBucket(RECORDING_BUCKET)
  if (error) throw new AgencyAccessError(error.message)
  return Boolean(data && data.public === false)
}
