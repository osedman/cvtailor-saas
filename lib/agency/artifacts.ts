/**
 * What a round produced.
 *
 * `round_artifacts.kind` is 'transcript' or 'debrief', and that is the whole
 * reason declining a recording costs a candidate nothing: a declined round
 * still produces an artifact, so "no artifact, no progression" can be enforced
 * without ever pressuring anyone into being recorded (AGENCIES_SCHEMA.md §5.5).
 *
 * Only the debrief half is built. Transcripts need capture, capture needs
 * consent copy that has cleared a lawyer and a DPIA, and neither has happened
 * — so there is no function here that creates a 'transcript', and the storage
 * bucket for recordings does not exist yet either.
 *
 * A debrief is structured, not a text box: the person who ran the interview
 * answers the round's focus areas, one at a time. That is what makes it usable
 * as evidence later rather than a paragraph nobody can attach to a requirement.
 */

import { agencyAdmin, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext, HiringContext } from "./types"

/**
 * Where interview recordings will live when capture ships. Deliberately NOT
 * `agency-cvs`: CVs are documents a candidate handed over, recordings are their
 * voice, and the two deserve separate buckets and separate policies.
 *
 * THE BUCKET DOES NOT EXIST YET. Nothing writes recordings, so the sweep below
 * never reaches storage. Create it in the migration that ships capture.
 */
export const RECORDING_BUCKET = "agency-recordings"

const MAX_ANSWER = 4000
const MAX_NOTES = 8000

export interface DebriefAnswer {
  /** Requirement ref ('R04') or library key ('L02') — keyed, never indexed.
   * Index keys break the moment a question is added; the same lesson the probe
   * questions learned on 7 Aug. */
  key: string
  question: string
  answer: string
}

export interface DebriefInput {
  roundId: string
  answers: DebriefAnswer[]
  notes?: string
}

function cap(s: string | undefined, max: number): string {
  return (s ?? "").trim().slice(0, max)
}

/**
 * Record what happened in a round that was not recorded.
 *
 * Accepts either context: the hiring manager ran the interview, the recruiter
 * owns the process, and both may legitimately be the one writing it up. The
 * artifact records which, so the provenance of every later quote is knowable.
 */
export async function recordDebrief(
  ctx: AgencyContext | HiringContext,
  input: DebriefInput
): Promise<{ artifactId: string }> {
  const admin = agencyAdmin()

  const { data: round, error } = await admin
    .from("interview_rounds")
    .select("id, agency_id, role_id, candidate_id, contact_id, status, capture_consent_status")
    .eq("id", input.roundId)
    .maybeSingle()
  if (error) throw error
  if (!round) throw new AgencyAccessError("round not found")

  // Authorisation differs by hat, and both are checked against the round.
  const isHiring = "links" in ctx
  if (isHiring) {
    const link = (ctx as HiringContext).links.find(
      (l) => l.contactId === (round.contact_id as string)
    )
    if (!link || link.agencyId !== round.agency_id) {
      throw new AgencyAccessError("round not found")
    }
  } else if ((ctx as AgencyContext).agencyId !== round.agency_id) {
    throw new AgencyAccessError("round not found in your agency")
  }

  const answers = (input.answers ?? [])
    .filter((a) => a && typeof a.key === "string" && a.key.length > 0 && a.key.length <= 10)
    .slice(0, 40)
    .map((a) => ({
      key: a.key,
      question: cap(a.question, 500),
      answer: cap(a.answer, MAX_ANSWER),
    }))

  const content = {
    answers,
    notes: cap(input.notes, MAX_NOTES),
    written_by: isHiring ? "hiring_manager" : "recruiter",
  }

  // One artifact per round (round_id is unique). Re-writing a debrief updates
  // it rather than failing — a write-up is edited, not versioned.
  const { data: existing } = await admin
    .from("round_artifacts")
    .select("id, kind")
    .eq("round_id", input.roundId)
    .maybeSingle()

  // A recorded round cannot also be written up as an unrecorded one. This was
  // unreachable until recordings existed: the update below filters on
  // kind='debrief', so against a transcript it would have matched no rows,
  // changed nothing, and still returned success.
  if (existing && existing.kind !== "debrief") {
    throw new AgencyAccessError(
      "this round has a recording; a debrief is for a round that was not recorded"
    )
  }

  let artifactId: string
  if (existing) {
    const { error: updateError } = await admin
      .from("round_artifacts")
      .update({ content })
      .eq("id", existing.id as string)
      .eq("kind", "debrief")
    if (updateError) throw updateError
    artifactId = existing.id as string
  } else {
    const { data: created, error: insertError } = await admin
      .from("round_artifacts")
      .insert({
        agency_id: round.agency_id as string,
        round_id: input.roundId,
        kind: "debrief",
        content,
        // A debrief never has a recording — the DB constraint
        // artifact_recording_iff_transcript enforces it too.
        engine_version: "debrief-1",
      })
      .select("id")
      .single()
    if (insertError) throw insertError
    artifactId = created.id as string
  }

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
    action: existing ? "debrief_updated" : "debrief_recorded",
    // Counts, not content: the write-up is evidence, not audit-log material.
    toValue: {
      round_id: input.roundId,
      artifact_id: artifactId,
      answered: answers.filter((a) => a.answer.length > 0).length,
      of: answers.length,
    },
  })

  return { artifactId }
}

export interface SweepableRecording {
  artifactId: string
  recordingPath: string
}

/**
 * Recordings whose transcript has been verified and whose audio is therefore
 * due for deletion.
 *
 * The promise made to every candidate is "the audio is deleted as soon as the
 * transcript is checked" (docs/CONSENT-COPY-DRAFT.md §2). This is the query
 * behind that sentence. It returns nothing today because nothing writes
 * transcripts yet, which is correct rather than broken.
 */
export async function listRecordingsDueForDeletion(limit = 200): Promise<SweepableRecording[]> {
  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("round_artifacts")
    .select("id, recording_path")
    .eq("kind", "transcript")
    .not("verified_at", "is", null)
    .is("recording_deleted_at", null)
    .not("recording_path", "is", null)
    .limit(limit)
  if (error) throw error
  return (data ?? [])
    .filter((r) => !!r.recording_path)
    .map((r) => ({ artifactId: r.id as string, recordingPath: r.recording_path as string }))
}

/**
 * Stamp the artifacts whose blobs are gone.
 *
 * Called ONLY after the storage delete succeeded. Stamping first would mean a
 * failed delete leaves audio on disk that the product believes it destroyed —
 * the one direction of that race we cannot accept, because the promise is in
 * writing to the person whose voice it is.
 */
export async function markRecordingsDeleted(artifactIds: string[]): Promise<number> {
  if (artifactIds.length === 0) return 0
  const admin = agencyAdmin()
  const { data, error } = await admin
    .from("round_artifacts")
    .update({ recording_deleted_at: new Date().toISOString() })
    .in("id", artifactIds)
    .is("recording_deleted_at", null)
    .select("id")
  if (error) throw error
  return (data ?? []).length
}
