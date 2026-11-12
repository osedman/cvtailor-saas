import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/admin-access"
import { isAuditArea } from "@/lib/admin-roles"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

const PAGE_SIZE = 50

interface AuditRow {
  id: number
  actor_id: string
  area: string
  action: string
  target_type: string
  target_id: string
  from_value: unknown
  to_value: unknown
  reason: string
  created_at: string
}

/**
 * The admin audit log, newest first — support level and up.
 *
 * Read-only by construction: there is no write handler here, and the service
 * role holds only SELECT and INSERT on the table. Entries are written by the
 * action that made the change (e.g. admin_set_platform_admin), never by this
 * route.
 *
 * ?area=admins|users|agencies|config   optional filter
 * ?page=0                              50 per page
 */
async function GET_handler(req: NextRequest) {
  try {
    const gate = await requireAdmin("support")
    if (!gate.ok) return gate.response

    const params = req.nextUrl.searchParams
    const area = params.get("area")
    const page = Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0)

    const admin = createAdminClient()
    let query = admin
      .from("admin_audit_log")
      .select("id, actor_id, area, action, target_type, target_id, from_value, to_value, reason, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (isAuditArea(area)) query = query.eq("area", area)

    const { data, error, count } = await query
    if (error) throw error
    const rows = (data ?? []) as AuditRow[]

    // Names for the people involved: actors, and targets that are users.
    const ids = new Set<string>()
    for (const r of rows) {
      ids.add(r.actor_id)
      if (r.target_type === "user" && r.target_id) ids.add(r.target_id)
    }
    const { data: profiles } = ids.size
      ? await admin.from("profiles").select("id, email, full_name").in("id", [...ids])
      : { data: [] }
    const nameById = new Map<string, string>()
    for (const p of (profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>) {
      nameById.set(p.id, p.full_name || p.email || "Unknown")
    }

    return NextResponse.json({
      entries: rows.map((r) => ({
        id: r.id,
        area: r.area,
        action: r.action,
        actorName: nameById.get(r.actor_id) ?? "Deleted account",
        targetType: r.target_type,
        targetName: r.target_type === "user" ? nameById.get(r.target_id) ?? "Deleted account" : r.target_id,
        from: r.from_value,
        to: r.to_value,
        reason: r.reason,
        at: r.created_at,
      })),
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    })
  } catch (err) {
    console.error("[admin/activity GET]", err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export const GET = withTiming("/api/admin/activity", "GET", GET_handler)
