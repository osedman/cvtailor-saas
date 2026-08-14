/**
 * Generate and hand over the pack.
 *
 * POST { candidateId, contactId? }        → freeze a pack
 * PATCH { packId, contactId }             → mark it delivered
 *
 * The snapshot is frozen in lib/agency/handover; this route never re-derives
 * it, because a pack that changes after it was handed over is not a handover.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { generateHandoverPack, deliverHandoverPack } from "@/lib/agency/handover"

export const maxDuration = 30

function authFail(f: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: f === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: f === "unauthenticated" ? 401 : 403 }
  )
}
function fail(e: unknown) {
  if (e instanceof AgencyAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
  return NextResponse.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status: 500 }
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const candidateId = typeof body.candidateId === "string" ? body.candidateId : ""
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId is required" }, { status: 400 })
    }
    const result = await generateHandoverPack(auth.ctx, {
      roleId,
      candidateId,
      contactId: typeof body.contactId === "string" ? body.contactId : null,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return fail(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const packId = typeof body.packId === "string" ? body.packId : ""
    const contactId = typeof body.contactId === "string" ? body.contactId : ""
    if (!packId || !contactId) {
      return NextResponse.json({ error: "packId and contactId are required" }, { status: 400 })
    }
    await deliverHandoverPack(auth.ctx, packId, contactId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
