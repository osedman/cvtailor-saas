import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agencyAdmin } from "@/lib/agency/db"
import { requireAdmin } from "@/lib/admin-access"
import { isUuid, parseAgencySettings } from "@/lib/admin-agencies"
import { rpcRefusal } from "@/lib/admin-agency-server"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

type Ctx = { params: Promise<{ id: string }> }

/**
 * One agency, for the admin area.
 *
 * GET   — settings, the team (names, emails, role, status, whether each has
 *         ever signed in) and a read-only list of roles: ref, title, client,
 *         status. Support and up. Deliberately NO candidates, CVs, notes or
 *         job descriptions — an admin fixes access, they do not read the desk.
 * PATCH — name, retention window, notice delay. Admin, two-step, reason.
 *         admin_update_agency_settings() writes the change and both audit
 *         rows together.
 */
async function GET_handler(_req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("support")
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const db = agencyAdmin()
    const [agencyRes, membersRes, rolesRes] = await Promise.all([
      db.from("agencies").select("id, name, slug, retention_days, notice_delay_days, created_at").eq("id", id).maybeSingle(),
      db.from("members").select("user_id, role, status, created_at").eq("agency_id", id).order("created_at"),
      db.from("job_roles")
        .select("id, ref, title, company, status, created_at")
        .eq("agency_id", id)
        .is("discarded_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
    ])
    if (agencyRes.error) throw agencyRes.error
    if (membersRes.error) throw membersRes.error
    if (rolesRes.error) throw rolesRes.error
    if (!agencyRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const members = (membersRes.data ?? []) as Array<{ user_id: string; role: string; status: string; created_at: string }>
    const admin = createAdminClient()
    const userIds = members.map((m) => m.user_id)
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id, email, full_name").in("id", userIds)
      : { data: [] }
    const byId = new Map(
      ((profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>).map((p) => [p.id, p])
    )
    const signedIn = new Map<string, boolean>()
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await admin.auth.admin.getUserById(uid)
        signedIn.set(uid, Boolean(data?.user?.last_sign_in_at))
      })
    )

    const a = agencyRes.data
    return NextResponse.json({
      agency: {
        id: a.id,
        name: a.name,
        slug: a.slug,
        retentionDays: a.retention_days,
        noticeDelayDays: a.notice_delay_days,
        createdAt: a.created_at,
      },
      members: members.map((m) => ({
        userId: m.user_id,
        name: byId.get(m.user_id)?.full_name ?? null,
        email: byId.get(m.user_id)?.email ?? null,
        role: m.role,
        status: m.status,
        addedAt: m.created_at,
        signedIn: signedIn.get(m.user_id) ?? false,
      })),
      roles: ((rolesRes.data ?? []) as Array<{ id: string; ref: string; title: string; company: string; status: string; created_at: string }>).map((r) => ({
        id: r.id,
        ref: r.ref,
        title: r.title,
        company: r.company,
        status: r.status,
        createdAt: r.created_at,
      })),
    })
  } catch (err) {
    console.error("[admin/agencies/[id] GET]", err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

async function PATCH_handler(req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("admin", { twoStep: true })
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const input = parseAgencySettings((await req.json().catch(() => null)) as Record<string, unknown> | null)
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin.rpc("admin_update_agency_settings", {
      p_actor: gate.admin.userId,
      p_agency: id,
      p_name: input.name,
      p_retention: input.retentionDays,
      p_notice: input.noticeDelayDays,
      p_reason: input.reason,
    })
    if (error) {
      const refusal = rpcRefusal(error)
      if (refusal) return refusal
      throw error
    }

    // Verify the effect: read the row back rather than trusting the return.
    const { data: after, error: readErr } = await agencyAdmin()
      .from("agencies")
      .select("name, retention_days, notice_delay_days")
      .eq("id", id)
      .single()
    if (readErr) throw readErr
    const want = data as { name: string; retention_days: number; notice_delay_days: number }
    if (after.name !== want.name || after.retention_days !== want.retention_days || after.notice_delay_days !== want.notice_delay_days) {
      throw new Error("The change did not take effect.")
    }
    return NextResponse.json({
      ok: true,
      agency: { name: after.name, retentionDays: after.retention_days, noticeDelayDays: after.notice_delay_days },
    })
  } catch (err) {
    console.error("[admin/agencies/[id] PATCH]", err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export const GET = withTiming("/api/admin/agencies/[id]", "GET", GET_handler)
export const PATCH = withTiming("/api/admin/agencies/[id]", "PATCH", PATCH_handler)
