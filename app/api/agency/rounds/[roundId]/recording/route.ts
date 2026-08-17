/**
 * Interview audio upload — two steps, because the bytes do not come through
 * here.
 *
 *   POST  → mint a signed upload ticket (nothing is written)
 *   PUT   → confirm the upload; the artifact row is created here
 *
 * The browser PUTs the file straight to storage with the ticket. The bucket
 * carries no policies, so a ticket minted by these guards is the only way in
 * — the consent check cannot be routed around.
 *
 * ⚠ GATED: no real candidate until the DPIA and the consent-copy review are
 * done. Synthetic audio only.
 *
 * Status mapping:
 *   404 not_found        — no such round in your agency, or the blob is not
 *                          where the confirm says it is
 *   403 no_consent       — the candidate has not granted capture consent.
 *                          THE gate; see lib/agency/recordings.ts
 *   409 already_recorded — this round already has audio
 *   409 debriefed        — the round was written up as unrecorded
 *   415 bad_type         — not an audio type the bucket accepts
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext, AgencyAccessError } from "@/lib/agency/db"
import { createUploadTicket, confirmUpload, ALLOWED_AUDIO } from "@/lib/agency/recordings"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

const STATUS: Record<string, number> = {
  not_found: 404,
  no_consent: 403,
  already_recorded: 409,
  debriefed: 409,
  bad_type: 415,
}

const COPY: Record<string, string> = {
  not_found: "That round does not exist.",
  no_consent:
    "This candidate has not agreed to the interview being recorded, so no recording can be uploaded for it. Their decision is theirs to change, on their own link.",
  already_recorded: "This round already has a recording.",
  debriefed:
    "This round was written up as an unrecorded interview. A round holds either a recording or a write-up, not both.",
  bad_type: `That file type is not accepted. Audio only: ${ALLOWED_AUDIO.join(", ")}.`,
}

function refuse(reason: string) {
  return NextResponse.json({ error: COPY[reason], reason }, { status: STATUS[reason] ?? 500 })
}

async function withContext<T>(fn: (ctx: Awaited<ReturnType<typeof requireAgencyContext>>) => Promise<T>) {
  const ctx = await requireAgencyContext()
  return fn(ctx)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  try {
    const { roundId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency access" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const { mimeType } = await req.json()
    if (typeof mimeType !== "string") return refuse("bad_type")

    const result = await createUploadTicket(auth.ctx, roundId, mimeType)
    if (!result.ok) return refuse(result.reason)
    return NextResponse.json(result.ticket)
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
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency access" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const { path } = await req.json()
    if (typeof path !== "string" || !path) return refuse("not_found")

    const result = await confirmUpload(auth.ctx, roundId, path)
    if (!result.ok) return refuse(result.reason)
    return NextResponse.json({ artifactId: result.artifactId })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: errorMessage(error) }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
