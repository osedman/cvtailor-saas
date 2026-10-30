import { errorMessage } from "@/lib/error-message"
/**
 * The living dossier for one candidate on one role.
 *
 * Recruiter-side only. A dossier contains the parse, the recruiter's overrides
 * and their reasons — their working, not the disclosed subset a client sees in
 * a submission snapshot. See the header of lib/agency/dossier for why this is
 * not on the hiring-manager surface despite the frame being drawn there.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { buildDossier } from "@/lib/agency/dossier"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 20

async function GET_handler(
  _req: NextRequest,
  { params }: { params: Promise<{ roleId: string; candidateId: string }> }
) {
  try {
    const { roleId, candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    return NextResponse.json({ dossier: await buildDossier(auth.ctx, roleId, candidateId) })
  } catch (e) {
    if (e instanceof AgencyAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: errorMessage(e) },
      { status: 500 }
    )
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/agency/roles/[roleId]/candidates/[candidateId]/dossier", "GET", GET_handler)
