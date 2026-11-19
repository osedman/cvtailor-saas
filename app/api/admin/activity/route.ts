import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agencyAdmin } from "@/lib/agency/db"
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

    // Names for the people and agencies involved. Entries about an agency
    // member carry that member's id inside from/to (user_id, or owner_id on
    // creation); it is resolved to a name here and never sent as an id.
    const subjectId = (r: AuditRow): string | null => {
      for (const v of [r.to_value, r.from_value]) {
        if (v && typeof v === "object") {
          const o = v as Record<string, unknown>
          const id = o.user_id ?? o.owner_id
          if (typeof id === "string") return id
        }
      }
      return null
    }
    const strip = (v: unknown): unknown => {
      if (!v || typeof v !== "object") return v
      const { user_id: _u, owner_id: _o, ...rest } = v as Record<string, unknown>
      void _u; void _o
      return rest
    }
    const ids = new Set<string>()
    const agencyIds = new Set<string>()
    for (const r of rows) {
      ids.add(r.actor_id)
      if (r.target_type === "user" && r.target_id) ids.add(r.target_id)
      if (r.target_type === "agency" && r.target_id) agencyIds.add(r.target_id)
      const subject = subjectId(r)
      if (subject) ids.add(subject)
    }
    const [{ data: profiles }, { data: agencies }] = await Promise.all([
      ids.size
        ? admin.from("profiles").select("id, email, full_name").in("id", [...ids])
        : Promise.resolve({ data: [] }),
      agencyIds.size
        ? agencyAdmin().from("agencies").select("id, name").in("id", [...agencyIds])
        : Promise.resolve({ data: [] }),
    ])
    const nameById = new Map<string, string>()
    for (const p of (profiles ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>) {
      nameById.set(p.id, p.full_name || p.email || "Unknown")
    }
    const agencyById = new Map<string, string>()
    for (const a of (agencies ?? []) as Array<{ id: string; name: string }>) agencyById.set(a.id, a.name)
    const targetName = (r: AuditRow): string => {
      if (r.target_type === "user") return nameById.get(r.target_id) ?? "Deleted account"
      if (r.target_type === "agency") return agencyById.get(r.target_id) ?? "Deleted agency"
      return r.target_id
    }

    return NextResponse.json({
      entries: rows.map((r) => ({
        id: r.id,
        area: r.area,
        action: r.action,
        actorName: nameById.get(r.actor_id) ?? "Deleted account",
        targetType: r.target_type,
        targetName: targetName(r),
        subjectName: subjectId(r) ? nameById.get(subjectId(r) as string) ?? "Deleted account" : null,
        from: strip(r.from_value),
        to: strip(r.to_value),
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
