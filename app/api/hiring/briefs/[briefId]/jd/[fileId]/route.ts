/**
 * Download a brief's job description, the client's side.
 *
 * GET → the bytes, Content-Type as stored, Content-Disposition attachment.
 *       404 when the file is not on that brief.
 *
 * Scoped exactly as the brief's own reads: to the caller's contact ids
 * (getBriefForClient), which also keeps drafts out of reach. Reads are not
 * audited, as nowhere else in the product.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { AgencyAccessError } from "@/lib/agency/db"
import { getBriefForClient } from "@/lib/agency/search-briefs"
import { readBriefJd, attachmentHeaders } from "@/lib/agency/brief-files"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30
type P = { params: Promise<{ briefId: string; fileId: string }> }

function authFail(failure: HiringFailure) {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" }, { status: failure === "unauthenticated" ? 401 : 403 })
}
function fail(error: unknown) {
  if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
}

async function GET_handler(_req: NextRequest, { params }: P) {
  try {
    const { briefId, fileId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)

    const brief = await getBriefForClient(auth.ctx, briefId)
    if (!brief) return NextResponse.json({ error: "No brief was sent to you at this address" }, { status: 404 })

    const found = await readBriefJd(brief.id, fileId)
    if (!found) return NextResponse.json({ error: "No such file on this brief" }, { status: 404 })
    return new NextResponse(found.blob, { status: 200, headers: attachmentHeaders(found.file) })
  } catch (error) {
    return fail(error)
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/hiring/briefs/[briefId]/jd/[fileId]", "GET", GET_handler)
