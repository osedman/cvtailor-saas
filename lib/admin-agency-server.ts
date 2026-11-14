/**
 * Admin operations on agencies — the server half (14 Nov 2026).
 *
 * Server-only (service-role clients). Routes under /api/admin/agencies call
 * these after lib/admin-access.ts has let the admin through.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { b2bFrom } from "@/lib/email-senders"
import { getBusinessOrigin } from "@/lib/site-url"
import { agencyAccessEmail, agencyRpcError, type AgencyMemberRole } from "@/lib/admin-agencies"

export interface ResolvedAccount {
  userId: string
  /** Present when the account was created just now and still needs confirming. */
  inviteHash: string | null
}

/**
 * The account for an email address: the existing one, or a new UNCONFIRMED
 * one with an invite link. Same rule as the owner-facing team invite
 * (30 Sep 2026 access audit): only the inbox owner can confirm an address, so
 * an admin can never vouch for someone else's inbox.
 */
export async function resolveOrInviteAccount(email: string): Promise<ResolvedAccount> {
  const admin = createAdminClient()
  const { data: existing } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle()
  if (existing?.id) return { userId: existing.id as string, inviteHash: null }

  const { data: invited, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${getBusinessOrigin()}/auth/confirm` },
  })
  if (error) throw error
  const userId = invited.user?.id
  if (!userId) throw new Error("Could not create the account for that email address.")
  return { userId, inviteHash: invited.properties?.hashed_token ?? null }
}

/**
 * Tell the person they have access. Returns whether the email ACTUALLY went:
 * staging only mails EMAIL_ALLOWLIST, and "added" over a refused send is how
 * a tester gets added and never hears about it (21 Sep 2026).
 */
export async function sendAgencyAccessEmail(input: {
  to: string
  agencyName: string
  role: AgencyMemberRole
  inviteHash: string | null
}): Promise<{ sent: boolean; skipped: string | null }> {
  const origin = getBusinessOrigin()
  const signInUrl = input.inviteHash
    ? `${origin}/auth/confirm?token_hash=${encodeURIComponent(input.inviteHash)}&type=invite&next=${encodeURIComponent("/agencies")}`
    : `${origin}/login`
  const { subject, html } = agencyAccessEmail({
    agencyName: input.agencyName,
    role: input.role,
    signInUrl,
    isInvite: !!input.inviteHash,
  })
  try {
    const mail = await sendEmail({ from: b2bFrom(), to: input.to, subject, html })
    return { sent: !!mail.sent, skipped: mail.sent ? null : String(mail.skipped ?? mail.error ?? "not sent") }
  } catch (e) {
    return { sent: false, skipped: e instanceof Error ? e.message : "not sent" }
  }
}

/** A database-function refusal as a response, or null to rethrow. */
export function rpcRefusal(error: { message?: string } | null): NextResponse | null {
  const known = agencyRpcError(error?.message)
  return known ? NextResponse.json({ error: known.message }, { status: known.status }) : null
}

/**
 * Record an admin action that the database functions do not log themselves
 * (client invites and job reruns reuse existing agency code). Written AFTER
 * the action succeeds; a failure here is thrown so the admin is told the
 * action happened but was not logged, rather than it passing silently.
 */
export async function logAgencyAdminAction(input: {
  actorId: string
  agencyId: string
  action: string
  reason: string
  from?: Record<string, unknown> | null
  to?: Record<string, unknown> | null
}): Promise<void> {
  const { error } = await createAdminClient().from("admin_audit_log").insert({
    actor_id: input.actorId,
    area: "agencies",
    action: input.action,
    target_type: "agency",
    target_id: input.agencyId,
    from_value: input.from ?? null,
    to_value: input.to ?? null,
    reason: input.reason.trim(),
  })
  if (error) throw new Error(`The change was made but could not be written to the activity log: ${error.message}`)
}
