/**
 * Where each shortlisted candidate stands before submission (frame 47 §E):
 * not told, told, asked and waiting, or answered. Recruiter-only; the hiring
 * manager's views never read it.
 */

import { NextRequest, NextResponse } from "next/server"
import { agencyAdmin, requireAgencyContext } from "@/lib/agency/db"
import { putForwardRows } from "@/lib/agency/put-forward"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

async function GET_handler(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    const rows = await putForwardRows(agencyAdmin(), auth.ctx.agencyId, roleId)
    return NextResponse.json({ rows })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export const GET = withTiming("/api/agency/roles/[roleId]/put-forward", "GET", GET_handler)
