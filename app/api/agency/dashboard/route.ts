/**
 * Agency home aggregation. Answers the only question a recruiter juggling
 * several roles actually has: what needs me today.
 *
 * Every query runs through the user scoped client, so RLS does the tenancy
 * work and nothing here can reach another agency. No service role, no
 * aggregate that leaks a candidate the caller could not already read.
 */

import { NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"

export const maxDuration = 30

const DAY = 86_400_000

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }
    const { db, ctx } = auth
    const now = Date.now()

    const [
      rolesRes,
      candidatesRes,
      reviewsRes,
      decisionsRes,
      actionsRes,
      recipientsRes,
      noticesRes,
      rightsRes,
      auditRes,
      agencyRes,
    ] = await Promise.all([
      db.from("job_roles").select("id, ref, title, company, status, created_at, closed_at").eq("agency_id", ctx.agencyId).order("created_at", { ascending: false }),
      db.from("candidates").select("id, ref, full_name, role_id, parse_status, retention_expires_at").eq("agency_id", ctx.agencyId),
      db.from("candidate_reviews").select("candidate_id, status").eq("agency_id", ctx.agencyId),
      db.from("recruiter_reviews").select("candidate_id, decision").eq("agency_id", ctx.agencyId),
      db.from("client_actions").select("id, candidate_ref, action, message, created_at, recipient_id").eq("agency_id", ctx.agencyId).order("created_at", { ascending: false }).limit(20),
      db.from("submission_recipients").select("id, submission_id, expires_at, revoked_at, first_opened_at").eq("agency_id", ctx.agencyId),
      db.from("candidate_notices").select("candidate_id, status, scheduled_for").eq("agency_id", ctx.agencyId).eq("status", "scheduled"),
      db.from("rights_requests").select("id, candidate_ref, kind, status, requested_at").eq("agency_id", ctx.agencyId).eq("status", "pending"),
      db.from("audit_log").select("id, entity_type, entity_ref, action, created_at").eq("agency_id", ctx.agencyId).order("created_at", { ascending: false }).limit(12),
      db.from("agencies").select("name, retention_days, notice_delay_days").eq("id", ctx.agencyId).maybeSingle(),
    ])

    const roles = rolesRes.data ?? []
    const candidates = candidatesRes.data ?? []
    const openRoleIds = new Set(roles.filter((r) => r.status !== "closed").map((r) => r.id))
    const roleById = new Map(roles.map((r) => [r.id, r]))

    const reviewStatus = new Map((reviewsRes.data ?? []).map((r) => [r.candidate_id, r.status]))
    const decisionFor = new Map((decisionsRes.data ?? []).map((d) => [d.candidate_id, d.decision]))

    // Live candidates only: a closed role is finished work, not a to do.
    const live = candidates.filter((c) => openRoleIds.has(c.role_id) && c.parse_status !== "failed")

    const awaitingScreening = live.filter((c) => (reviewStatus.get(c.id) ?? "unreviewed") !== "reviewed")
    const awaitingDecision = live.filter(
      (c) => reviewStatus.get(c.id) === "reviewed" && !decisionFor.get(c.id)
    )

    const activeRecipients = (recipientsRes.data ?? []).filter(
      (r) => !r.revoked_at && new Date(r.expires_at).getTime() > now
    )
    const actedRecipientIds = new Set((actionsRes.data ?? []).map((a) => a.recipient_id))
    const awaitingClient = activeRecipients.filter((r) => !actedRecipientIds.has(r.id))

    const noticesDue = (noticesRes.data ?? []).filter(
      (n) => new Date(n.scheduled_for).getTime() <= now + 7 * DAY
    )
    const retentionSoon = candidates.filter(
      (c) => c.retention_expires_at && new Date(c.retention_expires_at).getTime() <= now + 30 * DAY
    )

    const candidateName = (ref: string) => candidates.find((c) => c.ref === ref)?.full_name ?? ref

    return NextResponse.json({
      agency: agencyRes.data ?? null,
      caller_role: ctx.role,
      needs_you: {
        client_actions: (actionsRes.data ?? []).slice(0, 8).map((a) => ({
          id: a.id,
          candidate_ref: a.candidate_ref,
          candidate_name: candidateName(a.candidate_ref),
          action: a.action,
          message: a.message,
          created_at: a.created_at,
        })),
        rights_requests: rightsRes.data ?? [],
      },
      pipeline: {
        awaiting_screening: awaitingScreening.map((c) => ({
          id: c.id,
          ref: c.ref,
          full_name: c.full_name,
          role_id: c.role_id,
          role_title: roleById.get(c.role_id)?.title ?? "",
        })),
        awaiting_decision: awaitingDecision.map((c) => ({
          id: c.id,
          ref: c.ref,
          full_name: c.full_name,
          role_id: c.role_id,
          role_title: roleById.get(c.role_id)?.title ?? "",
        })),
        awaiting_client: awaitingClient.length,
        parse_failures: candidates.filter((c) => c.parse_status === "failed" && openRoleIds.has(c.role_id)).length,
      },
      compliance: {
        notices_due: noticesDue.length,
        retention_soon: retentionSoon.length,
        rights_pending: (rightsRes.data ?? []).length,
      },
      roles: roles.map((r) => ({
        ...r,
        candidate_count: candidates.filter((c) => c.role_id === r.id).length,
      })),
      activity: auditRes.data ?? [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
