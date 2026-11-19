import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/admin-access"
import { ADMIN_EMAILS, ADMIN_VIEWER_EMAILS } from "@/lib/admin"
import {
  ADMIN_CHANGE_MESSAGES,
  checkAdminChange,
  isAdminRole,
  roleNeedsTwoStep,
  type AdminRole,
} from "@/lib/admin-roles"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

/**
 * Who has admin access — admin level only.
 *
 * GET    — everyone with access: platform_admins rows, plus the people who
 *          hold it through the lists in lib/admin.ts (the break-glass owner
 *          and any legacy viewers), marked so the screen can show why they
 *          can't be removed here.
 * POST   — add by email. The person must already have a Tailr account; this
 *          never creates one.
 * PATCH  — change a role.
 * DELETE — remove.
 *
 * Every write needs two-step verification and a reason, and goes through
 * admin_set_platform_admin(), which writes the change and its audit row in
 * one transaction.
 */

type Admin = ReturnType<typeof createAdminClient>

interface Profile {
  id: string
  email: string | null
  full_name: string | null
}

/** Whether a person has a verified second factor. null = could not tell. */
async function hasTwoStep(admin: Admin, userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId })
    if (error) return null
    return (data?.factors ?? []).some((f: { status?: string }) => f.status === "verified")
  } catch {
    return null
  }
}

const RPC_MESSAGES: Record<string, { message: string; status: number }> = {
  cannot_change_self: { message: ADMIN_CHANGE_MESSAGES.cannot_change_self, status: 400 },
  invalid_role: { message: ADMIN_CHANGE_MESSAGES.invalid_role, status: 400 },
  reason_required: { message: ADMIN_CHANGE_MESSAGES.reason_required, status: 400 },
  not_an_admin: { message: "That person is not on the admin list.", status: 404 },
  no_change: { message: "They already have that role.", status: 409 },
}

async function applyChange(
  admin: Admin,
  actorId: string,
  target: Profile,
  nextRole: AdminRole | null,
  reason: string
): Promise<NextResponse> {
  const { data, error } = await admin.rpc("admin_set_platform_admin", {
    p_actor: actorId,
    p_target: target.id,
    p_role: nextRole,
    p_reason: reason.trim(),
  })
  if (error) {
    const known = Object.keys(RPC_MESSAGES).find((k) => error.message?.includes(k))
    if (known) {
      return NextResponse.json({ error: RPC_MESSAGES[known].message }, { status: RPC_MESSAGES[known].status })
    }
    throw error
  }

  // Verify the effect, not the status: read the row back.
  const { data: row, error: readErr } = await admin
    .from("platform_admins")
    .select("role")
    .eq("user_id", target.id)
    .maybeSingle()
  if (readErr) throw readErr
  const actual = isAdminRole(row?.role) ? row.role : null
  if (actual !== nextRole) {
    throw new Error("The change did not take effect.")
  }
  return NextResponse.json({ ok: true, action: data?.action ?? null, role: actual })
}

async function GET_handler() {
  try {
    const gate = await requireAdmin("admin")
    if (!gate.ok) return gate.response

    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from("platform_admins")
      .select("user_id, role, added_by, created_at")
      .order("created_at")
    if (error) throw error

    const codeEmails = [...ADMIN_EMAILS, ...ADMIN_VIEWER_EMAILS]
    const { data: codeProfiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("email", codeEmails)

    const ids = new Set<string>()
    for (const r of rows ?? []) {
      ids.add(r.user_id)
      if (r.added_by) ids.add(r.added_by)
    }
    const { data: profiles } = ids.size
      ? await admin.from("profiles").select("id, email, full_name").in("id", [...ids])
      : { data: [] as Profile[] }
    const byId = new Map<string, Profile>()
    for (const p of [...(profiles ?? []), ...(codeProfiles ?? [])] as Profile[]) byId.set(p.id, p)

    const rowByUser = new Map((rows ?? []).map((r: { user_id: string }) => [r.user_id, r]))
    const people: Array<{
      userId: string
      name: string | null
      email: string | null
      role: AdminRole
      source: "owner" | "list" | "code"
      addedAt: string | null
      addedByName: string | null
    }> = []

    // Owners first: admin by code whatever the table says.
    for (const p of (codeProfiles ?? []) as Profile[]) {
      const email = (p.email ?? "").toLowerCase()
      if (ADMIN_EMAILS.includes(email)) {
        people.push({ userId: p.id, name: p.full_name, email: p.email, role: "admin", source: "owner", addedAt: null, addedByName: null })
      }
    }
    const ownerIds = new Set(people.map((p) => p.userId))

    for (const r of rows ?? []) {
      if (ownerIds.has(r.user_id) || !isAdminRole(r.role)) continue
      const p = byId.get(r.user_id)
      const by = r.added_by ? byId.get(r.added_by) : null
      people.push({
        userId: r.user_id,
        name: p?.full_name ?? null,
        email: p?.email ?? null,
        role: r.role,
        source: "list",
        addedAt: r.created_at,
        addedByName: by ? by.full_name || by.email : null,
      })
    }

    // Legacy viewers with no row yet: they have access, so they are listed.
    for (const p of (codeProfiles ?? []) as Profile[]) {
      const email = (p.email ?? "").toLowerCase()
      if (ADMIN_VIEWER_EMAILS.includes(email) && !rowByUser.has(p.id) && !ownerIds.has(p.id)) {
        people.push({ userId: p.id, name: p.full_name, email: p.email, role: "viewer", source: "code", addedAt: null, addedByName: null })
      }
    }

    const twoStep = await Promise.all(people.map((p) => hasTwoStep(admin, p.userId)))
    return NextResponse.json({
      admins: people.map((p, i) => ({
        ...p,
        twoStep: twoStep[i],
        needsTwoStep: roleNeedsTwoStep(p.role),
        isYou: p.userId === gate.admin.userId,
      })),
    })
  } catch (err) {
    console.error("[admin/admins GET]", err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

async function write(req: NextRequest, mode: "add" | "change" | "remove") {
  try {
    const gate = await requireAdmin("admin", { twoStep: true })
    if (!gate.ok) return gate.response

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 })

    const admin = createAdminClient()
    let target: Profile | null = null
    if (mode === "add") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
      if (!email) return NextResponse.json({ error: "Enter their email address." }, { status: 400 })
      const { data } = await admin.from("profiles").select("id, email, full_name").eq("email", email).maybeSingle()
      target = (data as Profile | null) ?? null
      if (!target) {
        return NextResponse.json(
          { error: "No Tailr account uses that email. Ask them to sign in once, then add them." },
          { status: 404 }
        )
      }
    } else {
      const userId = typeof body.userId === "string" ? body.userId : ""
      if (!userId) return NextResponse.json({ error: "Invalid request." }, { status: 400 })
      const { data } = await admin.from("profiles").select("id, email, full_name").eq("id", userId).maybeSingle()
      target = (data as Profile | null) ?? { id: userId, email: null, full_name: null }
    }

    const nextRole = mode === "remove" ? null : body.role
    const refusal = checkAdminChange({
      actorId: gate.admin.userId,
      targetId: target.id,
      targetEmail: target.email,
      nextRole,
      reason: body.reason,
    })
    if (refusal) return NextResponse.json({ error: ADMIN_CHANGE_MESSAGES[refusal] }, { status: 400 })

    if (mode === "add") {
      const { data: existing } = await admin.from("platform_admins").select("role").eq("user_id", target.id).maybeSingle()
      if (existing) return NextResponse.json({ error: "They are already on the admin list." }, { status: 409 })
    }

    return await applyChange(admin, gate.admin.userId, target, nextRole as AdminRole | null, body.reason as string)
  } catch (err) {
    console.error(`[admin/admins ${mode}]`, err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

const POST_handler = (req: NextRequest) => write(req, "add")
const PATCH_handler = (req: NextRequest) => write(req, "change")
const DELETE_handler = (req: NextRequest) => write(req, "remove")

export const GET = withTiming("/api/admin/admins", "GET", GET_handler)
export const POST = withTiming("/api/admin/admins", "POST", POST_handler)
export const PATCH = withTiming("/api/admin/admins", "PATCH", PATCH_handler)
export const DELETE = withTiming("/api/admin/admins", "DELETE", DELETE_handler)
