/**
 * Agency housekeeping cron — THE launch gate for real candidate data.
 *
 * Runs (wire via vercel.json cron or an external scheduler, daily):
 *   1. Retention purge: agency.purge_expired() erases candidates whose
 *      retention window lapsed, then this route deletes their CV files from
 *      the agency-cvs bucket (SQL cannot delete storage blobs safely).
 *   2. Candidate notices: sends due Art 14 notices (scheduled_for <= now),
 *      honouring the suppression list and recording no-contact-details
 *      suppressions. The auto-fire is not optional — there is deliberately no
 *      configuration read here that can skip a due notice.
 *
 * Machine endpoint: guarded by CRON_SECRET, no user session, no rate limit.
 * Response contains counts only — candidate PII never appears in cron logs.
 *
 * Notice copy is template_version v1 (good news first, rights below, client
 * company never named, reply-to = agency). Copy review by Ose before launch.
 */

import { NextRequest, NextResponse } from "next/server"
import { agencyAdmin, writeAudit } from "@/lib/agency/db"
import { sendEmail } from "@/lib/email"

export const maxDuration = 300

const NOTICE_BATCH = 50

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const admin = agencyAdmin()
  const summary = {
    purged: 0,
    files_removed: 0,
    notices_sent: 0,
    notices_suppressed: 0,
    notices_failed: 0,
  }

  // ---- 1. Retention purge -----------------------------------
  const { data: purged, error: purgeError } = await admin.rpc("purge_expired")
  if (purgeError) {
    return NextResponse.json({ error: `purge failed: ${purgeError.message}` }, { status: 500 })
  }
  const purgedRows = (purged ?? []) as Array<{
    candidate_id: string
    ref: string
    storage_path: string | null
  }>
  summary.purged = purgedRows.length

  const paths = purgedRows.map((r) => r.storage_path).filter((p): p is string => !!p)
  if (paths.length > 0) {
    const { data: removed, error: removeError } = await admin.storage
      .from("agency-cvs")
      .remove(paths)
    if (removeError) {
      // Purged rows are already gone from the DB; orphaned files must not be
      // silent. Surface loudly — the next run will NOT retry these paths.
      console.error("[agency-cron] storage removal failed:", removeError.message)
    }
    summary.files_removed = removed?.length ?? 0
  }

  // ---- 2. Due notices ---------------------------------------
  const nowIso = new Date().toISOString()
  const { data: due, error: dueError } = await admin
    .from("candidate_notices")
    .select("id, agency_id, candidate_id, personal_note, template_version")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .limit(NOTICE_BATCH)
  if (dueError) {
    return NextResponse.json({ error: `notice query failed: ${dueError.message}` }, { status: 500 })
  }

  if (due && due.length > 0) {
    const candidateIds = due.map((n) => n.candidate_id)
    const [{ data: candidates }, { data: identities }] = await Promise.all([
      admin
        .from("candidates")
        .select("id, agency_id, role_id, ref, full_name, email")
        .in("id", candidateIds),
      admin.from("candidate_identities").select("candidate_id, agency_id, identity_hash").in("candidate_id", candidateIds),
    ])

    const candidateById = new Map((candidates ?? []).map((c) => [c.id, c]))

    const agencyIds = [...new Set((candidates ?? []).map((c) => c.agency_id))]
    const roleIds = [...new Set((candidates ?? []).map((c) => c.role_id))]
    const hashes = [...new Set((identities ?? []).map((i) => i.identity_hash))]

    const [{ data: agencies }, { data: roles }, { data: suppressions }] = await Promise.all([
      agencyIds.length
        ? admin.from("agencies").select("id, name, notice_from_name, notice_reply_to, retention_days").in("id", agencyIds)
        : Promise.resolve({ data: [] as never[] }),
      roleIds.length
        ? admin.from("job_roles").select("id, title, location").in("id", roleIds)
        : Promise.resolve({ data: [] as never[] }),
      hashes.length
        ? admin.from("notice_suppressions").select("agency_id, identity_hash").in("identity_hash", hashes)
        : Promise.resolve({ data: [] as never[] }),
    ])

    const agencyById = new Map((agencies ?? []).map((a) => [a.id, a]))
    const roleById = new Map((roles ?? []).map((r) => [r.id, r]))
    const suppressed = new Set((suppressions ?? []).map((s) => `${s.agency_id}:${s.identity_hash}`))
    const suppressedCandidates = new Set(
      (identities ?? [])
        .filter((i) => suppressed.has(`${i.agency_id}:${i.identity_hash}`))
        .map((i) => i.candidate_id)
    )

    for (const notice of due) {
      const candidate = candidateById.get(notice.candidate_id)
      const agency = candidate ? agencyById.get(candidate.agency_id) : undefined
      const role = candidate ? roleById.get(candidate.role_id) : undefined

      const suppress = async (reason: string) => {
        await admin
          .from("candidate_notices")
          .update({ status: "suppressed", suppressed_reason: reason })
          .eq("id", notice.id)
        if (candidate) {
          await writeAudit(admin, {
            agencyId: candidate.agency_id,
            roleId: candidate.role_id,
            candidateId: candidate.id,
            entityType: "notice",
            entityRef: candidate.ref,
            action: "suppressed",
            reason,
          })
        }
        summary.notices_suppressed++
      }

      if (!candidate || !agency) {
        // Candidate purged between scheduling and firing; nothing to notify.
        await admin.from("candidate_notices").delete().eq("id", notice.id)
        continue
      }
      if (suppressedCandidates.has(candidate.id)) {
        await suppress("suppression_list")
        continue
      }
      if (!candidate.email) {
        await suppress("no_contact_details")
        continue
      }

      const agencyName = agency.notice_from_name || agency.name
      const result = await sendEmail({
        to: candidate.email,
        subject: `${agencyName} is considering you for a role`,
        html: noticeHtml({
          candidateName: candidate.full_name,
          agencyName,
          roleTitle: role?.title ?? "a role",
          roleLocation: role?.location ?? "",
          retentionDays: agency.retention_days ?? 180,
          personalNote: notice.personal_note ?? "",
        }),
        from: `${agencyName} via Tailr <notices@gettailr.com>`,
        replyTo: agency.notice_reply_to || undefined,
      })

      if (result.sent) {
        await admin
          .from("candidate_notices")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", notice.id)
        await writeAudit(admin, {
          agencyId: candidate.agency_id,
          roleId: candidate.role_id,
          candidateId: candidate.id,
          entityType: "notice",
          entityRef: candidate.ref,
          action: "sent",
          toValue: { template_version: notice.template_version },
        })
        summary.notices_sent++
      } else {
        await admin.from("candidate_notices").update({ status: "failed" }).eq("id", notice.id)
        await writeAudit(admin, {
          agencyId: candidate.agency_id,
          roleId: candidate.role_id,
          candidateId: candidate.id,
          entityType: "notice",
          entityRef: candidate.ref,
          action: "failed",
          reason: result.error ?? result.skipped ?? "unknown",
        })
        summary.notices_failed++
      }
    }
  }

  return NextResponse.json(summary)
}

/** Template v1. Good news first, rights beneath, no client company, no
 * marketing. Dash-free prose per brand voice. */
function noticeHtml(opts: {
  candidateName: string
  agencyName: string
  roleTitle: string
  roleLocation: string
  retentionDays: number
  personalNote: string
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
  )} holds your CV, UK data protection law gives you rights over that information. You can ask to see the data they hold, correct it, or have it deleted at any time. Reply to this email to reach your recruiter directly with any of those requests.</p>
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
