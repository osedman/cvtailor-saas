/**
 * Download a brief's job description, the recruiter's side.
 *
 * GET → the bytes, Content-Type as stored, Content-Disposition attachment.
 *       404 when the file is not on that brief.
 *
 * Scope: the brief must be on the caller's agency and not discarded
 * (getBriefForRecruiter answers null otherwise). Any member may read — a
 * viewer reads the brief itself the same way. Reads are not audited, as
 * nowhere else in the product.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { getBriefForRecruiter } from "@/lib/agency/search-briefs"
import { readBriefJd, attachmentHeaders } from "@/lib/agency/brief-files"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30
type P = { params: Promise<{ briefId: string; fileId: string }> }

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" }, { status: failure === "unauthenticated" ? 401 : 403 })
}
function fail(error: unknown) {
  if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
}

export async function GET(_req: NextRequest, { params }: P) {
  try {
    const { briefId, fileId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const brief = await getBriefForRecruiter(auth.ctx, briefId)
    if (!brief) return NextResponse.json({ error: "No such brief on this agency" }, { status: 404 })

    const found = await readBriefJd(brief.id, fileId)
    if (!found) return NextResponse.json({ error: "No such file on this brief" }, { status: 404 })
    return new NextResponse(found.blob, { status: 200, headers: attachmentHeaders(found.file) })
  } catch (error) {
    return fail(error)
  }
}
