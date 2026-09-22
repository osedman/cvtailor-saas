/**
 * The handover pack, as the employer contact it was delivered to sees it
 * (Figma frame 23, band F · 22 Sep 2026).
 *
 * DISCLOSURE: the sealed snapshot only, and only once delivered, and only to
 * the contact it was delivered TO — another hiring manager on the same role
 * gets "not yet". Never the recruiter's live working record.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { listClientRoles } from "@/lib/agency/client-header"
import { agencyAdmin } from "@/lib/agency/db"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const tie = (await listClientRoles(auth.ctx)).find((t) => t.roleId === roleId)
    if (!tie) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    const mine = auth.ctx.links.filter((l) => l.agencyId === tie.agencyId).map((l) => l.contactId)
    if (mine.length === 0) return NextResponse.json({ status: "not_yet" })

    const { data, error } = await agencyAdmin()
      .from("handover_packs")
      .select("snapshot, delivered_at")
      .eq("agency_id", tie.agencyId)
      .eq("role_id", roleId)
      .not("delivered_at", "is", null)
      .in("delivered_to_contact_id", mine)
      .order("delivered_at", { ascending: false })
      .limit(1)
    if (error) throw error
    const pack = data?.[0]
    if (!pack) return NextResponse.json({ status: "not_yet" })
    return NextResponse.json({ status: "delivered", deliveredAt: pack.delivered_at, snapshot: pack.snapshot })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
