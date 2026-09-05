/**
 * The client's decisions on their shortlist, from the workspace. Written
 * exactly as the portal writes them — a client_actions row per candidate
 * against the recipient row, audit coupled — so the recruiter sees one
 * kind of signal. A candidate already decided is skipped, never overwritten.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { recordClientDecisions, type ClientDecisionAction } from "@/lib/agency/client-shortlist"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const body = await req.json().catch(() => ({}))
    const raw = Array.isArray(body?.decisions) ? (body.decisions as Array<{ ref?: unknown; action?: unknown }>) : []
    const decisions = raw
      .filter((d) => typeof d.ref === "string" && (d.action === "interview" || d.action === "decline"))
      .slice(0, 50)
      .map((d) => ({ ref: String(d.ref).slice(0, 20), action: d.action as ClientDecisionAction }))
    if (decisions.length === 0) return NextResponse.json({ error: "decisions are required" }, { status: 400 })
    const result = await recordClientDecisions(auth.ctx, roleId, decisions)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
