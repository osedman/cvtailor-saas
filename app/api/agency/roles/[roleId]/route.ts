/**
 * One role: detail for the workflow shell, and intake field updates.
 * Field edits go through the user client so RLS enforces membership; the
 * jd_raw and recruiter_notes never leave the agency (the submission snapshot
 * is built elsewhere and excludes them).
 */

import { NextRequest, NextResponse } from "next/server"
import { agencyAdmin, getJobRole, requireAgencyContext, writeAudit } from "@/lib/agency/db"

export const maxDuration = 30

const FIELD_LIMITS: Record<string, number> = {
  title: 200,
  company: 200,
  company_context: 4000,
  salary_band: 200,
  location: 200,
  seniority: 100,
  jd_raw: 30_000,
  recruiter_notes: 8000,
}

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const role = await getJobRole(auth.db, auth.ctx, roleId)
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    const [requirements, constraints] = await Promise.all([
      auth.db
        .from("requirements")
        .select("id, ref, text, weight, category, origin, sort_order")
        .eq("role_id", roleId)
        .order("sort_order"),
      auth.db
        .from("role_constraints")
        .select("id, ref, text, kind, sort_order")
        .eq("role_id", roleId)
        .order("sort_order"),
    ])

    return NextResponse.json({
      role,
      requirements: requirements.data ?? [],
      constraints: constraints.data ?? [],
      caller_role: auth.ctx.role,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }

    const body = await req.json()
    const patch: Record<string, string> = {}
    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
      if (typeof body?.[field] === "string") patch[field] = body[field].slice(0, limit)
    }

    // Status is not a plain field edit. Closing a role starts the retention
    // clock on every candidate attached to it (DB trigger), so the change is
    // audit logged with the before value.
    const nextStatus = ["draft", "open", "submitted", "closed"].includes(body?.status)
      ? (body.status as string)
      : null
    const before = nextStatus ? await getJobRole(auth.db, auth.ctx, roleId) : null
    if (nextStatus && !before) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }
    if (nextStatus) patch.status = nextStatus

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
    }

    const { data, error } = await auth.db
      .from("job_roles")
      .update(patch)
      .eq("id", roleId)
      .eq("agency_id", auth.ctx.agencyId)
      .select("id, ref, title, status, closed_at, updated_at")
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    if (nextStatus && before && before.status !== nextStatus) {
      await writeAudit(agencyAdmin(), {
        agencyId: auth.ctx.agencyId,
        roleId,
        actorId: auth.ctx.userId,
        entityType: "role",
        entityRef: data.ref,
        action: nextStatus === "closed" ? "closed" : "status_changed",
        fromValue: { status: before.status },
        toValue: { status: nextStatus, closed_at: data.closed_at },
        reason:
          nextStatus === "closed"
            ? "retention clock started on all candidates for this role"
            : undefined,
      })
    }

    return NextResponse.json({ role: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
