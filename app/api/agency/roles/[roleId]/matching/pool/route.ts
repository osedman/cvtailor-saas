/**
 * The consumer pool for one role — everyone who may be shown, with their arc
 * and a relevance signal, not only those a scan accepted.
 *
 * Recruiter-scoped. Viewers may read it; inviting is a separate write.
 */
import { NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { listConsumerPool } from "@/lib/agency/consumer-pool"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 60

async function GET_handler(_req: Request, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    return NextResponse.json(await listConsumerPool(auth.ctx, roleId))
  } catch (e) {
    if (e instanceof AgencyAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/agency/roles/[roleId]/matching/pool", "GET", GET_handler)
