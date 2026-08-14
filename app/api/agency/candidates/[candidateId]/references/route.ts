/**
 * References for one candidate — the recruiter's side.
 *
 * GET   → who has been asked and where each stands
 * POST  { refereeName, refereeEmail, relationship? } → record a referee
 * PATCH { referenceId } → send (or chase) the request, WITH the fair-processing
 *         notice in the same email, because a referee never asked to be here.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { addReferee, listReferences, requestReference } from "@/lib/agency/references"
import { sendEmail } from "@/lib/email"
import { getAppOrigin } from "@/lib/site-url"

export const maxDuration = 20

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * The ask and the notice are one email on purpose. A separate "by the way, we
 * hold your data" message would arrive after the request, which is the wrong
 * order for someone who never volunteered for any of this.
 */
function refereeEmailHtml(o: {
  refereeName: string
  candidateName: string
  agencyName: string
  url: string
  isChase: boolean
}): string {
  return `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#1e1813;padding:32px 28px;">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#dc4f33;font-weight:700;">${o.isChase ? "A gentle reminder" : "A reference request"}</p>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${esc(o.candidateName)} gave your name${o.refereeName ? `, ${esc(o.refereeName)}` : ""}</h1>
  <p style="margin:0 0 16px;line-height:1.6;">${esc(o.agencyName)} is supporting ${esc(o.candidateName)} with a job application, and they named you as someone who has worked with them. If you have a few minutes, your answers go to the recruiter exactly as you write them.</p>
  <p style="margin:0 0 20px;"><a href="${o.url}" style="display:inline-block;background:#1e1813;color:#fffdfa;border-radius:8px;padding:12px 20px;font-weight:600;text-decoration:none;">Give a reference</a></p>
  <p style="margin:0 0 16px;line-height:1.6;">You are under no obligation. There is a "prefer not to" option on that page, and choosing it tells us to stop asking.</p>
  <p style="margin:0 0 16px;line-height:1.6;font-size:13px;color:#4e463d;"><strong>What we hold about you.</strong> Your name, your email address and your relationship to ${esc(o.candidateName)} — given to us by them — plus whatever you choose to write. ${esc(o.agencyName)} is responsible for it and Tailr processes it on their behalf. It is kept with this application and deleted on the same schedule. You can ask to see it, correct it or have it deleted by replying to this email.</p>
  <p style="margin:24px 0 0;font-size:12px;color:#7a7266;line-height:1.5;">Sent on behalf of ${esc(o.agencyName)}. If you do not know ${esc(o.candidateName)}, reply and we will remove your details.</p>
</div>`
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const { candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json({ error: "Unauthorised" }, { status: auth.failure === "unauthenticated" ? 401 : 403 })
    }
    return NextResponse.json({ references: await listReferences(auth.ctx, candidateId) })
  } catch (e) {
    if (e instanceof AgencyAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const { candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json({ error: "Unauthorised" }, { status: auth.failure === "unauthenticated" ? 401 : 403 })
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const result = await addReferee(auth.ctx, {
      candidateId,
      refereeName: String(body.refereeName ?? ""),
      refereeEmail: String(body.refereeEmail ?? ""),
      relationship: typeof body.relationship === "string" ? body.relationship : undefined,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    if (e instanceof AgencyAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not add that referee" }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json({ error: "Unauthorised" }, { status: auth.failure === "unauthenticated" ? 401 : 403 })
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const referenceId = typeof body.referenceId === "string" ? body.referenceId : ""
    if (!referenceId) return NextResponse.json({ error: "referenceId is required" }, { status: 400 })

    const request = await requestReference(auth.ctx, referenceId)
    const url = `${getAppOrigin()}/reference/${request.rawToken}`
    const sent = await sendEmail({
      to: request.refereeEmail,
      subject: `${request.candidateName} gave your name as a reference`,
      html: refereeEmailHtml({
        refereeName: request.refereeName,
        candidateName: request.candidateName,
        agencyName: request.agencyName,
        url,
        isChase: request.isChase,
      }),
    })
    // Never log the referee's address; return the link once so a failed send
    // does not strand the request.
    return NextResponse.json({ ok: true, emailed: sent.sent, url })
  } catch (e) {
    if (e instanceof AgencyAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not send that request" }, { status: 500 })
  }
}
