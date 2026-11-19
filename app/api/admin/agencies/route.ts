import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { agencyAdmin } from "@/lib/agency/db"
import { requireAdmin } from "@/lib/admin-access"
import { parseNewAgency } from "@/lib/admin-agencies"
import { resolveOrInviteAccount, rpcRefusal, sendAgencyAccessEmail } from "@/lib/admin-agency-server"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 30

/**
 * Agencies, for the admin area.
 *
 * GET  — every agency with its team and open-role counts. Support and up.
 *        Counts only: no role detail, no candidate data.
 * POST — create an agency with its first owner. Admin, two-step, reason.
 *        Replaces the hand-written SQL every new agency used to need. The
 *        owner is matched by email or invited (unconfirmed until they click),
 *        and admin_create_agency() writes the agency, the membership and both
 *        audit rows in one transaction.
 */
async function GET_handler(req: NextRequest) {
  try {
    const gate = await requireAdmin("support")
    if (!gate.ok) return gate.response

    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80)
    const db = agencyAdmin()
    let query = db
      .from("agencies")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
    // Strip PostgREST's or()/ilike delimiters before interpolating.
    const safe = q.replace(/[,()%*\\]/g, " ").trim()
    if (safe) query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)
    const { data: agencies, error } = await query
    if (error) throw error

    const ids = (agencies ?? []).map((a: { id: string }) => a.id)
    const [membersRes, rolesRes] = ids.length
      ? await Promise.all([
          db.from("members").select("agency_id, role, status").in("agency_id", ids),
          db.from("job_roles").select("agency_id, status").in("agency_id", ids).is("discarded_at", null),
        ])
      : [{ data: [], error: null }, { data: [], error: null }]
    if (membersRes.error) throw membersRes.error
    if (rolesRes.error) throw rolesRes.error

    const tally = new Map<string, { members: number; owners: number; openRoles: number }>()
    const at = (id: string) => {
      let t = tally.get(id)
      if (!t) tally.set(id, (t = { members: 0, owners: 0, openRoles: 0 }))
      return t
    }
    for (const m of (membersRes.data ?? []) as Array<{ agency_id: string; role: string; status: string }>) {
      if (m.status !== "active") continue
      at(m.agency_id).members += 1
      if (m.role === "owner") at(m.agency_id).owners += 1
    }
    for (const r of (rolesRes.data ?? []) as Array<{ agency_id: string; status: string }>) {
      if (r.status !== "closed") at(r.agency_id).openRoles += 1
    }

    return NextResponse.json({
      agencies: (agencies ?? []).map((a: { id: string; name: string; slug: string; created_at: string }) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        createdAt: a.created_at,
        ...at(a.id),
      })),
    })
  } catch (err) {
    console.error("[admin/agencies GET]", err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

async function POST_handler(req: NextRequest) {
  try {
    const gate = await requireAdmin("admin", { twoStep: true })
    if (!gate.ok) return gate.response

    const input = parseNewAgency((await req.json().catch(() => null)) as Record<string, unknown> | null)
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 })

    // Check the short name BEFORE creating an account for the owner, so a
    // clash never leaves a stray invited user behind.
    const db = agencyAdmin()
    const { data: clash } = await db.from("agencies").select("id").eq("slug", input.slug).maybeSingle()
    if (clash) {
      return NextResponse.json(
        { error: "Another agency already uses that short name. Choose a different one." },
        { status: 409 }
      )
    }

    const owner = await resolveOrInviteAccount(input.ownerEmail)
    const admin = createAdminClient()
    const { data: agencyId, error } = await admin.rpc("admin_create_agency", {
      p_actor: gate.admin.userId,
      p_name: input.name,
      p_slug: input.slug,
      p_owner: owner.userId,
      p_reason: input.reason,
    })
    if (error) {
      const refusal = rpcRefusal(error)
      if (refusal) return refusal
      throw error
    }

    // Verify the effect, not the status: the agency and its owner must exist.
    const { data: member, error: readErr } = await db
      .from("members")
      .select("role, status")
      .eq("agency_id", agencyId as string)
      .eq("user_id", owner.userId)
      .maybeSingle()
    if (readErr) throw readErr
    if (member?.role !== "owner" || member?.status !== "active") {
      throw new Error("The agency was not created correctly.")
    }

    const email = await sendAgencyAccessEmail({
      to: input.ownerEmail,
      agencyName: input.name,
      role: "owner",
      inviteHash: owner.inviteHash,
    })
    return NextResponse.json({ id: agencyId, slug: input.slug, email }, { status: 201 })
  } catch (err) {
    console.error("[admin/agencies POST]", err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export const GET = withTiming("/api/admin/agencies", "GET", GET_handler)
export const POST = withTiming("/api/admin/agencies", "POST", POST_handler)
