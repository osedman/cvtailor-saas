/**
 * Team management. Agency creation stays manual; teammates are self serve.
 *
 * GET    — the member list with names, for any member.
 * POST   — owner invites by email: existing Tailr users are matched by
 *          profile, new addresses get an account created (no password; they
 *          sign in with the normal magic link flow and land in the agency).
 *          Audit logged; a plain notification email goes to the invitee.
 * PATCH  — owner changes a member's role or suspends/reactivates them.
 *          Suspension revokes access immediately (member_agency_ids only
 *          returns active rows) but never erases their audit history.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"
import { agencyAdmin, requireAgencyContext, writeAudit } from "@/lib/agency/db"

export const maxDuration = 30

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const { data: members, error } = await auth.db
      .from("members")
      .select("user_id, role, status, created_at")
      .eq("agency_id", auth.ctx.agencyId)
      .order("created_at")
    if (error) throw error

    // Names live in public.profiles; the agency-bound client can't cross
    // schemas, so resolve them with the public admin client.
    const publicAdmin = createAdminClient()
    const ids = (members ?? []).map((m) => m.user_id)
    const { data: profiles } = ids.length
      ? await publicAdmin.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] }
    const profileById = new Map((profiles ?? []).map((p: { id: string }) => [p.id, p]))

    return NextResponse.json({
      members: (members ?? []).map((m) => ({
        ...m,
        profile: profileById.get(m.user_id) ?? null,
      })),
      caller_role: auth.ctx.role,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role !== "owner") {
      return NextResponse.json({ error: "Only owners can invite teammates" }, { status: 403 })
    }

    const body = await req.json()
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const role = body?.role
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 })
    }
    if (!["recruiter", "viewer"].includes(role)) {
      return NextResponse.json({ error: "Role must be recruiter or viewer" }, { status: 400 })
    }

    // Match an existing Tailr account by email, otherwise create one. New
    // accounts have no password; the normal magic link flow signs them in.
    const publicAdmin = createAdminClient()
    const { data: existing } = await publicAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle()

    let userId = existing?.id as string | undefined
    if (!userId) {
      const { data: created, error: createError } = await publicAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
      })
      if (createError) throw createError
      userId = created.user?.id
    }
    if (!userId) throw new Error("Could not resolve or create the invitee account")

    const admin = agencyAdmin()
    const { error: memberError } = await admin.from("members").upsert(
      {
        agency_id: auth.ctx.agencyId,
        user_id: userId,
        role,
        status: "active",
        invited_by: auth.ctx.userId,
      },
      { onConflict: "agency_id,user_id" }
    )
    if (memberError) throw memberError

    await writeAudit(admin, {
      agencyId: auth.ctx.agencyId,
      actorId: auth.ctx.userId,
      entityType: "member",
      entityRef: userId,
      action: "invited",
      toValue: { role },
    })

    const { data: agencyRow } = await admin
      .from("agencies")
      .select("name")
      .eq("id", auth.ctx.agencyId)
      .single()
    const origin = req.nextUrl.origin
    await sendEmail({
      to: email,
      subject: `You have been added to ${agencyRow?.name ?? "an agency"} on Tailr`,
      html: `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#1e1813;padding:32px 28px;"><p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#dc4f33;font-weight:700;">Tailr for Agencies</p><h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">You are on the team.</h1><p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(agencyRow?.name ?? "An agency")} has added you as a ${role} on Tailr. There is no password. Sign in with this email address and a login link arrives in your inbox.</p><p style="margin:0 0 16px;"><a href="${origin}/login" style="display:inline-block;background:#1e1813;color:#fffdfa;border-radius:8px;padding:10px 16px;font-weight:600;text-decoration:none;">Sign in to Tailr</a></p></div>`,
    })

    return NextResponse.json({ added: true, role }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role !== "owner") {
      return NextResponse.json({ error: "Only owners can change the team" }, { status: 403 })
    }

    const body = await req.json()
    const userId = typeof body?.user_id === "string" ? body.user_id : ""
    if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 })
    if (userId === auth.ctx.userId) {
      return NextResponse.json({ error: "Owners cannot change their own membership" }, { status: 400 })
    }

    const patch: Record<string, string> = {}
    if (["owner", "recruiter", "viewer"].includes(body?.role)) patch.role = body.role
    if (["active", "suspended"].includes(body?.status)) patch.status = body.status
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
    }

    const admin = agencyAdmin()
    const { data: before, error: beforeError } = await admin
      .from("members")
      .select("role, status")
      .eq("agency_id", auth.ctx.agencyId)
      .eq("user_id", userId)
      .maybeSingle()
    if (beforeError) throw beforeError
    if (!before) return NextResponse.json({ error: "Not a member of your agency" }, { status: 404 })

    const { error } = await admin
      .from("members")
      .update(patch)
      .eq("agency_id", auth.ctx.agencyId)
      .eq("user_id", userId)
    if (error) throw error

    await writeAudit(admin, {
      agencyId: auth.ctx.agencyId,
      actorId: auth.ctx.userId,
      entityType: "member",
      entityRef: userId,
      action: patch.status === "suspended" ? "suspended" : "changed",
      fromValue: before,
      toValue: patch,
    })

    return NextResponse.json({ updated: patch })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
