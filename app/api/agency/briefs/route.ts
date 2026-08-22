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
import { AgencyAccessError, contextForAgency, requireAgencyContext } from "@/lib/agency/db"
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

    /**
     * ACROSS EVERY AGENCY THE CALLER BELONGS TO, not just the active one.
     *
     * A brief is the start of the whole workflow, and scoping the inbox to
     * the AGENCY_COOKIE meant a brief was invisible unless you had already
     * guessed which workspace to be standing in — four sat unseen for a week
     * that way. The cookie decides what the chrome shows; it should not
     * decide what work exists.
     *
     * Tenancy is unchanged: each list is fetched under a context re-scoped to
     * a membership the caller already holds (contextForAgency re-proves it),
     * so RLS applies exactly as before, once per agency.
     */
    const memberships = auth.ctx.memberships?.length
      ? auth.ctx.memberships
      : [{ agencyId: auth.ctx.agencyId, agencyName: auth.ctx.agencyName ?? "", role: auth.ctx.role }]

    const perAgency = await Promise.all(
      memberships.map(async (m) => {
        const rows = await listBriefsForAgency(
          contextForAgency(auth.ctx, m.agencyId),
          status ? { status } : undefined
        )
        return rows.map((b) => ({
          ...b,
          agencyId: m.agencyId,
          agencyName: m.agencyName,
          // The active workspace renders first and without a switch prompt.
          isActiveAgency: m.agencyId === auth.ctx.agencyId,
        }))
      })
    )

    const briefs = perAgency
      .flat()
      .sort(
        (a, b) =>
          Number(b.isActiveAgency) - Number(a.isActiveAgency) ||
          String(b.createdAt).localeCompare(String(a.createdAt))
      )
    return NextResponse.json({ briefs, activeAgencyId: auth.ctx.agencyId })
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
