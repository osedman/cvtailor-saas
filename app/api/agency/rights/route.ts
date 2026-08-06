/**
 * The agency's rights queue: the other half of the candidate rights flow.
 *
 * GET   the open and recently closed requests, with the candidate they belong
 *       to, so a recruiter can see what is owed and to whom.
 * PATCH action one: complete or reject it, with a note.
 *
 * Completing an erasure or an objection EXECUTES the erasure through
 * agency.purge_candidate, the same single implementation the retention cron
 * uses: the audit row survives with name, ref and outcome, the CV data does
 * not, and objections additionally suppress future processing of that
 * identity. Storage files are removed here because SQL cannot delete blobs.
 *
 * Rejecting is allowed but must carry a reason: a controller may lawfully
 * refuse some requests, and that refusal belongs on the record.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  agencyAdmin,
  assertWriter,
  requireAgencyContext,
  writeAudit,
} from "@/lib/agency/db"

export const maxDuration = 60

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

    const { data: requests, error } = await auth.db
      .from("rights_requests")
      .select("id, candidate_id, candidate_ref, kind, channel, status, requested_at, completed_at, note")
      .eq("agency_id", auth.ctx.agencyId)
      .order("requested_at", { ascending: false })
      .limit(50)
    if (error) throw error

    const ids = [...new Set((requests ?? []).map((r) => r.candidate_id).filter(Boolean))] as string[]
    const { data: candidates } = ids.length
      ? await auth.db.from("candidates").select("id, full_name, role_id").in("id", ids)
      : { data: [] }
    const byId = new Map((candidates ?? []).map((c) => [c.id, c]))

    return NextResponse.json({
      requests: (requests ?? []).map((r) => ({
        ...r,
        candidate_name: r.candidate_id ? byId.get(r.candidate_id)?.full_name ?? null : null,
        role_id: r.candidate_id ? byId.get(r.candidate_id)?.role_id ?? null : null,
      })),
    })
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
    assertWriter(auth.ctx)

    const body = await req.json()
    const requestId = typeof body?.request_id === "string" ? body.request_id : ""
    const outcome = body?.outcome
    const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : ""
    if (!requestId || !["completed", "rejected"].includes(outcome)) {
      return NextResponse.json({ error: "request_id and outcome are required" }, { status: 400 })
    }
    if (outcome === "rejected" && note.trim().length < 10) {
      return NextResponse.json(
        { error: "Refusing a request needs a recorded reason" },
        { status: 400 }
      )
    }

    const admin = agencyAdmin()
    const { data: request, error: loadError } = await admin
      .from("rights_requests")
      .select("id, agency_id, candidate_id, candidate_ref, kind, status")
      .eq("id", requestId)
      .maybeSingle()
    if (loadError) throw loadError
    if (!request || request.agency_id !== auth.ctx.agencyId) {
      return NextResponse.json({ error: "Request not found in your agency" }, { status: 404 })
    }
    if (request.status !== "pending") {
      return NextResponse.json({ error: `Already ${request.status}` }, { status: 400 })
    }

    let erased = false
    if (outcome === "completed" && ["erasure", "objection"].includes(request.kind) && request.candidate_id) {
      const { data: storagePath, error: purgeError } = await admin.rpc("purge_candidate", {
        p_candidate: request.candidate_id,
        p_reason: request.kind === "erasure" ? "erasure_request" : "objection",
      })
      if (purgeError) throw purgeError
      if (storagePath) {
        const { error: removeError } = await admin.storage.from("agency-cvs").remove([storagePath as string])
        if (removeError) console.error("[rights] storage removal failed:", removeError.message)
      }
      erased = true
    }

    const { error: updateError } = await admin
      .from("rights_requests")
      .update({ status: outcome, completed_at: new Date().toISOString(), note: note || undefined })
      .eq("id", requestId)
    if (updateError) throw updateError

    await writeAudit(admin, {
      agencyId: auth.ctx.agencyId,
      candidateId: erased ? null : request.candidate_id,
      actorId: auth.ctx.userId,
      entityType: "rights_request",
      entityRef: request.candidate_ref,
      action: outcome === "completed" ? `completed_${request.kind}` : `rejected_${request.kind}`,
      reason: note || undefined,
      toValue: erased ? { erased: true } : undefined,
    })

    return NextResponse.json({ outcome, erased })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
