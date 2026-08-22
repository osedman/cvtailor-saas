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
  RTW_EVIDENCE,
  RTW_SPONSORSHIP,
  type RtwEvidence,
  type RtwSponsorship,
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

    const rtwEvidence = body?.rtwEvidence
    if (typeof rtwEvidence !== "string" || !RTW_EVIDENCE.includes(rtwEvidence as RtwEvidence)) {
      return NextResponse.json(
        { error: `rtwEvidence must be one of: ${RTW_EVIDENCE.join(", ")}.` },
        { status: 400 }
      )
    }

    // Sponsorship is optional on the wire so a caller recording evidence need
    // not restate an answer the candidate has not given. Absent means
    // 'not_asked', which is a real state and not a null.
    const rtwSponsorship = body?.rtwSponsorship ?? "not_asked"
    if (
      typeof rtwSponsorship !== "string" ||
      !RTW_SPONSORSHIP.includes(rtwSponsorship as RtwSponsorship)
    ) {
      return NextResponse.json(
        { error: `rtwSponsorship must be one of: ${RTW_SPONSORSHIP.join(", ")}.` },
        { status: 400 }
      )
    }

    const view = await setCandidateCompliance(a.ctx, candidateId, {
      rtwEvidence: rtwEvidence as RtwEvidence,
      rtwNote: typeof body?.rtwNote === "string" ? body.rtwNote : "",
      // "" and null both mean "none recorded"; the lib rejects a malformed one
      // rather than coercing it.
      rtwExpiresOn: typeof body?.rtwExpiresOn === "string" ? body.rtwExpiresOn : null,
      rtwSponsorship: rtwSponsorship as RtwSponsorship,
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
