/**
 * Reading the agency's audit log.
 *
 * GET ?group=&roleId=&candidateId=
 *
 * Read-only by construction: agency.audit_log has no insert, update or delete
 * policy for anyone, and this route offers no verb that could write one. The
 * query runs on the USER-scoped client so the log's own RLS does the tenancy
 * work — nothing here needs to bypass it.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAgencyContext } from "@/lib/agency/db"
import { listAuditEntries, AUDIT_GROUPS } from "@/lib/agency/audit-view"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 20

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAgencyContext()
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
        { status: auth.failure === "unauthenticated" ? 401 : 403 }
      )
    }

    const url = new URL(req.url)
    const group = url.searchParams.get("group") ?? undefined
    // An unknown group would silently return everything, which on an audit
    // screen reads as "nothing was filtered" rather than "your filter broke".
    if (group && !AUDIT_GROUPS[group]) {
      return NextResponse.json({ error: "Unknown filter" }, { status: 400 })
    }

    const entries = await listAuditEntries(auth.db, auth.ctx, {
      group,
      roleId: url.searchParams.get("roleId") ?? undefined,
      candidateId: url.searchParams.get("candidateId") ?? undefined,
    })
    return NextResponse.json({ entries })
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    )
  }
}
