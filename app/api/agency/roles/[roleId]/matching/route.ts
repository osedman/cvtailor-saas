/**
 * Publish a role for quiet matching, pause it, or read where it stands.
 *
 * What the recruiter gets back is settings plus the bucketed count — never a
 * person, never a number. The response shape is the disclosure boundary: if a
 * field naming or counting individuals ever appears here, §5.3 has been
 * broken, not bent.
 *
 * The scan itself NEVER runs inside this request. Publishing queues an
 * ingestion_jobs row and hands it to `after()`, so the recruiter's response
 * returns immediately and a crashed process leaves a queued row for the cron
 * to sweep rather than a scan that silently never happened.
 */

import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { getMatchingStatus, pauseMatching, publishForMatching } from "@/lib/agency/matching"
import { runMatchScan } from "@/lib/matching/scan"
import { checkRateLimit } from "@/lib/rate-limit"

export const maxDuration = 30

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const status = await getMatchingStatus(auth.db, roleId)
    return NextResponse.json({ matching: status })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Body: { enabled: true, minScore: number } to publish · { enabled: false } to pause. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    // Publishing fans out into model calls; one recruiter thrashing the
    // switch is the load worth bounding.
    const limited = await checkRateLimit(auth.ctx.userId, "auth")
    if (limited) return limited

    const body = (await req.json().catch(() => null)) as {
      enabled?: unknown
      minScore?: unknown
    } | null
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 })
    }

    if (!body.enabled) {
      await pauseMatching(auth.ctx, roleId)
      const status = await getMatchingStatus(auth.db, roleId)
      return NextResponse.json({ matching: status })
    }

    if (typeof body.minScore !== "number") {
      return NextResponse.json({ error: "minScore is required to publish" }, { status: 400 })
    }

    const result = await publishForMatching(auth.ctx, roleId, body.minScore)

    if (result.queuedJobId) {
      const jobId = result.queuedJobId
      // After the response is sent. The claim inside runMatchScan means the
      // cron and this runner can both try without double-scanning.
      after(async () => {
        try {
          await runMatchScan(roleId, jobId)
        } catch {
          /* recorded on the job row; the cron retries nothing that succeeded */
        }
      })
    }

    const { queuedJobId, ...status } = result
    return NextResponse.json({ matching: status })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    const msg = error instanceof Error ? error.message : String(error)
    const status = /not found|closed role|parse the role|minScore/.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
