/**
 * The handover checklist for one candidate on one role: read it, or resolve
 * one item. Resolutions are audit-coupled in lib/agency/handover-checklist.ts;
 * the PATCH route on ../handover refuses delivery while anything is open.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { getChecklist, resolveChecklistItem, type ChecklistItemKey, type ChecklistState } from "@/lib/agency/handover-checklist"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const candidateId = req.nextUrl.searchParams.get("candidateId") ?? ""
    if (!candidateId) return NextResponse.json({ error: "candidateId is required" }, { status: 400 })
    const items = await getChecklist(auth.ctx, roleId, candidateId)
    return NextResponse.json({ items, complete: items.every((i) => i.resolved) })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (auth.ctx.role === "viewer") return NextResponse.json({ error: "Viewers cannot resolve checklist items" }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const candidateId = typeof body?.candidateId === "string" ? body.candidateId : ""
    const item = typeof body?.item === "string" ? (body.item as ChecklistItemKey) : null
    const state = typeof body?.state === "string" ? (body.state as ChecklistState) : null
    if (!candidateId || !item || !state || !["done", "waived", "not_applicable"].includes(state)) {
      return NextResponse.json({ error: "candidateId, item and state are required" }, { status: 400 })
    }
    const items = await resolveChecklistItem(auth.ctx, { roleId, candidateId, item, state, reason: typeof body?.reason === "string" ? body.reason : "" })
    return NextResponse.json({ items, complete: items.every((i) => i.resolved) })
  } catch (error) {
    if (error instanceof AgencyAccessError) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
