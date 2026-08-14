/**
 * Agency settings: retention, and when candidates are told.
 *
 * GET   → current values plus whether the caller may change them
 * PATCH → owners only, audit logged
 *
 * Validation lives in lib/agency/settings beside the constants that mirror the
 * DB's CHECK constraints, so the message a person reads and the rule Postgres
 * enforces cannot drift apart.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { getAgencySettings, updateAgencySettings } from "@/lib/agency/settings"

export const maxDuration = 15

function authFail(f: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: f === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: f === "unauthenticated" ? 401 : 403 }
  )
}

export async function GET() {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    return NextResponse.json({ settings: await getAgencySettings(auth.ctx) })
  } catch (e) {
    if (e instanceof AgencyAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const settings = await updateAgencySettings(auth.ctx, {
      retentionDays:
        typeof body.retentionDays === "number" ? body.retentionDays : undefined,
      noticeDelayDays:
        typeof body.noticeDelayDays === "number" ? body.noticeDelayDays : undefined,
    })
    return NextResponse.json({ settings })
  } catch (e) {
    if (e instanceof AgencyAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
    // Validation messages here are written for the owner reading them.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save those settings" },
      { status: 400 }
    )
  }
}
