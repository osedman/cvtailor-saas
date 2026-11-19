/**
 * "Tell her and ask now" / "Send a reminder now" (frame 47 §E).
 *
 * Sends the put-forward ask to one candidate. When it is their first contact
 * the cleared Art 14 notice goes inline and their day-7 notice is closed by
 * it. A recruiter can ask; only the candidate can answer, on their rights page.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, agencyAdmin, assertWriter, requireAgencyContext } from "@/lib/agency/db"
import { askToPutForward } from "@/lib/agency/put-forward"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 20

const MESSAGES = {
  already_answered: "They have already answered.",
  no_email: "There is no email address on file for this candidate.",
  failed: "The email could not be sent. Try again in a minute.",
} as const

async function POST_handler(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    assertWriter(auth.ctx)
    const admin = agencyAdmin()
    const { data: candidate } = await admin
      .from("candidates")
      .select("id")
      .eq("id", candidateId)
      .eq("agency_id", auth.ctx.agencyId)
      .maybeSingle()
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })

    const outcome = await askToPutForward(admin, candidateId, auth.ctx.userId)
    if (outcome === "sent") return NextResponse.json({ ok: true, asked_at: new Date().toISOString() })
    if (outcome === "not_found") return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
    return NextResponse.json({ error: MESSAGES[outcome], reason: outcome }, { status: 409 })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export const POST = withTiming("/api/agency/candidates/[candidateId]/put-forward", "POST", POST_handler)
