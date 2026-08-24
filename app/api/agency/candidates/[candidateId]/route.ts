/**
 * One candidate, for the candidate file — the operational screen that lives
 * OUTSIDE the shortlist workflow (compliance, references, placement; the
 * things a recruiter completes during interviews and handover).
 *
 * Identity and role context only. Compliance, references and placement each
 * have their own audit-coupled routes and the file's cards fetch them
 * directly — repeating them here would be a second door to the same rooms.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { derivePhase } from "@/lib/agency/phases"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const { data: candidate, error } = await auth.db
      .from("candidates")
      .select("id, ref, full_name, current_title, role_id, source, ingested_at, redacted")
      .eq("id", candidateId)
      .eq("agency_id", auth.ctx.agencyId)
      .maybeSingle()
    if (error) throw error
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })

    const [{ data: role }, submission, handover] = await Promise.all([
      auth.db
        .from("job_roles")
        .select("id, ref, title, company, status")
        .eq("id", candidate.role_id)
        .maybeSingle(),
      auth.db.from("submissions").select("id").eq("role_id", candidate.role_id).limit(1),
      auth.db.from("handover_packs").select("id").eq("role_id", candidate.role_id).limit(1),
    ])

    return NextResponse.json({
      candidate: {
        id: candidate.id,
        ref: candidate.ref,
        fullName: candidate.redacted ? "Erased at their request" : candidate.full_name,
        currentTitle: candidate.redacted ? "" : (candidate.current_title ?? ""),
        source: candidate.source ?? "",
        ingestedAt: candidate.ingested_at,
        redacted: Boolean(candidate.redacted),
      },
      role: role
        ? { id: role.id, ref: role.ref, title: role.title, company: role.company ?? "" }
        : null,
      phase:
        submission.error || handover.error
          ? null
          : derivePhase({
              hasSubmission: (submission.data ?? []).length > 0,
              hasHandoverPack: (handover.data ?? []).length > 0,
            }),
    })
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 })
  }
}
