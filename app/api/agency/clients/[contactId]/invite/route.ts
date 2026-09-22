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
  createClientInvite,
  peekInvite,
  revokeClientInvite,
} from "@/lib/agency/client-auth"
import { sendEmail } from "@/lib/email"
import { inviteEmailHtml } from "@/lib/agency/client-invite-email"
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
