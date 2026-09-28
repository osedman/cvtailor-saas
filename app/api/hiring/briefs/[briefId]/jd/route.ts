/**
 * Attach a job description to a brief, the client's side.
 *
 * POST multipart, field "file" (PDF, DOCX or TXT, up to 10 MB)
 *      → { file: { fileId, name, sizeBytes, contentType, uploadedBySide, createdAt } }
 *
 * Scoped exactly as the brief's own reads: to the caller's contact ids
 * (getBriefForClient), never to the id in the URL alone. The client uploads
 * as part of an amendment, so the condition is the amendment's — the brief
 * is live and not approved by both sides. Uploading changes no version by
 * itself; the review form puts the fileId into config.jdFileId and the
 * PATCH writes the new version signed by the client.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { AgencyAccessError } from "@/lib/agency/db"
import { getBriefForClient } from "@/lib/agency/search-briefs"
import { storeBriefJd, briefJdContentType, BRIEF_JD_LIMIT_BYTES } from "@/lib/agency/brief-files"
import { errorMessage } from "@/lib/error-message"
import { checkRateLimit } from "@/lib/rate-limit"

export const maxDuration = 60
type P = { params: Promise<{ briefId: string }> }

function authFail(failure: HiringFailure) {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" }, { status: failure === "unauthenticated" ? 401 : 403 })
}
function fail(error: unknown) {
  if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
}

export async function POST(req: NextRequest, { params }: P) {
  try {
    const { briefId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const limited = await checkRateLimit(auth.ctx.userId, "upload")
    if (limited) return limited

    const brief = await getBriefForClient(auth.ctx, briefId)
    if (!brief) return NextResponse.json({ error: "No brief was sent to you at this address" }, { status: 404 })
    if (brief.state === "approved") {
      return NextResponse.json({ error: "this brief is approved by both sides — ask your recruiter to re-open it" }, { status: 400 })
    }

    if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      return NextResponse.json({ error: "Send the file as multipart/form-data, field \"file\"" }, { status: 400 })
    }
    const form = await req.formData()
    const uploaded = form.get("file")
    if (!(uploaded instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (uploaded.size === 0) return NextResponse.json({ error: "That file is empty" }, { status: 400 })
    if (uploaded.size > BRIEF_JD_LIMIT_BYTES) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 })
    const contentType = briefJdContentType(uploaded.name, uploaded.type)
    if (!contentType) return NextResponse.json({ error: "Upload a PDF, DOCX, or TXT file." }, { status: 400 })

    const file = await storeBriefJd({
      ctx: { side: "client", agencyId: brief.agencyId, userId: auth.ctx.userId },
      briefId: brief.id,
      file: { buffer: Buffer.from(await uploaded.arrayBuffer()), name: uploaded.name, contentType },
    })
    return NextResponse.json({ file })
  } catch (error) {
    return fail(error)
  }
}
