/**
 * Client invites: the ONLY way a hiring manager gets access to an agency.
 *
 * POST   mints an invite for one of the caller's own contacts and emails the
 *        link to that contact's address.
 * DELETE revokes a live, un-accepted invite
 *        (?inviteId=<uuid>, or {"inviteId"} / {"invite_id"} in the body).
 *
 * Decision record: docs/AGENCIES_SCHEMA.md §5.4. There is no email-matching
 * self-claim anywhere in the system, so this route is the whole front door.
 * The raw token exists in memory here and nowhere else: only its sha256 is
 * stored (lib/agency/client-auth), it is emailed once, and it is returned in
 * the response once so a recruiter can hand the link over by another route if
 * the email does not land. It is never logged.
 *
 * Accepting the link still requires proving ownership of the invited mailbox
 * (acceptInvite compares the signed-in email against the contact's), so a
 * forwarded link buys the forwardee nothing.
 *
 * Already accepted? DELETE here refuses on purpose. That grant is live access
 * now, and DELETE /api/agency/clients/<contactId>/link is what takes it away.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import {
  INVITE_TTL_DAYS,
  createClientInvite,
  peekInvite,
  revokeClientInvite,
} from "@/lib/agency/client-auth"
import { sendEmail } from "@/lib/email"
import { getBusinessOrigin } from "@/lib/site-url"
import { anonRateLimitId, checkRateLimit } from "@/lib/rate-limit"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

/** Agency and company names are recruiter-typed free text going into an email
 * body. Escape them, or an apostrophe breaks the markup and a tag does worse. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Resend's error bodies quote the recipient back at you. Nothing with an @ in
 * it goes to the log, so a failed send cannot become a PII leak. */
function redactAddresses(text: string): string {
  return text.replace(/[^\s@<>"'()]+@[^\s@<>"'()]+/g, "[address]")
}

/** DELETE carries its target either way round: query string is the documented
 * form, a JSON body is accepted because half of every fetch wrapper sends one. */
async function readInviteId(req: NextRequest): Promise<string> {
  const fromQuery =
    req.nextUrl.searchParams.get("inviteId") ?? req.nextUrl.searchParams.get("invite_id")
  if (fromQuery) return fromQuery.trim()
  try {
    const body = await req.json()
    const raw = body?.inviteId ?? body?.invite_id
    return typeof raw === "string" ? raw.trim() : ""
  } catch {
    return ""
  }
}

/**
 * The invitation email.
 *
 * A real person is being handed access to a hiring workspace, so the copy says
 * who invited them, what the workspace is for, that the link expires, that it
 * works once, and which address they have to sign in with (acceptInvite
 * rejects any other, and without this line people reach for a personal inbox
 * and get bounced). Inline styles, brand colours, brand sans, no monospace.
 */
function inviteEmailHtml(opts: {
  agencyName: string
  company: string
  url: string
  expiresAt: string
}): string {
  const agency = escapeHtml(opts.agencyName || "Your recruitment partner")
  const company = escapeHtml(opts.company)
  const forCompany = company ? ` for ${company}` : ""
  const expiryLabel = new Date(opts.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f6f0;font-family:'Hanken Grotesk',-apple-system,Segoe UI,Arial,sans-serif;color:#1e1813;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1e1813;">tailr<span style="color:#dc4f33;">.</span></div>
<h1 style="font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;margin:24px 0 10px;">${agency} has invited you to their hiring workspace</h1>
<p style="font-size:16px;line-height:1.6;color:#595959;margin:0 0 22px;">They use Tailr to run the hiring they are doing${forCompany}, and they would like you in it with them, so the shortlists, the scheduling and the decisions all live in one place instead of scattered across email attachments. Here is what the workspace is for:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><td style="padding:14px 0;border-top:1px solid #eee6da;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc4f33;">Reviewing the shortlists they send</p><p style="margin:0;font-size:15px;line-height:1.6;color:#3b3b3b;">See who has been put forward for each role, with the evidence behind every recommendation.</p></td></tr>
<tr><td style="padding:14px 0;border-top:1px solid #eee6da;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc4f33;">Sharing when you can interview</p><p style="margin:0;font-size:15px;line-height:1.6;color:#3b3b3b;">Give the times that work for you, so rounds get booked without the back and forth.</p></td></tr>
<tr><td style="padding:14px 0;border-top:1px solid #eee6da;border-bottom:1px solid #eee6da;"><p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#dc4f33;">Running the interview rounds</p><p style="margin:0;font-size:15px;line-height:1.6;color:#3b3b3b;">Follow where each candidate has got to, and record what you decided after each round.</p></td></tr>
</table>
<div style="text-align:center;margin:28px 0 16px;"><a href="${opts.url}" style="display:inline-block;background:#dc4f33;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:10px;">Accept the invitation</a></div>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 6px;">Please sign in with this email address. The invitation is tied to it, so it will not work from another account.</p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 22px;">The link can be accepted once, and it expires on ${expiryLabel}, roughly ${INVITE_TTL_DAYS} days from now. If it has gone stale by the time you get to it, ask ${agency} to send a fresh one.</p>
<p style="font-size:13px;line-height:1.6;color:#8a8178;margin:0 0 22px;word-break:break-all;">If the button does not work, paste this into your browser:<br /><a href="${opts.url}" style="color:#b3341b;">${opts.url}</a></p>
<p style="font-size:15px;line-height:1.6;color:#595959;margin:0 0 24px;">Not expecting this? You can ignore the email and nothing happens. No account is created until you accept.</p>
<p style="font-size:15px;color:#1e1813;margin:0;">&mdash; The Tailr team</p>
<p style="font-size:12px;color:#a8a29e;margin:28px 0 0;line-height:1.5;">You are receiving this because ${agency} added you as a client contact in Tailr. Reply to this email to reach them directly.</p>
</div></body></html>`
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const { contactId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }
    if (!UUID_RE.test(contactId)) {
      return NextResponse.json({ error: "Invalid contact" }, { status: 400 })
    }

    // Authenticated, but it still sends mail to a third party on demand. Keyed
    // per CONTACT (not per recruiter) so "resend" cannot be turned into an
    // inbox bomb, and checked before any token is minted so a 429 leaves the
    // existing invite alone.
    const limited = await checkRateLimit(anonRateLimitId(`client-invite:${contactId}`), "auth")
    if (limited) return limited

    // Throws AgencyAccessError for a contact outside the caller's agency, with
    // the same message it uses for one that does not exist.
    const { inviteId, rawToken, expiresAt } = await createClientInvite(auth.ctx, contactId)
    // Business origin: /hiring is the client side of the agency product, and
    // the hiring manager signs in at the business door.
    const url = `${getBusinessOrigin()}/hiring/invite/${encodeURIComponent(rawToken)}`

    // The one read that gives us everything the email needs (agency name,
    // company, recipient address) without the route touching the database.
    const invite = await peekInvite(rawToken)

    // The recruiter's own address, so a reply lands with the person who
    // invited them rather than in Tailr's inbox. From stays WELCOME_FROM:
    // gettailr.com is the only verified Resend sender.
    const {
      data: { user },
    } = await auth.db.auth.getUser()
    const replyTo = typeof user?.email === "string" && user.email.includes("@") ? user.email : undefined

    let emailed = false
    if (invite?.contactEmail) {
      const agencyLabel = invite.agencyName || "Your recruitment partner"
      const sent = await sendEmail({
        to: invite.contactEmail,
        subject: `${agencyLabel} has invited you to their hiring workspace on Tailr`,
        html: inviteEmailHtml({
          agencyName: invite.agencyName,
          company: invite.company,
          url,
          expiresAt,
        }),
        ...(replyTo ? { replyTo } : {}),
      })
      emailed = sent.sent
      if (!sent.sent) {
        console.error(
          "[agency/clients/invite] delivery failed:",
          redactAddresses(sent.error ?? sent.skipped ?? "unknown")
        )
      }
    }

    // 201 either way: the invite is valid whether or not the mail went out, and
    // the recruiter has the link in hand to pass on themselves. The raw token
    // is in this body exactly once and is never recoverable afterwards.
    // camelCase to match the ClientAccessRow shape GET returns.
    return NextResponse.json(
      { invite: { id: inviteId, expiresAt, url }, emailed },
      { status: 201 }
    )
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    // contactId addresses the row the recruiter is looking at; the invite id
    // is what actually gets revoked, since a contact can have a history of
    // them. revokeClientInvite asserts the invite belongs to the caller's
    // agency, which is the boundary that matters.
    await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }

    const inviteId = await readInviteId(req)
    if (!UUID_RE.test(inviteId)) {
      return NextResponse.json(
        { error: "inviteId required (query string or body)" },
        { status: 400 }
      )
    }

    // Idempotent on an already-revoked invite; throws for one that has been
    // accepted, because that is live access and unlinking is a different act.
    await revokeClientInvite(auth.ctx, inviteId)
    return NextResponse.json({ revoked: true })
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
