/**
 * Right-to-work and logistics on a candidate.
 *
 * GET reads (user-scoped table has SELECT, but the lib read asserts tenancy
 * the same way the write does — one boundary, not two). PUT writes through
 * the audit-coupled path in lib/agency/compliance: the table has no
 * authenticated write grants, so this route IS the only way the row changes,
 * and the audit row rides the same operation.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext, AgencyAccessError } from "@/lib/agency/db"
import {
  getCandidateCompliance,
  setCandidateCompliance,
  RTW_STATUSES,
  type RtwStatus,
} from "@/lib/agency/compliance"
import { errorMessage } from "@/lib/error-message"

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const a = await auth()
    if (!a.ok) return a.response
    const view = await getCandidateCompliance(a.ctx, candidateId)
    if (!view) return NextResponse.json({ error: "Candidate not found." }, { status: 404 })
    return NextResponse.json(view)
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const a = await auth()
    if (!a.ok) return a.response

    const body = await req.json()
    const rtwStatus = body?.rtwStatus
    if (typeof rtwStatus !== "string" || !RTW_STATUSES.includes(rtwStatus as RtwStatus)) {
      return NextResponse.json(
        { error: `rtwStatus must be one of: ${RTW_STATUSES.join(", ")}.` },
        { status: 400 }
      )
    }

    const view = await setCandidateCompliance(a.ctx, candidateId, {
      rtwStatus: rtwStatus as RtwStatus,
      rtwNote: typeof body?.rtwNote === "string" ? body.rtwNote : "",
      noticePeriod: typeof body?.noticePeriod === "string" ? body.noticePeriod : "",
    })
    return NextResponse.json(view)
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: errorMessage(error) }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
