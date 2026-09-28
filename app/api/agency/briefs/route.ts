/**
 * The recruiter's briefs — the terms of a search, agreed with a client.
 *
 * GET  → every live brief with its state and whose move it is
 * POST { contactId, title, config?, fromBriefId? } → a new UNSENT draft
 *
 * Reads go through the service role too: the list needs the current
 * version's signatures, and joining those under RLS would mean granting
 * the browser a read it never otherwise needs. See lib/agency/search-briefs.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { createBrief, listBriefs } from "@/lib/agency/search-briefs"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" }, { status: failure === "unauthenticated" ? 401 : 403 })
}

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    return NextResponse.json({ briefs: await listBriefs(auth.ctx) })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const contactId = typeof body.contactId === "string" ? body.contactId : ""
    if (!contactId) return NextResponse.json({ error: "contactId is required — a brief is addressed to somebody" }, { status: 400 })
    const result = await createBrief(auth.ctx, {
      contactId,
      title: typeof body.title === "string" ? body.title : "",
      config: body.config,
      fromBriefId: typeof body.fromBriefId === "string" ? body.fromBriefId : null,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
