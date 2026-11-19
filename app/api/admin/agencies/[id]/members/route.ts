import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agencyAdmin } from "@/lib/agency/db"
import { requireAdmin } from "@/lib/admin-access"
import {
  isAgencyMemberRole,
  isAgencyMemberStatus,
  isUuid,
  normaliseEmail,
  validReason,
  type AgencyMemberRole,
} from "@/lib/admin-agencies"
import { resolveOrInviteAccount, rpcRefusal, sendAgencyAccessEmail } from "@/lib/admin-agency-server"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

type Ctx = { params: Promise<{ id: string }> }

/**
 * An agency's team, changed from the admin area. Support and up, two-step,
 * reason required.
 *
 * POST  — add someone by email in any role, owner included. This is the fix
 *         for "our only owner has left / is locked out", which nobody inside
 *         the agency can make.
 * PATCH — change a member's role, or suspend / reactivate them.
 *
 * There is no DELETE: access is removed by suspension, which revokes it
 * immediately and keeps the person's audit history — the same rule the
 * owner-facing team screen follows. And an agency can never be left without
 * an active owner; admin_set_agency_member() refuses, whatever is sent here.
 */
async function change(
  actorId: string,
  agencyId: string,
  userId: string,
  role: AgencyMemberRole | null,
  status: "active" | "suspended" | null,
  reason: string
): Promise<{ refusal: NextResponse } | { role: string; status: string; action: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("admin_set_agency_member", {
    p_actor: actorId,
    p_agency: agencyId,
    p_user: userId,
    p_role: role,
    p_status: status,
    p_reason: reason.trim(),
  })
  if (error) {
    const refusal = rpcRefusal(error)
    if (refusal) return { refusal }
    throw error
  }

  // Verify the effect: the membership row must now read what was asked.
  const { data: row, error: readErr } = await agencyAdmin()
    .from("members")
    .select("role, status")
    .eq("agency_id", agencyId)
    .eq("user_id", userId)
    .maybeSingle()
  if (readErr) throw readErr
  const want = data as { role: string; status: string; action: string }
  if (!row || row.role !== want.role || row.status !== want.status) {
    throw new Error("The change did not take effect.")
  }
  return want
}

async function POST_handler(req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("support", { twoStep: true })
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const email = normaliseEmail(body?.email)
    if (!email) return NextResponse.json({ error: "Enter their email address." }, { status: 400 })
    if (!isAgencyMemberRole(body?.role)) {
      return NextResponse.json({ error: "Choose Owner, Recruiter or Viewer." }, { status: 400 })
    }
    if (!validReason(body?.reason)) {
      return NextResponse.json({ error: "Give a short reason for this change." }, { status: 400 })
    }

    // The agency must exist before an account is created for the invitee.
    const { data: agency, error: agencyErr } = await agencyAdmin()
      .from("agencies").select("name").eq("id", id).maybeSingle()
    if (agencyErr) throw agencyErr
    if (!agency) return NextResponse.json({ error: "That agency no longer exists." }, { status: 404 })

    const account = await resolveOrInviteAccount(email)
    const result = await change(gate.admin.userId, id, account.userId, body.role, "active", body.reason)
    if ("refusal" in result) return result.refusal

    const mail = await sendAgencyAccessEmail({
      to: email,
      agencyName: agency.name as string,
      role: body.role,
      inviteHash: account.inviteHash,
    })
    return NextResponse.json({ ok: true, ...result, email: mail }, { status: 201 })
  } catch (err) {
    console.error("[admin/agencies/[id]/members POST]", err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

async function PATCH_handler(req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("support", { twoStep: true })
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!isUuid(body?.userId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    const role = body?.role === undefined || body?.role === null ? null : body.role
    const status = body?.status === undefined || body?.status === null ? null : body.status
    if (role !== null && !isAgencyMemberRole(role)) {
      return NextResponse.json({ error: "Choose Owner, Recruiter or Viewer." }, { status: 400 })
    }
    if (status !== null && !isAgencyMemberStatus(status)) {
      return NextResponse.json({ error: "Choose active or suspended." }, { status: 400 })
    }
    if (role === null && status === null) return NextResponse.json({ error: "Nothing to change." }, { status: 400 })
    if (!validReason(body?.reason)) {
      return NextResponse.json({ error: "Give a short reason for this change." }, { status: 400 })
    }

    // PATCH changes an existing member; adding someone is POST's job.
    const { data: existing, error: existErr } = await agencyAdmin()
      .from("members").select("user_id").eq("agency_id", id).eq("user_id", body.userId).maybeSingle()
    if (existErr) throw existErr
    if (!existing) return NextResponse.json({ error: "They are not a member of this agency." }, { status: 404 })

    const result = await change(gate.admin.userId, id, body.userId, role, status, body.reason)
    if ("refusal" in result) return result.refusal
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error("[admin/agencies/[id]/members PATCH]", err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export const POST = withTiming("/api/admin/agencies/[id]/members", "POST", POST_handler)
export const PATCH = withTiming("/api/admin/agencies/[id]/members", "PATCH", PATCH_handler)
