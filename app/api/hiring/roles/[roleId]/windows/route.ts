/**
 * Offer several interview windows for one role at once. Each goes through
 * offerSlot's validation and audit; the batch exists so windows sized to
 * the candidates chosen land as one act, not N form submits.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { offerWindows } from "@/lib/agency/client-shortlist"
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
    const raw = Array.isArray(body?.windows) ? (body.windows as Array<{ start?: unknown; end?: unknown }>) : []
    const windows = raw.filter((w) => typeof w.start === "string" && typeof w.end === "string").map((w) => ({ start: String(w.start), end: String(w.end) }))
    if (windows.length === 0) return NextResponse.json({ error: "windows are required" }, { status: 400 })
    const result = await offerWindows(auth.ctx, roleId, windows)
    return NextResponse.json(result, { status: result.failed && result.offered.length === 0 ? 400 : 201 })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
