import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, agencyAdmin } from "@/lib/agency/db"
import { createClientInvite, listClientAccess, peekInvite, unlinkClientContact } from "@/lib/agency/client-auth"
import { inviteEmailHtml } from "@/lib/agency/client-invite-email"
import type { AgencyContext } from "@/lib/agency/types"
import { requireAdmin } from "@/lib/admin-access"
import { isClientAccessAction, isUuid, validReason } from "@/lib/admin-agencies"
import { logAgencyAdminAction } from "@/lib/admin-agency-server"
import { sendEmail } from "@/lib/email"
import { b2bFrom } from "@/lib/email-senders"
import { getBusinessOrigin } from "@/lib/site-url"
import { anonRateLimitId, checkRateLimit } from "@/lib/rate-limit"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

type Ctx = { params: Promise<{ id: string }> }

/**
 * An agency's client (hiring-manager) access, from the admin area.
 *
 * GET  — the agency's client contacts and where each one's access stands:
 *        linked, invited, invite expired, or none. Support and up.
 * POST — resend a contact's invite, or remove a linked contact's access.
 *        Support, two-step, reason.
 *
 * There is deliberately NO "link this person" action. A hiring manager is
 * linked only by accepting an invite while signed in as the invited address
 * (docs/AGENCIES_SCHEMA.md §5.4 — no email self-claim, and no admin claim on
 * their behalf either). Re-linking someone is: remove access, resend invite.
 *
 * Both actions run the SAME functions the recruiter's own screen uses
 * (lib/agency/client-auth.ts), with the support marker, so the one-live-invite
 * rule and the audit trail cannot drift between the two doors. The invite
 * link is emailed to the contact and never returned here.
 */

/** The functions below take the agency's context; an admin is not a member,
 * so one is made for this request. `role: "owner"` only satisfies their
 * writer check — the admin gate above is what actually authorised this. */
function supportContext(agencyId: string, adminUserId: string): AgencyContext {
  return { agencyId, userId: adminUserId, role: "owner" }
}

async function agencyExists(id: string): Promise<boolean> {
  const { data, error } = await agencyAdmin().from("agencies").select("id").eq("id", id).maybeSingle()
  if (error) throw error
  return !!data
}

async function GET_handler(_req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("support")
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id) || !(await agencyExists(id))) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const rows = await listClientAccess(supportContext(id, gate.admin.userId))
    return NextResponse.json({
      contacts: rows.map((r) => ({
        contactId: r.contactId,
        company: r.company,
        name: r.fullName,
        email: r.email,
        state: r.state,
        expiresAt: r.expiresAt,
        alsoMember: r.alsoMember,
      })),
    })
  } catch (err) {
    console.error("[admin/agencies/[id]/clients GET]", errorMessage(err))
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

async function POST_handler(req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("support", { twoStep: true })
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id) || !(await agencyExists(id))) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!isUuid(body?.contactId) || !isClientAccessAction(body?.action)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    }
    if (!validReason(body?.reason)) {
      return NextResponse.json({ error: "Give a short reason for this change." }, { status: 400 })
    }
    const contactId = body.contactId
    const reason = body.reason.trim()
    const ctx = supportContext(id, gate.admin.userId)

    // The contact's company, for the activity log. Scoped to this agency, so
    // a contact id from another agency reads as not found.
    const { data: contact, error: contactErr } = await agencyAdmin()
      .from("client_contacts").select("company").eq("id", contactId).eq("agency_id", id).maybeSingle()
    if (contactErr) throw contactErr
    if (!contact) return NextResponse.json({ error: "That contact is not in this agency." }, { status: 404 })
    const company = (contact.company as string) ?? ""

    if (body.action === "unlink") {
      const removed = await unlinkClientContact(ctx, contactId, { reason })
      if (!removed) {
        return NextResponse.json({ error: "They have no access to remove." }, { status: 409 })
      }
      // Verify the effect: the contact must now read as not linked.
      const after = (await listClientAccess(ctx)).find((r) => r.contactId === contactId)
      if (after?.state === "linked") throw new Error("The change did not take effect.")
      await logAgencyAdminAction({
        actorId: gate.admin.userId, agencyId: id, action: "client_access_removed", reason, to: { company },
      })
      return NextResponse.json({ ok: true, state: after?.state ?? "none" })
    }

    // Resend. Same per-contact limit as the recruiter's button, checked before
    // a token is minted so a refusal leaves the existing invite alone.
    const limited = await checkRateLimit(anonRateLimitId(`client-invite:${contactId}`), "auth")
    if (limited) return limited

    const { rawToken, expiresAt } = await createClientInvite(ctx, contactId, { reason })
    const invite = await peekInvite(rawToken)
    let email: { sent: boolean; skipped: string | null } = { sent: false, skipped: "no address on the contact" }
    if (invite?.contactEmail) {
      const agencyLabel = invite.agencyName || "Your recruitment partner"
      const mail = await sendEmail({
        from: b2bFrom(),
        to: invite.contactEmail,
        subject: `${agencyLabel} has invited you to their hiring workspace on Tailr`,
        html: inviteEmailHtml({
          agencyName: invite.agencyName,
          company: invite.company,
          url: `${getBusinessOrigin()}/hiring/invite/${encodeURIComponent(rawToken)}`,
          expiresAt,
        }),
      })
      // Resend's error text can quote the address back; keep it out of the reply.
      email = { sent: mail.sent, skipped: mail.sent ? null : (mail.skipped ?? "the mail provider refused it").replace(/[^\s@<>"'()]+@[^\s@<>"'()]+/g, "[address]") }
    }
    await logAgencyAdminAction({
      actorId: gate.admin.userId, agencyId: id, action: "client_invite_resent", reason,
      to: { company, emailed: email.sent },
    })
    return NextResponse.json({ ok: true, state: "invited", expiresAt, email }, { status: 201 })
  } catch (err) {
    if (err instanceof AgencyAccessError) {
      return NextResponse.json({ error: "That contact is not in this agency." }, { status: 404 })
    }
    console.error("[admin/agencies/[id]/clients POST]", errorMessage(err))
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export const GET = withTiming("/api/admin/agencies/[id]/clients", "GET", GET_handler)
export const POST = withTiming("/api/admin/agencies/[id]/clients", "POST", POST_handler)
