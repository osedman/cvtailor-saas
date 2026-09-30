/**
 * Where the client is up to with the shortlist (Figma board 34, band B).
 *
 * GET → { progress: null } before anything has been sent, otherwise the five
 * steps the step-07 receipt shows, each read from the row that proves it:
 *
 *   delivered      submission_recipients (live, unrevoked)
 *   opened         submission_recipients.first_opened_at (portal or workspace)
 *   people chosen  client_actions, newest per candidate ref
 *   times offered  availability_slots (unrevoked)
 *   first interview interview_rounds (not cancelled)
 *
 * Counts and timestamps only — no names, no contact details — so this can be
 * polled by the screen without carrying anything personal.
 */

import { NextRequest, NextResponse } from "next/server"
import { agencyAdmin, getJobRole, requireAgencyContext } from "@/lib/agency/db"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

async function GET_handler(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    const role = await getJobRole(auth.db, auth.ctx, roleId)
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 })

    const admin = agencyAdmin()
    const agencyId = auth.ctx.agencyId
    const { data: subs, error: subError } = await admin
      .from("submissions")
      .select("id, generated_at, snapshot")
      .eq("agency_id", agencyId)
      .eq("role_id", roleId)
      .order("generated_at", { ascending: false })
    if (subError) throw subError
    if (!subs || subs.length === 0) return NextResponse.json({ progress: null })

    const latest = subs[0]
    const shortlisted = Array.isArray((latest.snapshot as { shortlisted?: unknown[] } | null)?.shortlisted)
      ? ((latest.snapshot as { shortlisted: unknown[] }).shortlisted.length)
      : 0

    const [recipientsRes, slotsRes, roundsRes] = await Promise.all([
      admin
        .from("submission_recipients")
        .select("id, created_at, first_opened_at, revoked_at")
        .eq("agency_id", agencyId)
        .in("submission_id", subs.map((s) => s.id as string)),
      admin
        .from("availability_slots")
        .select("created_at")
        .eq("agency_id", agencyId)
        .eq("role_id", roleId)
        .is("revoked_at", null)
        .order("created_at", { ascending: true }),
      admin
        .from("interview_rounds")
        .select("scheduled_at, status, created_at")
        .eq("agency_id", agencyId)
        .eq("role_id", roleId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true }),
    ])
    for (const r of [recipientsRes, slotsRes, roundsRes]) if (r.error) throw r.error

    const recipients = (recipientsRes.data ?? []).filter((r) => !r.revoked_at)
    const opened = recipients
      .map((r) => r.first_opened_at as string | null)
      .filter((v): v is string => Boolean(v))
      .sort()

    // Newest action per person, across every recipient the shortlist went to.
    let chosen = 0
    let decided = 0
    if (recipients.length > 0) {
      const { data: actions, error: actionError } = await admin
        .from("client_actions")
        .select("candidate_ref, action, created_at")
        .eq("agency_id", agencyId)
        .in("recipient_id", recipients.map((r) => r.id as string))
        .order("created_at", { ascending: false })
      if (actionError) throw actionError
      const latestByRef = new Map<string, string>()
      for (const a of actions ?? []) {
        const ref = (a.candidate_ref as string) ?? ""
        if (ref && a.action !== "question" && !latestByRef.has(ref)) latestByRef.set(ref, a.action as string)
      }
      decided = latestByRef.size
      chosen = [...latestByRef.values()].filter((v) => v === "interview" || v === "approve").length
    }

    const slots = slotsRes.data ?? []
    const rounds = roundsRes.data ?? []
    const firstRound = rounds.find((r) => r.scheduled_at) ?? rounds[0] ?? null

    return NextResponse.json({
      progress: {
        sentAt: latest.generated_at as string,
        sends: subs.length,
        shortlisted,
        recipients: recipients.length,
        openedAt: opened[0] ?? null,
        opened: opened.length,
        decided,
        chosen,
        slotsOffered: slots.length,
        firstSlotAt: (slots[0]?.created_at as string | undefined) ?? null,
        rounds: rounds.length,
        firstRoundAt: (firstRound?.scheduled_at as string | null | undefined) ?? null,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/agency/roles/[roleId]/submission/progress", "GET", GET_handler)
