/**
 * Screening call state for one candidate.
 *
 * GET    — review + overrides + live score.
 * PATCH  — partial update: soft signals, call answers, notes, overrides map,
 *          status ('reviewed' / 'unreviewed'). Every change rescored
 *          immediately; overrides audit-logged per requirement.
 * DELETE — "Reset call": wipes the review and its overrides, audit-logged,
 *          rescored back to the CV-only picture.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  AgencyAccessError,
  agencyAdmin,
  assertWriter,
  requireAgencyContext,
  writeAudit,
} from "@/lib/agency/db"
import { applyOverrides, loadScoringState, recomputeAndStore } from "@/lib/agency/rescore"
import type { Strength } from "@/lib/agency/types"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

const TEXT_LIMITS = {
  availability: 300,
  salary_confirm: 300,
  notice_period: 300,
  notes: 8000,
} as const

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const [review, score] = await Promise.all([
      auth.db.from("candidate_reviews").select("*").eq("candidate_id", candidateId).maybeSingle(),
      auth.db.from("score_breakdowns").select("*").eq("candidate_id", candidateId).maybeSingle(),
    ])
    if (review.error) throw review.error

    let overrides: unknown[] = []
    if (review.data?.id) {
      const { data } = await auth.db
        .from("review_overrides")
        .select("requirement_id, from_strength, to_strength, reason, updated_at")
        .eq("review_id", review.data.id)
      overrides = data ?? []
    }

    return NextResponse.json({ review: review.data, overrides, score: score.data })
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    assertWriter(auth.ctx)

    const body = await req.json()
    const admin = agencyAdmin()
    const state = await loadScoringState(admin, auth.ctx.agencyId, candidateId)

    // Review-field changes (soft signals, texts, answers, status).
    const patch: Record<string, unknown> = {}
    for (const field of ["communication", "motivation"] as const) {
      if (field in body) {
        const v = body[field]
        patch[field] = v == null ? null : Math.min(5, Math.max(1, Math.round(Number(v))))
      }
    }
    for (const [field, limit] of Object.entries(TEXT_LIMITS)) {
      if (field in body && typeof body[field] === "string") {
        patch[field] = body[field].slice(0, limit)
      }
    }
    if ("call_answers" in body && body.call_answers && typeof body.call_answers === "object") {
      const answers: Record<string, string> = {}
      for (const [k, v] of Object.entries(body.call_answers as Record<string, unknown>)) {
        if (typeof v === "string") answers[k.slice(0, 10)] = v.slice(0, 4000)
      }
      patch.call_answers = answers
    }
    if (body.status === "reviewed" || body.status === "unreviewed") {
      patch.status = body.status
      patch.reviewed_at = body.status === "reviewed" ? new Date().toISOString() : null
    }

    if (Object.keys(patch).length > 0) {
      patch.recruiter_id = auth.ctx.userId
      const { error } = await admin.from("candidate_reviews").upsert(
        {
          agency_id: auth.ctx.agencyId,
          role_id: state.candidate.role_id,
          candidate_id: candidateId,
          ...patch,
        },
        { onConflict: "candidate_id" }
      )
      if (error) throw error

      if (patch.status === "reviewed") {
        await writeAudit(admin, {
          agencyId: auth.ctx.agencyId,
          roleId: state.candidate.role_id,
          candidateId,
          actorId: auth.ctx.userId,
          entityType: "candidate",
          entityRef: state.candidate.ref,
          action: "reviewed",
        })
      }
    }

    // Overrides map (may arrive alongside review fields). applyOverrides
    // rescores; otherwise rescore here.
    let score
    if (body.overrides && typeof body.overrides === "object") {
      score = await applyOverrides(
        auth.ctx,
        candidateId,
        body.overrides as Record<string, Strength | null>,
        typeof body.override_reason === "string" ? body.override_reason.slice(0, 500) : undefined
      )
    } else {
      score = await recomputeAndStore(admin, auth.ctx.agencyId, candidateId)
    }

    return NextResponse.json({ score })
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    assertWriter(auth.ctx)

    const admin = agencyAdmin()
    const state = await loadScoringState(admin, auth.ctx.agencyId, candidateId)

    if (state.reviewId) {
      // Overrides cascade with the review row.
      const { error } = await admin.from("candidate_reviews").delete().eq("id", state.reviewId)
      if (error) throw error
      await writeAudit(admin, {
        agencyId: auth.ctx.agencyId,
        roleId: state.candidate.role_id,
        candidateId,
        actorId: auth.ctx.userId,
        entityType: "candidate",
        entityRef: state.candidate.ref,
        action: "review_reset",
      })
    }

    const score = await recomputeAndStore(admin, auth.ctx.agencyId, candidateId)
    return NextResponse.json({ score })
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
