/**
 * The recruiter's notice window (mockups/agency-notice.html, state 01).
 *
 * GET   — the candidate's notice state, for the countdown card.
 * PATCH — one of three actions inside the window:
 *   send_now          fire the notice immediately through the shared sender
 *   personal_note     set the personal line that rides on top of the email
 *   already_informed  suppress the send; requires a note of how the
 *                     candidate was told, which goes in the audit row so the
 *                     assertion is the agency's, on the record
 *
 * None of these can cancel a due notice: the only paths out of "scheduled"
 * are sent or a recorded suppression. The auto fire stays not optional.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  AgencyAccessError,
  agencyAdmin,
  assertWriter,
  requireAgencyContext,
  writeAudit,
} from "@/lib/agency/db"
import { sendOneNotice } from "@/lib/agency/notices"

export const maxDuration = 60

const NOTE_LIMIT = 500

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

async function loadNotice(candidateId: string, agencyId: string) {
  const admin = agencyAdmin()
  const { data: candidate, error } = await admin
    .from("candidates")
    .select("id, agency_id, role_id, ref")
    .eq("id", candidateId)
    .maybeSingle()
  if (error) throw error
  if (!candidate || candidate.agency_id !== agencyId) {
    throw new AgencyAccessError("candidate not found in caller's agency")
  }
  const { data: notice } = await admin
    .from("candidate_notices")
    .select("id, status, scheduled_for, sent_at, personal_note, suppressed_reason")
    .eq("candidate_id", candidateId)
    .maybeSingle()
  return { admin, candidate, notice }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const { notice } = await loadNotice(candidateId, auth.ctx.agencyId)
    return NextResponse.json({ notice })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
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
    const action = body?.action
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, NOTE_LIMIT) : ""

    const { admin, candidate, notice } = await loadNotice(candidateId, auth.ctx.agencyId)
    if (!notice) return NextResponse.json({ error: "No notice exists for this candidate" }, { status: 404 })

    if (action === "send_now") {
      if (notice.status !== "scheduled") {
        return NextResponse.json({ error: `Notice is already ${notice.status}` }, { status: 400 })
      }
      const outcome = await sendOneNotice(admin, notice.id)
      return NextResponse.json({ outcome })
    }

    if (action === "personal_note") {
      if (notice.status !== "scheduled") {
        return NextResponse.json({ error: "The notice has already gone; the note can no longer ride on it" }, { status: 400 })
      }
      const { error } = await admin
        .from("candidate_notices")
        .update({ personal_note: note })
        .eq("id", notice.id)
      if (error) throw error
      await writeAudit(admin, {
        agencyId: auth.ctx.agencyId,
        roleId: candidate.role_id,
        candidateId: candidate.id,
        actorId: auth.ctx.userId,
        entityType: "notice",
        entityRef: candidate.ref,
        action: "note_set",
        toValue: { personal_note: note },
      })
      return NextResponse.json({ personal_note: note })
    }

    if (action === "already_informed") {
      if (notice.status !== "scheduled") {
        return NextResponse.json({ error: `Notice is already ${notice.status}` }, { status: 400 })
      }
      if (note.length < 10) {
        return NextResponse.json(
          { error: "Record how the candidate was informed (at least a short sentence)" },
          { status: 400 }
        )
      }
      const { error } = await admin
        .from("candidate_notices")
        .update({
          status: "suppressed",
          suppressed_reason: "already_informed",
          suppressed_by: auth.ctx.userId,
        })
        .eq("id", notice.id)
      if (error) throw error
      // The assertion is the agency's, on the record with the actor's name.
      await writeAudit(admin, {
        agencyId: auth.ctx.agencyId,
        roleId: candidate.role_id,
        candidateId: candidate.id,
        actorId: auth.ctx.userId,
        entityType: "notice",
        entityRef: candidate.ref,
        action: "suppressed",
        reason: "already_informed",
        toValue: { how: note },
      })
      return NextResponse.json({ outcome: "suppressed_already_informed" })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    if (error instanceof AgencyAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
