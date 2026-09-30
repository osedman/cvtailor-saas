/**
 * Attach a job description to a brief, the recruiter's side.
 *
 * POST multipart, field "file" (PDF, DOCX or TXT, up to 10 MB)
 *      → { file: { fileId, name, sizeBytes, contentType, uploadedBySide, createdAt } }
 *
 * Uploading never changes a version by itself. The form puts the returned
 * fileId into config.jdFileId and the existing PATCH records it — as a draft
 * save or as an amendment, whichever the brief's state makes it — so a
 * replaced file is a new version both sides sign, exactly like any change.
 *
 * Scope: the brief must be on the caller's agency and not discarded
 * (getBriefForRecruiter answers null otherwise), and the caller must be a
 * writer. Only the two sides of a brief ever reach its file.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, assertWriter, requireAgencyContext } from "@/lib/agency/db"
import { getBriefForRecruiter } from "@/lib/agency/search-briefs"
import { storeBriefJd, briefJdContentType, BRIEF_JD_LIMIT_BYTES } from "@/lib/agency/brief-files"
import { errorMessage } from "@/lib/error-message"
import { checkRateLimit } from "@/lib/rate-limit"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 60
type P = { params: Promise<{ briefId: string }> }

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" }, { status: failure === "unauthenticated" ? 401 : 403 })
}
function fail(error: unknown) {
  if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
}

async function POST_handler(req: NextRequest, { params }: P) {
  try {
    const { briefId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    assertWriter(auth.ctx)
    const limited = await checkRateLimit(auth.ctx.userId, "upload")
    if (limited) return limited

    const brief = await getBriefForRecruiter(auth.ctx, briefId)
    if (!brief) return NextResponse.json({ error: "No such brief on this agency" }, { status: 404 })

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
      ctx: { side: "recruiter", agencyId: auth.ctx.agencyId, userId: auth.ctx.userId },
      briefId: brief.id,
      file: { buffer: Buffer.from(await uploaded.arrayBuffer()), name: uploaded.name, contentType },
    })
    return NextResponse.json({ file })
  } catch (error) {
    return fail(error)
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const POST = withTiming("/api/agency/briefs/[briefId]/jd", "POST", POST_handler)
