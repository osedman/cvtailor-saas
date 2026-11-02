/**
 * How a role stands against its brief, for the hiring manager.
 *
 * Same computation as the recruiter's (roleBriefStatus), same words for the
 * same difference — one function writes it. Scoped by the caller's own
 * contact ids: the role must be one whose contact they hold.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireHiringContext } from "@/lib/agency/client-auth"
import type { HiringFailure } from "@/lib/agency/client-auth"
import { agencyAdmin } from "@/lib/agency/db"
import { roleBriefStatus } from "@/lib/agency/search-briefs"
import { normaliseBrief } from "@/lib/agency/brief-options"
import { errorMessage } from "@/lib/error-message"
import { withTiming } from "@/lib/server-timing"
import { revokedPairs, isCut } from "@/lib/agency/revocation"

export const maxDuration = 30

function authFail(failure: HiringFailure) {
  return NextResponse.json({ error: failure === "unauthenticated" ? "Unauthorised" : "No hiring link" }, { status: failure === "unauthenticated" ? 401 : 403 })
}

async function GET_handler(_req: NextRequest, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    const { roleId } = await params
    const auth = await requireHiringContext()
    if (!auth.ok) return authFail(auth.failure)
    const admin = agencyAdmin()
    const { data: role } = await admin.from("job_roles").select("agency_id, contact_id, brief_config").eq("id", roleId).maybeSingle()
    if (!role) return NextResponse.json({ error: "No such role" }, { status: 404 })
    const mine = auth.ctx.links.some((l) => l.agencyId === role.agency_id && l.contactId === role.contact_id)
    if (!mine) return NextResponse.json({ error: "Not your role" }, { status: 404 })
    // A revoked shortlist ends the role for this contact (lib/agency/revocation.ts).
    if (isCut(await revokedPairs([role.contact_id as string]), roleId, role.contact_id as string)) {
      return NextResponse.json({ error: "Not your role" }, { status: 404 })
    }
    const status = await roleBriefStatus(role.agency_id as string, roleId)
    // Round names for the stage bar, from the copied plan — not from the
    // live brief, which may have moved on.
    const roundNames = role.brief_config ? normaliseBrief(role.brief_config).rounds.map((r) => r.purpose) : []
    // The brief's job description is readable by the agency and the contact
    // the brief is addressed to (lib/agency/brief-files.ts). The role's
    // contact can be someone else at the client, so the file's name and id
    // stay off this route; the brief's own page is where the client reads it.
    const { jd: _jd, ...statusForClient } = status ?? ({} as NonNullable<typeof status>)
    void _jd
    return NextResponse.json({ status: status ? statusForClient : null, roundNames })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

// Server-Timing + the [slow] log (lib/server-timing.ts, 30 Sep 2026).
export const GET = withTiming("/api/hiring/roles/[roleId]/brief", "GET", GET_handler)
