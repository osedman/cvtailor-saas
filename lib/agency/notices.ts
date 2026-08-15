/**
 * The single implementation of candidate notice delivery. Both callers use
 * it: the daily cron (auto fire at the end of the window) and the recruiter's
 * "Send now" action. Suppression list and missing contact details are checked
 * at send time regardless of who triggers it, every outcome writes an audit
 * row, and there is no parameter that skips a due notice.
 */

import { sendEmail } from "@/lib/email"
import { getAppOrigin } from "@/lib/site-url"
import { writeAudit, type AgencyClient } from "./db"

export type NoticeOutcome =
  | "sent"
  | "suppressed_list"
  | "suppressed_no_contact"
  | "failed"
  | "orphaned"
  | "not_sendable"

/** Send one scheduled notice by id. Loads everything it needs; callers only
 * decide WHEN to fire (cron: due; recruiter: now). */
export async function sendOneNotice(admin: AgencyClient, noticeId: string): Promise<NoticeOutcome> {
  const { data: notice } = await admin
    .from("candidate_notices")
    .select("id, agency_id, candidate_id, personal_note, template_version, status")
    .eq("id", noticeId)
    .maybeSingle()
  if (!notice) return "orphaned"
  if (notice.status !== "scheduled") return "not_sendable"

  const { data: candidate } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, ref, full_name, email, rights_token")
    .eq("id", notice.candidate_id)
    .maybeSingle()
  if (!candidate) {
    // Candidate purged between scheduling and firing; nothing to notify.
    await admin.from("candidate_notices").delete().eq("id", notice.id)
    return "orphaned"
  }

  const audit = (action: string, reason?: string, toValue?: unknown) =>
    writeAudit(admin, {
      agencyId: candidate.agency_id,
      roleId: candidate.role_id,
      candidateId: candidate.id,
      entityType: "notice",
      entityRef: candidate.ref,
      action,
      reason,
      toValue,
    })

  const suppress = async (reason: "suppression_list" | "no_contact_details") => {
    await admin
      .from("candidate_notices")
      .update({ status: "suppressed", suppressed_reason: reason })
      .eq("id", notice.id)
    await audit("suppressed", reason)
  }

  // Late suppression check: an objection recorded after scheduling wins.
  const { data: identities } = await admin
    .from("candidate_identities")
    .select("identity_hash")
    .eq("candidate_id", candidate.id)
  const hashes = (identities ?? []).map((i) => i.identity_hash)
  if (hashes.length > 0) {
    const { data: suppressed } = await admin
      .from("notice_suppressions")
      .select("identity_hash")
      .eq("agency_id", candidate.agency_id)
      .in("identity_hash", hashes)
      .limit(1)
    if (suppressed && suppressed.length > 0) {
      await suppress("suppression_list")
      return "suppressed_list"
    }
  }

  if (!candidate.email) {
    await suppress("no_contact_details")
    return "suppressed_no_contact"
  }

  const [{ data: agency }, { data: role }] = await Promise.all([
    admin
      .from("agencies")
      .select("name, notice_from_name, notice_reply_to, retention_days")
      .eq("id", candidate.agency_id)
      .single(),
    admin.from("job_roles").select("title, location").eq("id", candidate.role_id).maybeSingle(),
  ])

  const agencyName = agency?.notice_from_name || agency?.name || "A recruitment agency"
  const result = await sendEmail({
    to: candidate.email,
    subject: `${agencyName} is considering you for a role`,
    html: noticeHtml({
      candidateName: candidate.full_name,
      agencyName,
      roleTitle: role?.title ?? "a role",
      roleLocation: role?.location ?? "",
      retentionDays: agency?.retention_days ?? 180,
      personalNote: notice.personal_note ?? "",
      // The consumer app origin, via the one helper. This read
      // NEXT_PUBLIC_SITE_URL directly with an apex default, which is a third
      // answer to a question lib/site-url.ts already answers — and the rights
      // doorway belongs to the candidate, so it stays off the agency domain.
      rightsUrl: candidate.rights_token
        ? `${getAppOrigin()}/rights/${candidate.rights_token}`
        : "",
    }),
    from: `${agencyName} via Tailr <notices@gettailr.com>`,
    replyTo: agency?.notice_reply_to || undefined,
  })

  if (result.sent) {
    await admin
      .from("candidate_notices")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", notice.id)
    await audit("sent", undefined, { template_version: notice.template_version })
    return "sent"
  }

  await admin.from("candidate_notices").update({ status: "failed" }).eq("id", notice.id)
  await audit("failed", result.error ?? result.skipped ?? "unknown")
  return "failed"
}

/** Template v1. Good news first, rights beneath, no client company, no
 * marketing. Dash free prose per brand voice. Copy pending Ose's sign off. */
export function noticeHtml(opts: {
  candidateName: string
  agencyName: string
  roleTitle: string
  roleLocation: string
  retentionDays: number
  personalNote: string
  rightsUrl?: string
}): string {
  const firstName = opts.candidateName.split(" ")[0] || "there"
  const where = opts.roleLocation ? ` in ${opts.roleLocation}` : ""
  const note = opts.personalNote
    ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fff7f4;border-left:3px solid #dc4f33;color:#1e1813;">${escapeHtml(
        opts.personalNote
      )}</p>`
    : ""
  return `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#1e1813;padding:32px 28px;">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#dc4f33;font-weight:700;">You are being considered</p>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">Good news, ${escapeHtml(firstName)}.</h1>
  <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(
    opts.agencyName
  )} is considering you for a ${escapeHtml(opts.roleTitle)} position${escapeHtml(where)}. They are using Tailr to review your CV against the requirements of the role, so their assessment is based on evidence from the CV you provided rather than guesswork.</p>
  ${note}
  <p style="margin:0 0 16px;line-height:1.6;">Because ${escapeHtml(
    opts.agencyName
  )} holds your CV, UK data protection law gives you rights over that information. You can ask to see the data they hold, correct it, or have it deleted at any time.${
    opts.rightsUrl ? "" : " Reply to this email to reach your recruiter directly with any of those requests."
  }</p>
  ${
    opts.rightsUrl
      ? `<p style="margin:0 0 16px;"><a href="${opts.rightsUrl}" style="display:inline-block;background:#1e1813;color:#fffdfa;border-radius:8px;padding:10px 16px;font-weight:600;text-decoration:none;">See what they hold, or ask them to delete it</a></p>
  <p style="margin:0 0 16px;line-height:1.6;font-size:13px;color:#4e463d;">No account needed, and you can reply to this email instead if you prefer.</p>`
      : ""
  }
  <p style="margin:0 0 16px;line-height:1.6;">If nothing comes of this role, your CV data is kept for ${
    opts.retentionDays
  } days after the role closes and is then deleted automatically.</p>
  <p style="margin:24px 0 0;font-size:12px;color:#7a7266;line-height:1.5;">This notice was sent on behalf of ${escapeHtml(
    opts.agencyName
  )}, who is responsible for your data. Tailr processes it on their behalf.</p>
</div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
