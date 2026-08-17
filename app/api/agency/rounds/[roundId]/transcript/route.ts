/**
 * Transcription: ask for one, and check the one you got.
 *
 *   POST → queue the round for transcription (the cron runs it)
 *   PUT  → verify the transcript and name the candidate's speaker
 *
 * ⚠ GATED. No real candidate until the DPIA and consent-copy review are
 * done, and no real transcription vendor is wired in — see
 * lib/agency/transcription.ts.
 *
 * PUT IS THE CONSEQUENTIAL ONE. Verifying stamps verified_at, which is what
 * releases the audio to the deletion sweep. It is deliberately not
 * automatic: the promise to the candidate is that a person checked the
 * transcript, and the only thing that makes that true is a person doing it.
 * It also carries `candidateSpeaker`, because only the candidate's own words
 * may become the candidate's evidence, and diarization returns numbers, not
 * names.
 */

import { NextRequest, NextResponse, after } from "next/server"
import { requireAgencyContext, AgencyAccessError } from "@/lib/agency/db"
import { queueTranscription, verifyTranscript, runTranscription } from "@/lib/agency/transcription"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

const STATUS: Record<string, number> = {
  not_found: 404,
  no_recording: 409,
  already_queued: 409,
  already_done: 409,
  not_transcribed: 409,
  already_verified: 409,
  bad_speaker: 422,
}

const COPY: Record<string, string> = {
  not_found: "That round does not exist.",
  no_recording: "There is no recording on this round to transcribe.",
  already_queued: "This round is already waiting to be transcribed.",
  already_done: "This round's transcript is already settled.",
  not_transcribed: "This round has not been transcribed yet, so there is nothing to check.",
  already_verified: "This transcript has already been checked.",
  bad_speaker: "That speaker does not appear in this transcript.",
}

function refuse(reason: string) {
  return NextResponse.json({ error: COPY[reason], reason }, { status: STATUS[reason] ?? 500 })
}

async function auth() {
  const result = await requireAgencyContext()
  if (result.ok) return { ok: true as const, ctx: result.ctx }
  return {
    ok: false as const,
    response: NextResponse.json(
      { error: result.failure === "unauthenticated" ? "Unauthorised" : "No agency access" },
      { status: result.failure === "unauthenticated" ? 401 : 403 }
    ),
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params
    const a = await auth()
    if (!a.ok) return a.response

    const result = await queueTranscription(a.ctx, roundId)
    if (!result.ok) return refuse(result.reason)

    // Queue first, then run after the response — the same shape publish uses
    // for match scans. The row is written before this returns, so a process
    // that dies here loses nothing and the cron picks it up; and
    // runTranscription only acts on a job still 'queued', so the cron and
    // this runner cannot both transcribe the same audio.
    const jobId = result.jobId
    after(async () => {
      try {
        await runTranscription(jobId)
      } catch {
        /* recorded on the job row; the cron retries what is still queued */
      }
    })

    return NextResponse.json({ jobId, status: "queued" })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: errorMessage(error) }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params
    const a = await auth()
    if (!a.ok) return a.response

    const { candidateSpeaker } = await req.json()
    if (!Number.isInteger(candidateSpeaker)) return refuse("bad_speaker")

    const result = await verifyTranscript(a.ctx, roundId, candidateSpeaker as number)
    if (!result.ok) return refuse(result.reason)
    // Said plainly: this response is the moment the audio becomes deletable.
    return NextResponse.json({ verified: true, audioScheduledForDeletion: true })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: errorMessage(error) }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
