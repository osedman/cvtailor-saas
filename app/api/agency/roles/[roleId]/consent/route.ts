/**
 * Ask a candidate whether this interview may be recorded.
 *
 * Separate from booking on purpose: a recruiter may book a round and only later
 * decide to ask. This mints the candidate's link and emails it. It cannot
 * answer the question — only the candidate's own link can do that.
 *
 * Copy: docs/CONSENT-COPY-DRAFT.md §2, near-verbatim. If you are editing the
 * wording here, edit it there too, or the reviewed version and the sent version
 * drift apart.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { requestCapture } from "@/lib/agency/consent"
import { sendEmail } from "@/lib/email"
import { getAppOrigin } from "@/lib/site-url"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 20

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function whenLine(iso: string | null): string {
  if (!iso) return "shortly"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "shortly"
  return d.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * The ask. Two things in here are load-bearing rather than stylistic:
 *   - "either answer is completely fine" sits in the opening, not the footer.
 *     If the first thing read implies a right answer, consent is not freely
 *     given and the lawful basis fails.
 *   - "the people interviewing you are not told what you chose" is a promise
 *     the code keeps: getHiringDashboard omits capture_consent_* and a test
 *     fails the build if that ever changes.
 * Both buttons carry equal visual weight for the same reason.
 */
function consentEmailHtml(opts: {
  firstName: string
  agencyName: string
  company: string
  roleTitle: string
  when: string
  retentionDays: number
  yesUrl: string
  noUrl: string
}): string {
  const name = opts.firstName ? `, ${escapeHtml(opts.firstName)}` : ""
  return `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#1e1813;padding:32px 28px;">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#dc4f33;font-weight:700;">Before your interview</p>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">Would you like this interview recorded${name}?</h1>

  <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(opts.agencyName)} has arranged your ${escapeHtml(opts.roleTitle)} interview with ${escapeHtml(opts.company)} on ${escapeHtml(opts.when)}. Before it happens they need one answer from you, and either answer is completely fine.</p>

  <p style="margin:0 0 16px;line-height:1.6;"><strong>What recording would mean.</strong> The audio of the call is transcribed. Your recruiter uses the transcript to attach what you actually said to the requirements of the role, in your words, quoted, rather than from their memory of the conversation.</p>

  <p style="margin:0 0 16px;line-height:1.6;"><strong>What it does not mean.</strong> Nothing decides anything about you automatically. No software scores how you sound, how confident you seem, or how you look. Every judgement in this process is made by a person, and you can ask to see what was recorded against your name.</p>

  <p style="margin:0 0 20px;line-height:1.6;"><strong>If you would rather not.</strong> Say no and the interview happens exactly the same way, at the same time, with the same people. The people you meet write up their notes afterwards, as they would have done anyway. Declining will not be held against you, and the people interviewing you are not told what you chose.</p>

  <p style="margin:0 0 20px;">
    <a href="${opts.yesUrl}" style="display:inline-block;background:#1e1813;color:#fffdfa;border-radius:8px;padding:12px 20px;font-weight:600;text-decoration:none;margin-right:8px;">Yes, record it</a>
    <a href="${opts.noUrl}" style="display:inline-block;background:#fffdfa;color:#1e1813;border:1px solid #ded4c1;border-radius:8px;padding:12px 20px;font-weight:600;text-decoration:none;">No, don't record it</a>
  </p>

  <p style="margin:0 0 16px;line-height:1.6;">You can change your mind at any point, before the call, during it, or afterwards. If you withdraw during or after, the recording is deleted.</p>

  <p style="margin:0 0 16px;line-height:1.6;font-size:13px;color:#4e463d;">The audio is deleted as soon as the transcript is checked. The transcript is kept for ${opts.retentionDays} days after the role closes and is then deleted with the rest of your data. ${escapeHtml(opts.company)} sees the evidence your recruiter draws from it, not the recording or the full transcript.</p>

  <p style="margin:24px 0 0;font-size:12px;color:#7a7266;line-height:1.5;">Sent on behalf of ${escapeHtml(opts.agencyName)}, who is responsible for your data. Tailr processes it on their behalf. You can reply to this email to reach your recruiter directly.</p>
</div>`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
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

    const body = (await req.json().catch(() => ({}))) as { roundId?: unknown }
    const roundId = typeof body.roundId === "string" ? body.roundId : ""
    if (!roundId) return NextResponse.json({ error: "roundId is required" }, { status: 400 })

    const request = await requestCapture(auth.ctx, roundId)
    const base = `${getAppOrigin()}/consent/${request.rawToken}`

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

    const sent = await sendEmail({
      to: request.candidateEmail,
      subject: `Your interview with ${auth.ctx.agencyName || "our client"} — one thing to decide first`,
      replyTo: undefined,
      html: consentEmailHtml({
        firstName: request.candidateName.split(/\s+/)[0] ?? "",
        agencyName: auth.ctx.agencyName || "Your recruiter",
        company: "the employer",
        roleTitle: request.roleTitle,
        when: whenLine(request.scheduledAt),
        retentionDays: request.retentionDays,
        yesUrl: `${base}?a=yes`,
        noUrl: `${base}?a=no`,
      }),
    })

    // The link is valid whether or not the mail landed; never log the address.
    return NextResponse.json({ ok: true, emailed: sent.sent, url: base })
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
