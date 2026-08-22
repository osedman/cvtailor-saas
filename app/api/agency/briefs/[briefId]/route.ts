/**
 * The recruiter's decision on one brief: accept it, or decline it.
 *
 * POST {"action":"accept"}                  → mints the job role the brief becomes
 * POST {"action":"decline","reason":"..."}  → records the decision, keeps the row
 *
 * Both decisions live in lib/agency/briefs, and both are audit-coupled: the
 * status change and the agency.audit_log row are written by the same operation,
 * through the service role, after the brief has been proved to belong to the
 * caller's agency. This handler validates the request and nothing else — it
 * never touches Supabase, and it never re-implements the tenancy check.
 *
 * Accept is idempotent, so this is a 200 rather than a 201: a double-click, a
 * retried request or a second recruiter gets the SAME role back instead of a
 * duplicate. That is why the response carries roleId and ref — the UI links
 * straight to the role whether it was just minted or already existed.
 *
 * Declining does not delete anything. The brief is the client's record of what
 * they asked for, and they are entitled to see the answer.
 *
 * The optional decline reason is the recruiter's own note. It reaches
 * audit_log.reason and nothing else: it is never echoed back, never logged, and
 * no part of the brief body ever follows it into the audit row.
 */

import { NextRequest, NextResponse } from "next/server"
import { AgencyAccessError, agencyAdmin, contextForAgency, requireAgencyContext } from "@/lib/agency/db"
import { acceptBrief, declineBrief } from "@/lib/agency/briefs"
import { errorMessage } from "@/lib/error-message"

export const maxDuration = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Recruiter-typed free text, bounded here so nothing unbounded is carried
 * around. briefs.ts caps it again before it reaches the audit row. */
const MAX_REASON = 2000

function authFail(failure: "unauthenticated" | "no_agency") {
  return NextResponse.json(
    { error: failure === "unauthenticated" ? "Unauthorised" : "No agency membership" },
    { status: failure === "unauthenticated" ? 401 : 403 }
  )
}

/** A missing or malformed body is a 400 by way of the action check below, not a
 * 500 out of the catch block. */
async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json()
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ briefId: string }> }) {
  try {
    const { briefId } = await params
    const auth = await requireAgencyContext()
    if (!auth.ok) return authFail(auth.failure)
    if (!UUID_RE.test(briefId)) {
      return NextResponse.json({ error: "Invalid brief" }, { status: 400 })
    }

    /**
     * The brief names its own agency; the AGENCY_COOKIE does not get a vote.
     *
     * The inbox now lists briefs across every agency the caller belongs to,
     * so acting on one must resolve the tenant from the BRIEF — otherwise
     * accepting a Halcyon brief while standing in Alpha would throw "not
     * found in your agency", which is both wrong and unexplainable.
     *
     * Tenancy is re-proven, not relaxed: this reads only the agency_id, and
     * contextForAgency refuses any agency the caller is not a member of. An
     * unknown brief id reads as not-found rather than confirming it exists.
     */
    const { data: owner } = await agencyAdmin()
      .from("role_briefs")
      .select("agency_id")
      .eq("id", briefId)
      .maybeSingle()
    if (!owner) {
      return NextResponse.json({ error: "brief not found in your agency" }, { status: 403 })
    }
    const ctx = contextForAgency(auth.ctx, owner.agency_id as string)

    // Checked AFTER the tenant is resolved: the role that matters is the one
    // held in the brief's agency, which may differ from the active one.
    if (ctx.role === "viewer") {
      return NextResponse.json({ error: "Viewers have read only access" }, { status: 403 })
    }

    const body = await readBody(req)
    const action = body.action
    if (action !== "accept" && action !== "decline") {
      return NextResponse.json(
        { error: "action must be 'accept' or 'decline'" },
        { status: 400 }
      )
    }

    if (action === "decline") {
      const reason =
        typeof body.reason === "string" ? body.reason.slice(0, MAX_REASON) : undefined
      // Throws AgencyAccessError for a brief outside the caller's agency, with
      // the same message it uses for one that has already been decided.
      await declineBrief(ctx, briefId, reason)
      return NextResponse.json({ declined: true })
    }

    const { roleId, ref } = await acceptBrief(ctx, briefId)
    return NextResponse.json({ accepted: true, roleId, ref, agencyId: ctx.agencyId })
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
