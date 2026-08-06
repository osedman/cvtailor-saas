/**
 * The candidate's own rights surface. Anonymous, reached by the capability
 * link in the Art 14 notice email.
 *
 * GET  tells the person plainly what is held about them and by whom. It shows
 *      their own name, the role they are being considered for, the agency,
 *      when the data arrived and when it expires. It never exposes the
 *      agency's assessment of them: scores, evidence strengths and recruiter
 *      notes are the agency's working record, not part of a subject access
 *      response served by a web page (a real access request is fulfilled by
 *      the agency, which is exactly what this files).
 *
 * POST files a request: access, rectification, erasure or objection. It always
 *      creates a PENDING row for the agency to action and never deletes
 *      anything itself, so a forwarded link cannot erase someone's record.
 *      Every filing is audit logged.
 */

import { NextRequest, NextResponse } from "next/server"
import { agencyAdmin, writeAudit } from "@/lib/agency/db"

export const maxDuration = 15

const KINDS = ["access", "rectification", "erasure", "objection"] as const

async function resolve(token: string) {
  if (!token || token.length < 24 || token.length > 96 || !/^[a-f0-9]+$/i.test(token)) return null
  const admin = agencyAdmin()
  const { data } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, ref, full_name, ingested_at, retention_expires_at, source")
    .eq("rights_token", token)
    .maybeSingle()
  if (!data) return null
  return { admin, candidate: data }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const resolved = await resolve(token)
    if (!resolved) {
      return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })
    }
    const { admin, candidate } = resolved

    const [{ data: agency }, { data: role }, { data: pending }] = await Promise.all([
      admin.from("agencies").select("name, retention_days, notice_reply_to").eq("id", candidate.agency_id).single(),
      admin.from("job_roles").select("title, location, status").eq("id", candidate.role_id).maybeSingle(),
      admin
        .from("rights_requests")
        .select("kind, status, requested_at")
        .eq("candidate_id", candidate.id)
        .order("requested_at", { ascending: false })
        .limit(5),
    ])

    return NextResponse.json({
      full_name: candidate.full_name,
      agency: agency?.name ?? "the agency",
      reply_to: agency?.notice_reply_to ?? null,
      role_title: role?.title ?? "a role",
      role_location: role?.location ?? "",
      role_open: role?.status !== "closed",
      held_since: candidate.ingested_at,
      source: candidate.source,
      retention_days: agency?.retention_days ?? 180,
      retention_expires_at: candidate.retention_expires_at,
      requests: pending ?? [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const resolved = await resolve(token)
    if (!resolved) {
      return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })
    }
    const { admin, candidate } = resolved

    const body = await req.json()
    const kind = body?.kind
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: "Unknown request type" }, { status: 400 })
    }
    const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : ""

    const { count } = await admin
      .from("rights_requests")
      .select("id", { count: "exact", head: true })
      .eq("candidate_id", candidate.id)
      .eq("status", "pending")
    if ((count ?? 0) >= 4) {
      return NextResponse.json(
        { error: "You already have requests open with this agency. They will respond to those first." },
        { status: 429 }
      )
    }

    const { error } = await admin.from("rights_requests").insert({
      agency_id: candidate.agency_id,
      candidate_id: candidate.id,
      candidate_ref: candidate.ref,
      kind,
      channel: "candidate",
      status: "pending",
      note,
    })
    if (error) throw error

    await writeAudit(admin, {
      agencyId: candidate.agency_id,
      roleId: candidate.role_id,
      candidateId: candidate.id,
      entityType: "rights_request",
      entityRef: candidate.ref,
      action: `requested_${kind}`,
      reason: note || undefined,
    })

    return NextResponse.json({ filed: true, kind }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
