/**
 * Who currently holds a link to this role's shortlist, and the control to
 * withdraw one.
 *
 * GET  → every recipient across the role's submissions, with whether the link
 *        is still live. No raw tokens: they existed once, in one response.
 * POST { recipientId } → revoke it. The portal already refuses a revoked row,
 *        so this is the half that was missing rather than a new check.
 *
 * Writes are audit-coupled and live in lib/agency/recipients, not here.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { listRecipientsForRole, revokeRecipient } from "@/lib/agency/recipients"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const recipients = await listRecipientsForRole(auth.ctx, roleId)
    return NextResponse.json({ recipients })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { recipientId?: unknown }
    const recipientId = typeof body.recipientId === "string" ? body.recipientId : ""
    if (!recipientId) {
      return NextResponse.json({ error: "recipientId is required" }, { status: 400 })
    }

    const { alreadyRevoked } = await revokeRecipient(auth.ctx, recipientId)
    return NextResponse.json({ ok: true, alreadyRevoked })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}
