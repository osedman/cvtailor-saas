/**
 * Invite one matched person to apply. Audited. Their card on /found says a
 * recruiter asked; nothing else changes hands until they apply.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { inviteMatchedPerson } from "@/lib/agency/matched-people"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

export async function POST(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return NextResponse.json({ error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" }, { status: auth.failure === "unauthenticated" ? 401 : 403 })
    const body = await req.json().catch(() => ({}))
    const recommendationId = typeof body?.recommendationId === "string" ? body.recommendationId : ""
    if (!recommendationId) return NextResponse.json({ error: "recommendationId is required" }, { status: 400 })
    const person = await inviteMatchedPerson(auth.ctx, roleId, recommendationId)
    return NextResponse.json({ person })
  } catch (error) {
    if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
