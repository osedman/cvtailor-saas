/**
 * Closing the loop: when a role ends, the people in it are told.
 *
 * Ghosting is the recruitment industry's worst habit, and a product arguing
 * for candidate dignity must not facilitate it. Until now closing a role
 * started the retention clock and told nobody — the candidates who gave up
 * mornings for interviews found out the role was filled by never hearing
 * anything again.
 *
 * WHO IS TOLD is the decision that carries this file: only people the loop
 * was OPENED with. Their considered-notice was sent, or they were
 * interviewed. Somebody whose notice was suppressed has never heard from
 * Tailr about this role, and a closure email would be the first contact —
 * worse than none. The placed candidate is excluded (their news arrived
 * differently), and so is anybody holding a live offer.
 *
 * WHAT IT SAYS: the role ended, nothing about why, nothing about who got it,
 * and the one thing genuinely useful to them — when their data is deleted,
 * which is the promise the considered-notice already made ("if nothing comes
 * of this role..."). This email is that promise being kept, out loud.
 *
 * Suppression is re-checked at send time, the same as notices.ts: an
 * objection recorded after the interview still wins.
 */

import { sendEmail } from "@/lib/email"
import { getAppOrigin } from "@/lib/site-url"
import { writeAudit, type AgencyClient } from "./db"

export interface ClosureResult {
  sent: number
  suppressed: number
  noContact: number
  alreadyTold: number
  notEligible: number
  failed: number
  /** Eligible people this run did not reach because it hit the batch ceiling.
   * They keep their null stamp, so the next close picks them up. Surfaced so a
   * recruiter is told "40 of 63" rather than quietly shown a smaller number. */
  deferred: number
}

/**
 * How many closure emails one call will send.
 *
 * The notice cron already batches at 50 for the same reason: a burst of
 * transactional mail is what trips a provider's rate limit. Closure had no
 * bound at all — a pool of 10 hid it, and raising the pool would have exposed
 * it as "23 told" when the recruiter expected 50, with no explanation.
 *
 * Not-sent is not lost: closure_notified_at is only stamped on success, so
 * anybody deferred or failed is picked up by the next close of the same role.
 */
const CLOSURE_BATCH = 50

/** Space between sends. Small enough to be invisible on a normal close, big
 * enough that fifty do not arrive as one burst. */
const SEND_SPACING_MS = 120

/**
 * Tell the unsuccessful candidates a role has ended. Idempotent per person:
 * closure_notified_at is stamped on send, so a role closed twice emails once.
 */
export async function sendClosureNotices(
  admin: AgencyClient,
  roleId: string,
  /** Spacing between sends. Injectable so tests do not wait on real seconds —
   * fifty sends at the default is six of them. Production never passes it. */
  opts: { spacingMs?: number } = {}
): Promise<ClosureResult> {
  const spacingMs = opts.spacingMs ?? SEND_SPACING_MS
  const result: ClosureResult = {
    sent: 0, suppressed: 0, noContact: 0, alreadyTold: 0, notEligible: 0, failed: 0, deferred: 0,
  }

  const { data: role } = await admin
    .from("job_roles")
    .select("id, agency_id, title")
    .eq("id", roleId)
    .maybeSingle()
  if (!role) return result

  const agencyId = role.agency_id as string

  const [{ data: agency }, { data: candidates }, { data: rounds }, { data: placements }] =
    await Promise.all([
      admin
        .from("agencies")
        .select("name, notice_from_name, notice_reply_to, retention_days")
        .eq("id", agencyId)
        .single(),
      admin
        .from("candidates")
        .select("id, ref, full_name, email, rights_token, closure_notified_at")
        .eq("role_id", roleId)
        .eq("agency_id", agencyId),
      admin.from("interview_rounds").select("candidate_id").eq("role_id", roleId),
      admin
        .from("placements")
        .select("candidate_id, status")
        .eq("role_id", roleId),
    ])

  const pool = candidates ?? []
  if (pool.length === 0) return result

  const interviewed = new Set((rounds ?? []).map((r) => r.candidate_id as string))
  // A live-ish placement means this is not an unsuccessful candidate. Declined
  // and fallen-through placements put the person back in the closure set: the
  // role ended for them too.
  const placed = new Set(
    (placements ?? [])
      .filter((p) => ["offered", "accepted", "started"].includes(p.status as string))
      .map((p) => p.candidate_id as string)
  )

  const ids = pool.map((c) => c.id as string)
  const { data: notices } = await admin
    .from("candidate_notices")
    .select("candidate_id, status")
    .in("candidate_id", ids)
  const noticed = new Set(
    (notices ?? []).filter((n) => n.status === "sent").map((n) => n.candidate_id as string)
  )

  const agencyName = (agency?.notice_from_name as string) || (agency?.name as string) || "A recruitment agency"
  const retentionDays = (agency?.retention_days as number) ?? 180

  // Counts only the people this run actually tries to mail — the skips below
  // (already told, not eligible) cost nothing and must not consume the budget.
  let attempted = 0

  for (const candidate of pool) {
    const id = candidate.id as string
    const audit = (action: string, reason?: string) =>
      writeAudit(admin, {
        agencyId,
        roleId,
        candidateId: id,
        entityType: "notice",
        entityRef: (candidate.ref as string) ?? "",
        action,
        reason,
      })

    if (candidate.closure_notified_at) {
      result.alreadyTold += 1
      continue
    }
    if (placed.has(id)) {
      result.notEligible += 1
      continue
    }
    // The loop was never opened with them: no sent notice, no interview.
    if (!noticed.has(id) && !interviewed.has(id)) {
      result.notEligible += 1
      continue
    }
    if (!candidate.email) {
      result.noContact += 1
      await audit("closure_skipped", "no_contact_details")
      continue
    }

    // Ceiling reached: stop rather than firing the rest as a burst. Their
    // stamp stays null, so re-closing the role reaches them.
    if (attempted >= CLOSURE_BATCH) {
      result.deferred += 1
      continue
    }

    // Late suppression check — an objection recorded after the interview wins.
    const { data: identities } = await admin
      .from("candidate_identities")
      .select("identity_hash")
      .eq("candidate_id", id)
    const hashes = (identities ?? []).map((i) => i.identity_hash)
    if (hashes.length > 0) {
      const { data: suppressed } = await admin
        .from("notice_suppressions")
        .select("identity_hash")
        .eq("agency_id", agencyId)
        .in("identity_hash", hashes)
        .limit(1)
      if (suppressed && suppressed.length > 0) {
        result.suppressed += 1
        await audit("closure_suppressed", "suppression_list")
        continue
      }
    }

    // Paced from the second send onward.
    if (attempted > 0 && spacingMs > 0) await new Promise((r) => setTimeout(r, spacingMs))
    attempted += 1

    const send = await sendEmail({
      to: candidate.email as string,
      subject: `An update on the ${role.title as string} role`,
      html: closureHtml({
        candidateName: (candidate.full_name as string) ?? "",
        agencyName,
        roleTitle: (role.title as string) ?? "the role",
        retentionDays,
        rightsUrl: candidate.rights_token
          ? `${getAppOrigin()}/rights/${candidate.rights_token}`
          : "",
      }),
      from: `${agencyName} via Tailr <notices@gettailr.com>`,
      replyTo: (agency?.notice_reply_to as string) || undefined,
    })

    if (send.sent) {
      await admin
        .from("candidates")
        .update({ closure_notified_at: new Date().toISOString() })
        .eq("id", id)
      await audit("closure_sent")
      result.sent += 1
    } else {
      await audit("closure_failed", send.error ?? send.skipped ?? "unknown")
      result.failed += 1
    }
  }

  return result
}

/**
 * The closure email. No reasons, no winner, no encouragement-shaped padding —
 * the role ended, their data has a deletion date, and their rights still
 * stand. Exported for sign-off, like every candidate-facing template.
 */
export function closureHtml(opts: {
  candidateName: string
  agencyName: string
  roleTitle: string
  retentionDays: number
  rightsUrl?: string
}): string {
  const firstName = opts.candidateName.split(" ")[0] || "there"
  return `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#1e1813;padding:32px 28px;">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#dc4f33;font-weight:700;">An update</p>
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">The ${escapeHtml(opts.roleTitle)} role has closed, ${escapeHtml(firstName)}.</h1>
  <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(opts.agencyName)} is no longer recruiting for it, so you will not hear more about this one. You deserved to know rather than to be left wondering.</p>
  <p style="margin:0 0 16px;line-height:1.6;">Your details are deleted automatically ${opts.retentionDays} days after a role closes — that clock has now started. Nothing you sent is kept beyond it.</p>
  ${
    opts.rightsUrl
      ? `<p style="margin:0 0 16px;"><a href="${opts.rightsUrl}" style="display:inline-block;background:#1e1813;color:#fffdfa;border-radius:8px;padding:10px 16px;font-weight:600;text-decoration:none;">See what they hold, or ask them to delete it now</a></p>`
      : `<p style="margin:0 0 16px;line-height:1.6;">If you would rather it were deleted now, reply to this email and it will be.</p>`
  }
  <p style="margin:24px 0 0;font-size:12px;color:#7a7266;line-height:1.5;">Sent on behalf of ${escapeHtml(opts.agencyName)}, who is responsible for your data. Tailr processes it on their behalf.</p>
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
