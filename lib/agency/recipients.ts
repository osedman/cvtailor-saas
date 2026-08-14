/**
 * Portal recipients: who currently holds a working link to a shortlist, and
 * how to kill one.
 *
 * The gap this closes: `submission_recipients.revoked_at` has existed since
 * migration 4 and the portal has always refused a row that carries it — but
 * nothing in the product could ever SET it. A shortlist link forwarded to the
 * wrong inbox could not be withdrawn from inside Tailr, while the submission
 * screen told recruiters each link was "revocable on its own". This is the
 * code that makes that sentence true.
 *
 * `submission_recipients` is audit-coupled (AGENCIES_SCHEMA.md §4.1): it has
 * no authenticated write policies, so every write here goes through the
 * service role in the same operation that writes the audit_log row.
 *
 * Revocation is deliberately NOT deletion. The row is the attribution trail
 * for anything that recipient already did — client_actions point at it, and
 * `contact_id` is RESTRICT precisely so a sent shortlist keeps its record.
 * Killing the link must not erase who was sent what.
 */

import { agencyAdmin, assertWriter, writeAudit, AgencyAccessError } from "./db"
import type { AgencyContext } from "./types"

export interface RecipientRow {
  id: string
  submissionId: string
  contactId: string
  company: string
  fullName: string
  /** Never the raw token — that existed once, in one response, and is gone. */
  expiresAt: string
  revokedAt: string | null
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  /** What the recruiter actually needs to know: can this link open right now? */
  live: boolean
}

/**
 * Everyone holding a link for this role's submissions, newest first.
 *
 * Scoped by agency AND by the role's own submissions, so a recipient id from
 * another agency cannot be reached even by guessing a role id.
 */
export async function listRecipientsForRole(
  ctx: AgencyContext,
  roleId: string
): Promise<RecipientRow[]> {
  const admin = agencyAdmin()

  const { data: submissions, error: subError } = await admin
    .from("submissions")
    .select("id")
    .eq("role_id", roleId)
    .eq("agency_id", ctx.agencyId)
  if (subError) throw subError
  const submissionIds = (submissions ?? []).map((s) => s.id as string)
  if (submissionIds.length === 0) return []

  const { data: rows, error } = await admin
    .from("submission_recipients")
    .select(
      "id, submission_id, contact_id, expires_at, revoked_at, first_opened_at, last_opened_at, created_at"
    )
    .eq("agency_id", ctx.agencyId)
    .in("submission_id", submissionIds)
    .order("created_at", { ascending: false })
  if (error) throw error
  if (!rows || rows.length === 0) return []

  // Names come from the agency's own address book, one scoped lookup.
  const contactIds = [...new Set(rows.map((r) => r.contact_id as string))]
  const { data: contacts } = await admin
    .from("client_contacts")
    .select("id, company, full_name")
    .eq("agency_id", ctx.agencyId)
    .in("id", contactIds)
  const byId = new Map(
    (contacts ?? []).map((c) => [
      c.id as string,
      { company: (c.company as string) ?? "", fullName: (c.full_name as string) ?? "" },
    ])
  )

  const now = Date.now()
  return rows.map((r) => {
    const revokedAt = (r.revoked_at as string | null) ?? null
    const expiresAt = r.expires_at as string
    const contact = byId.get(r.contact_id as string)
    return {
      id: r.id as string,
      submissionId: r.submission_id as string,
      contactId: r.contact_id as string,
      company: contact?.company ?? "",
      fullName: contact?.fullName ?? "",
      expiresAt,
      revokedAt,
      firstOpenedAt: (r.first_opened_at as string | null) ?? null,
      lastOpenedAt: (r.last_opened_at as string | null) ?? null,
      // Mirrors exactly what app/api/portal/[token] enforces: revoked or past
      // expiry means the link is dead. If those two ever disagree, this list
      // is lying to a recruiter about who can still read a shortlist.
      live: !revokedAt && new Date(expiresAt).getTime() >= now,
    }
  })
}

/**
 * Kill one link. Idempotent: re-revoking an already-revoked recipient is a
 * no-op rather than an error, because the recruiter's intent ("this must not
 * open") is already satisfied and a second audit row would imply a second
 * event. Expired links can still be revoked — an expiry can be extended by a
 * future feature, a revocation is a decision.
 */
export async function revokeRecipient(
  ctx: AgencyContext,
  recipientId: string
): Promise<{ alreadyRevoked: boolean }> {
  assertWriter(ctx)
  const admin = agencyAdmin()

  const { data: recipient, error } = await admin
    .from("submission_recipients")
    .select("id, agency_id, submission_id, contact_id, revoked_at")
    .eq("id", recipientId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  if (error) throw error
  // Same message for missing and cross-tenant: a recruiter probing ids should
  // not be able to tell another agency's recipient from a nonexistent one.
  if (!recipient) throw new AgencyAccessError("recipient not found in your agency")
  if (recipient.revoked_at) return { alreadyRevoked: true }

  // Conditional: only the caller who flips it from null writes the audit row,
  // so two clicks cannot log two revocations.
  const { data: revoked, error: updateError } = await admin
    .from("submission_recipients")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", recipientId)
    .eq("agency_id", ctx.agencyId)
    .is("revoked_at", null)
    .select("id")
  if (updateError) throw updateError
  if (!revoked || revoked.length === 0) return { alreadyRevoked: true }

  // Look up the role for the audit row's ref — the log is read per role.
  const { data: submission } = await admin
    .from("submissions")
    .select("role_id")
    .eq("id", recipient.submission_id as string)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle()
  const roleId = (submission?.role_id as string | undefined) ?? null
  let roleRef = ""
  if (roleId) {
    const { data: role } = await admin
      .from("job_roles")
      .select("ref")
      .eq("id", roleId)
      .eq("agency_id", ctx.agencyId)
      .maybeSingle()
    roleRef = (role?.ref as string) ?? ""
  }

  await writeAudit(admin, {
    agencyId: ctx.agencyId,
    roleId,
    actorId: ctx.userId,
    entityType: "submission",
    entityRef: roleRef,
    action: "recipient_revoked",
    // Ids only. The recipient's email is not in the log, and the raw token
    // never existed anywhere we could log it.
    toValue: { recipient_id: recipientId, contact_id: recipient.contact_id as string },
  })

  return { alreadyRevoked: false }
}
