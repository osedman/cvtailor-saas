import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agencyAdmin } from "@/lib/agency/db"
import { readDbRole, requireAdmin } from "@/lib/admin-access"
import { isUuid, validReason } from "@/lib/admin-agencies"
import { logAdminAction } from "@/lib/admin-log"
import { resolveAdminRole } from "@/lib/admin-roles"
import { SUSPEND_DURATION, isSuspended, isUserAction, userActionRefusal } from "@/lib/admin-users"
import { anonRateLimitId } from "@/lib/rate-limit"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

type Ctx = { params: Promise<{ id: string }> }
type Admin = ReturnType<typeof createAdminClient>

/**
 * One consumer account, for support. Support and up.
 *
 * GET  — who they are, how they use the product (counts only), where their
 *        limits stand, and which other hats they hold. Deliberately NO CV
 *        text, job descriptions, tailored output, career path or tracker
 *        content, and no IP addresses or user agents.
 * POST — one of the five actions in lib/admin-users.ts. Two-step, reason.
 *        Each is checked against the same rule the screen uses, then verified
 *        by reading the result back, then logged.
 */

/** Every rate-limit identity that belongs to this person: their own id (AI
 * use, uploads, invites) and the per-address sign-in counters for each door
 * (keyed the way app/api/auth/request-otp/route.ts keys them). */
function limitIds(userId: string, email: string | null): string[] {
  const ids = [userId]
  if (email) for (const door of ["consumer", "business"]) ids.push(anonRateLimitId(`email:${door}:${email}`))
  return ids
}

async function loadUser(admin: Admin, id: string) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, email, full_name, plan, tailors_used, created_at")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  if (!profile) return null

  const email = (profile.email as string | null) ?? null
  const [auth, limits, mailing, dbRole] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin.from("rate_limits").select("key, count, window_start").in("user_id", limitIds(id, email)),
    email
      ? admin.from("mailing_list").select("subscribed").eq("email", email).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    readDbRole(id),
  ])
  if (limits.error) throw limits.error
  if (mailing.error) throw mailing.error
  const authUser = auth.data?.user ?? null
  const bannedUntil = (authUser as { banned_until?: string | null } | null)?.banned_until ?? null

  return {
    profile: {
      id: profile.id as string,
      email,
      name: (profile.full_name as string | null) ?? null,
      plan: profile.plan as string,
      tailorsUsed: (profile.tailors_used as number) ?? 0,
      createdAt: profile.created_at as string,
    },
    lastSignInAt: authUser?.last_sign_in_at ?? null,
    emailConfirmed: Boolean(authUser?.email_confirmed_at),
    suspended: isSuspended(bannedUntil),
    limits: (limits.data ?? []) as Array<{ key: string; count: number; window_start: string }>,
    subscribed: mailing.data ? Boolean(mailing.data.subscribed) : null,
    adminRole: resolveAdminRole(email, dbRole),
  }
}

async function GET_handler(_req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("support")
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const admin = createAdminClient()
    const user = await loadUser(admin, id)
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const db = agencyAdmin()
    const count = (table: string) => admin.from(table).select("*", { count: "exact", head: true }).eq("user_id", id)
    const [tailors, tracked, logins, memberships, contacts] = await Promise.all([
      count("tailor_history"),
      count("job_tracker"),
      // Timestamps only: this table also holds IP and user agent, never selected here.
      admin.from("login_events").select("created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(5),
      db.from("members").select("agency_id, role, status").eq("user_id", id),
      db.from("client_contacts").select("agency_id, company").eq("user_id", id),
    ])
    const agencyIds = [...new Set([
      ...((memberships.data ?? []) as Array<{ agency_id: string }>).map((m) => m.agency_id),
      ...((contacts.data ?? []) as Array<{ agency_id: string }>).map((c) => c.agency_id),
    ])]
    const { data: agencies } = agencyIds.length
      ? await db.from("agencies").select("id, name").in("id", agencyIds)
      : { data: [] }
    const agencyName = new Map(((agencies ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name]))

    return NextResponse.json({
      user: {
        ...user.profile,
        lastSignInAt: user.lastSignInAt,
        emailConfirmed: user.emailConfirmed,
        suspended: user.suspended,
        subscribed: user.subscribed,
        adminRole: user.adminRole,
        isYou: id === gate.admin.userId,
      },
      activity: {
        tailors: tailors.count ?? 0,
        trackedJobs: tracked.count ?? 0,
        recentSignIns: ((logins.data ?? []) as Array<{ created_at: string }>).map((l) => l.created_at),
      },
      limits: user.limits.map((l) => ({ key: l.key, count: l.count, since: l.window_start })),
      hats: {
        memberships: ((memberships.data ?? []) as Array<{ agency_id: string; role: string; status: string }>).map((m) => ({
          agencyId: m.agency_id, agency: agencyName.get(m.agency_id) ?? "Unknown agency", role: m.role, status: m.status,
        })),
        clientOf: ((contacts.data ?? []) as Array<{ agency_id: string; company: string }>).map((c) => ({
          agencyId: c.agency_id, agency: agencyName.get(c.agency_id) ?? "Unknown agency", company: c.company,
        })),
      },
    })
  } catch (err) {
    console.error("[admin/users/[id] GET]", errorMessage(err))
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

async function POST_handler(req: NextRequest, { params }: Ctx) {
  try {
    const gate = await requireAdmin("support", { twoStep: true })
    if (!gate.ok) return gate.response
    const { id } = await params
    if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!isUserAction(body?.action)) return NextResponse.json({ error: "Invalid request." }, { status: 400 })
    if (!validReason(body?.reason)) {
      return NextResponse.json({ error: "Give a short reason for this change." }, { status: 400 })
    }
    const action = body.action
    const reason = body.reason

    const admin = createAdminClient()
    const user = await loadUser(admin, id)
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const refusal = userActionRefusal({
      action,
      actorId: gate.admin.userId,
      targetId: id,
      targetAdminRole: user.adminRole,
      suspended: user.suspended,
      subscribed: user.subscribed,
      tailorsUsed: user.profile.tailorsUsed,
      activeLimitCounters: user.limits.length,
    })
    if (refusal) return NextResponse.json({ error: refusal }, { status: 409 })

    const log = (name: string, from: Record<string, unknown> | null, to: Record<string, unknown> | null) =>
      logAdminAction({ actorId: gate.admin.userId, area: "users", action: name, targetType: "user", targetId: id, reason, from, to })
    const failed = () => new Error("The change did not take effect.")

    if (action === "reset_limits") {
      const ids = limitIds(id, user.profile.email)
      const { error } = await admin.from("rate_limits").delete().in("user_id", ids)
      if (error) throw error
      const { count } = await admin.from("rate_limits").select("*", { count: "exact", head: true }).in("user_id", ids)
      if ((count ?? 0) > 0) throw failed()
      await log("limits_reset", { counters: user.limits.length }, { counters: 0 })
    } else if (action === "reset_usage") {
      const { error } = await admin.from("profiles").update({ tailors_used: 0 }).eq("id", id)
      if (error) throw error
      const { data } = await admin.from("profiles").select("tailors_used").eq("id", id).single()
      if (data?.tailors_used !== 0) throw failed()
      await log("usage_reset", { tailors_used: user.profile.tailorsUsed }, { tailors_used: 0 })
    } else if (action === "suspend" || action === "reinstate") {
      const { error } = await admin.auth.admin.updateUserById(id, {
        ban_duration: action === "suspend" ? SUSPEND_DURATION : "none",
      })
      if (error) throw error
      const { data } = await admin.auth.admin.getUserById(id)
      const now = isSuspended((data?.user as { banned_until?: string | null } | null)?.banned_until ?? null)
      if (now !== (action === "suspend")) throw failed()
      await log(action === "suspend" ? "suspended" : "reinstated", { suspended: !now }, { suspended: now })
    } else {
      const email = user.profile.email as string
      const { error } = await admin.from("mailing_list").update({ subscribed: false }).eq("email", email)
      if (error) throw error
      const { data } = await admin.from("mailing_list").select("subscribed").eq("email", email).maybeSingle()
      if (data?.subscribed !== false) throw failed()
      await log("unsubscribed", { subscribed: true }, { subscribed: false })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[admin/users/[id] POST]", errorMessage(err))
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export const GET = withTiming("/api/admin/users/[id]", "GET", GET_handler)
export const POST = withTiming("/api/admin/users/[id]", "POST", POST_handler)
