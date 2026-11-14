/**
 * Ask a candidate whether this interview may be recorded.
 *
 * Separate from booking on purpose: a recruiter may book a round and only later
 * decide to ask. This mints the candidate's link and emails it. It cannot
 * answer the question — only the candidate's own link can do that.
 *
 * Copy: lib/agency/candidate-mail.ts ("recording_request"), frame 47 §B email 1,
 * cleared 14 Nov 2026. Asking again sends a new link and the earlier ones keep
 * working (agency.consent_links).
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, agencyAdmin, requireAgencyContext } from "@/lib/agency/db"
import { requestCapture } from "@/lib/agency/consent"
import { loadCandidateMail, sendCandidateMail, whenLine } from "@/lib/agency/candidate-mail"
import { getAppOrigin } from "@/lib/site-url"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 20

async function POST_handler(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { roundId?: unknown; send?: unknown }
    const roundId = typeof body.roundId === "string" ? body.roundId : ""
    if (!roundId) return NextResponse.json({ error: "roundId is required" }, { status: 400 })

    const request = await requestCapture(auth.ctx, roundId)
    const base = `${getAppOrigin()}/consent/${request.rawToken}`

    // "Copy their link" (frame 47 §A card 2): a working link for the recruiter
    // to send themselves, no email. It still counts as asking.
    if (body.send === false) {
      return NextResponse.json({ ok: true, emailed: false, resend: request.resend, url: base })
    }

    // No candidate email on file (redacted CVs exist). Hand the recruiter the
    // link rather than failing: the ask still has to reach a real person.
    if (!request.candidateEmail) {
      return NextResponse.json({
        ok: true,
        emailed: false,
        reason: "no_email_on_file",
        url: base,
      })
    }

    // From the agency, naming the employer, replies to the agency, with a
    // fresh rights link (frame 47 §B, email 1).
    const admin = agencyAdmin()
    const mailCtx = await loadCandidateMail(admin, request.candidateId)
    let emailed = false
    if (mailCtx) {
      if (request.company) mailCtx.company = request.company
      emailed = await sendCandidateMail(admin, mailCtx, {
        kind: "recording_request",
        when: whenLine(request.scheduledAt),
        consentUrl: base,
      })
    }

    // The link is valid whether or not the mail landed; never log the address.
    return NextResponse.json({ ok: true, emailed, resend: request.resend, url: base })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const POST = withTiming("/api/agency/roles/[roleId]/consent", "POST", POST_handler)
