/**
 * The recruiter's brief inbox: what hiring managers have asked to hire for.
 *
 * GET returns one row per brief in the caller's agency, newest first, with the
 * client it came from and the role it became once accepted. `?status=` narrows
 * it — `submitted` is the triage view the inbox opens on.
 *
 * The query itself lives in lib/agency/briefs (service-role, scoped to
 * ctx.agencyId), because role_briefs is audit-coupled and hiring managers hold
 * no RLS grants, so the tenancy filter has to sit somewhere it can be reviewed.
 * Route handlers never touch Supabase directly.
 *
 * Rows carry the client contact's name and company, exactly as
 * /api/agency/clients already does: it is the agency's own address book. It
 * must never reach a log line or an audit entity_ref.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, requireAgencyContext } from "@/lib/agency/db"
import { listBriefsForAgency } from "@/lib/agency/briefs"
import type { BriefStatus } from "@/lib/agency/types"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 15

const BRIEF_STATUSES: readonly string[] = ["submitted", "accepted", "declined"]

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

function isBriefStatus(value: string): value is BriefStatus {
  return BRIEF_STATUSES.includes(value)
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)

    // Absent and empty both mean "no filter" — the inbox's All tab builds the
    // query string unconditionally, and `?status=` should not be an error.
    const raw = req.nextUrl.searchParams.get("status")?.trim() ?? ""
    let status: BriefStatus | undefined
    if (raw) {
      // Rejected rather than ignored: an unknown status silently filtered to
      // nothing would render as "no briefs", which is a lie the recruiter
      // cannot see through.
      if (!isBriefStatus(raw)) {
        return NextResponse.json({ error: "Unknown brief status" }, { status: 400 })
      }
      status = raw
    }

    // A read: viewers see this like everything else.
    const briefs = await listBriefsForAgency(auth.ctx, status ? { status } : undefined)
    return NextResponse.json({ briefs })
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
