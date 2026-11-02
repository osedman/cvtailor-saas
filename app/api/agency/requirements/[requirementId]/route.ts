/**
 * Single requirement edits from the parse review screen. Audit coupled:
 * both handlers route through lib/agency/db, which writes the audit row
 * with parsed versus recruiter from/to values in the same operation.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  AgencyAccessError,
  deleteRequirement,
  requireAgencyContext,
  updateRequirement,
} from "@/lib/agency/db"
import type { Weight } from "@/lib/agency/types"
import { rescoreRole } from "@/lib/agency/rescore"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

export const maxDuration = 60

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

async function PATCH_handler(
  req: NextRequest,
  { params }: { params: Promise<{ requirementId: string }> }
) {
  try {
    const { requirementId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const body = await req.json()
    const patch: { text?: string; weight?: Weight; category?: string } = {}
    if (typeof body?.text === "string" && body.text.trim()) patch.text = body.text.trim().slice(0, 300)
    if (["must", "important", "nice"].includes(body?.weight)) patch.weight = body.weight
    if (typeof body?.category === "string") patch.category = body.category.slice(0, 60)
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
    }

    const requirement = await updateRequirement(
      auth.ctx,
      requirementId,
      patch,
      typeof body?.reason === "string" ? body.reason.slice(0, 300) : undefined
    )
    // A weight is role-wide: every candidate's fit moves with it (frame 41).
    const rescored = patch.weight && requirement?.role_id
      ? await rescoreRole(auth.ctx.agencyId, requirement.role_id as string)
      : 0
    return NextResponse.json({ requirement, rescored })
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

async function DELETE_handler(
  _req: NextRequest,
  { params }: { params: Promise<{ requirementId: string }> }
) {
  try {
    const { requirementId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const { role_id } = await deleteRequirement(auth.ctx, requirementId)
    // Removing a requirement changes every candidate's coverage too.
    const rescored = await rescoreRole(auth.ctx.agencyId, role_id)
    return NextResponse.json({ deleted: true, rescored })
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

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const PATCH = withTiming("/api/agency/requirements/[requirementId]", "PATCH", PATCH_handler)
export const DELETE = withTiming("/api/agency/requirements/[requirementId]", "DELETE", DELETE_handler)
